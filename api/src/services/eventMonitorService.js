import k8sClient from '../config/kubernetes.js';
import gotifyService from './gotifyService.js';
import logger from '../utils/logger.js';

// Track pod states to detect changes
const podStates = new Map();
const deploymentStates = new Map();

// Debounce notifications - don't spam for rapid events
const recentNotifications = new Map();
const NOTIFICATION_COOLDOWN = 60000; // 1 minute cooldown per pod/deployment

class EventMonitorService {
  constructor() {
    this.isRunning = false;
    this.pollInterval = null;
  }

  /**
   * Start monitoring Kubernetes events
   */
  start() {
    if (this.isRunning) {
      logger.info('Event monitor is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting Kubernetes event monitor');

    // Poll every 10 seconds
    this.pollInterval = setInterval(() => this.checkEvents(), 10000);

    // Initial check
    this.checkEvents();
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isRunning = false;
    logger.info('Stopped Kubernetes event monitor');
  }

  /**
   * Check for pod and deployment events
   */
  async checkEvents() {
    try {
      await Promise.all([
        this.checkPodEvents(),
        this.checkDeploymentEvents(),
      ]);
    } catch (error) {
      logger.error('Error checking events:', error.message);
    }
  }

  /**
   * Check for pod status changes
   */
  async checkPodEvents() {
    try {
      const coreV1Api = k8sClient.getCoreV1Api();
      const response = await coreV1Api.listNamespacedPod(
        'default',
        undefined,
        undefined,
        undefined,
        undefined,
        'portfolio=true'
      );

      for (const pod of response.body.items) {
        const podName = pod.metadata.name;
        const currentState = this.getPodState(pod);
        const previousState = podStates.get(podName);

        if (previousState && this.shouldNotifyPodChange(previousState, currentState, podName)) {
          await this.sendPodNotification(podName, previousState, currentState);
        }

        podStates.set(podName, currentState);
      }

      // Check for deleted pods
      const currentPodNames = new Set(response.body.items.map(p => p.metadata.name));
      for (const [podName, state] of podStates) {
        if (!currentPodNames.has(podName) && state.phase !== 'Deleted') {
          // Pod was deleted
          const newState = { phase: 'Deleted', restartCount: 0, reason: 'Deleted' };
          if (this.shouldNotifyPodChange(state, newState, podName)) {
            await this.sendPodNotification(podName, state, newState);
          }
          podStates.delete(podName);
        }
      }
    } catch (error) {
      logger.debug('Error checking pod events:', error.message);
    }
  }

  /**
   * Check for deployment changes
   */
  async checkDeploymentEvents() {
    try {
      const appsV1Api = k8sClient.getAppsV1Api();
      const response = await appsV1Api.listNamespacedDeployment(
        'default',
        undefined,
        undefined,
        undefined,
        undefined,
        'portfolio=true'
      );

      for (const deployment of response.body.items) {
        const deploymentName = deployment.metadata.name;
        const currentState = this.getDeploymentState(deployment);
        const previousState = deploymentStates.get(deploymentName);

        if (previousState && this.shouldNotifyDeploymentChange(previousState, currentState, deploymentName)) {
          await this.sendDeploymentNotification(deploymentName, previousState, currentState);
        }

        deploymentStates.set(deploymentName, currentState);
      }
    } catch (error) {
      logger.debug('Error checking deployment events:', error.message);
    }
  }

  /**
   * Extract relevant pod state
   */
  getPodState(pod) {
    const containerStatuses = pod.status.containerStatuses || [];
    const restartCount = containerStatuses.reduce((sum, c) => sum + (c.restartCount || 0), 0);

    let reason = pod.status.phase;
    for (const status of containerStatuses) {
      if (status.state?.waiting?.reason) {
        reason = status.state.waiting.reason;
        break;
      }
      if (status.state?.terminated?.reason) {
        reason = status.state.terminated.reason;
        break;
      }
    }

    return {
      phase: pod.status.phase,
      restartCount,
      reason,
      ready: containerStatuses.every(c => c.ready),
    };
  }

  /**
   * Extract relevant deployment state
   */
  getDeploymentState(deployment) {
    return {
      replicas: deployment.spec.replicas || 0,
      availableReplicas: deployment.status.availableReplicas || 0,
      readyReplicas: deployment.status.readyReplicas || 0,
      updatedReplicas: deployment.status.updatedReplicas || 0,
    };
  }

  /**
   * Check if we should send a notification for this pod change
   */
  shouldNotifyPodChange(previous, current, podName) {
    // Check cooldown
    const cooldownKey = `pod:${podName}`;
    const lastNotification = recentNotifications.get(cooldownKey);
    if (lastNotification && Date.now() - lastNotification < NOTIFICATION_COOLDOWN) {
      return false;
    }

    // Notify on phase changes
    if (previous.phase !== current.phase) {
      return true;
    }

    // Notify on restart (but only if count increased)
    if (current.restartCount > previous.restartCount) {
      return true;
    }

    // Notify on crash loop
    if (current.reason === 'CrashLoopBackOff' && previous.reason !== 'CrashLoopBackOff') {
      return true;
    }

    // Notify on OOMKilled
    if (current.reason === 'OOMKilled' && previous.reason !== 'OOMKilled') {
      return true;
    }

    return false;
  }

  /**
   * Check if we should send a notification for this deployment change
   */
  shouldNotifyDeploymentChange(previous, current, deploymentName) {
    // Check cooldown
    const cooldownKey = `deployment:${deploymentName}`;
    const lastNotification = recentNotifications.get(cooldownKey);
    if (lastNotification && Date.now() - lastNotification < NOTIFICATION_COOLDOWN) {
      return false;
    }

    // Notify on replica changes
    if (previous.replicas !== current.replicas) {
      return true;
    }

    // Notify when deployment becomes unavailable
    if (previous.availableReplicas > 0 && current.availableReplicas === 0) {
      return true;
    }

    return false;
  }

  /**
   * Send notification for pod change
   */
  async sendPodNotification(podName, previous, current) {
    const cooldownKey = `pod:${podName}`;
    recentNotifications.set(cooldownKey, Date.now());

    let title = `Pod: ${podName}`;
    let message = '';
    let priority = 5;

    if (current.phase === 'Failed' || current.reason === 'CrashLoopBackOff') {
      title = `Pod Failed: ${podName}`;
      message = `Status: ${current.reason || current.phase}`;
      priority = 8;
    } else if (current.reason === 'OOMKilled') {
      title = `Pod OOMKilled: ${podName}`;
      message = 'Container was killed due to out of memory';
      priority = 8;
    } else if (current.restartCount > previous.restartCount) {
      title = `Pod Restarted: ${podName}`;
      message = `Restart count: ${current.restartCount} (was ${previous.restartCount})`;
      priority = 5;
    } else if (current.phase === 'Deleted') {
      title = `Pod Deleted: ${podName}`;
      message = `Previous status: ${previous.phase}`;
      priority = 5;
    } else if (current.phase === 'Running' && previous.phase !== 'Running') {
      title = `Pod Running: ${podName}`;
      message = `Pod is now running (was ${previous.phase})`;
      priority = 3;
    } else {
      title = `Pod Status: ${podName}`;
      message = `${previous.phase} -> ${current.phase}`;
      priority = 5;
    }

    try {
      await gotifyService.sendMessage(title, message, priority);
      logger.info(`Sent pod notification: ${title}`);
    } catch (error) {
      logger.error(`Failed to send pod notification: ${error.message}`);
    }
  }

  /**
   * Send notification for deployment change
   */
  async sendDeploymentNotification(deploymentName, previous, current) {
    const cooldownKey = `deployment:${deploymentName}`;
    recentNotifications.set(cooldownKey, Date.now());

    let title = `Deployment: ${deploymentName}`;
    let message = '';
    let priority = 5;

    if (previous.replicas !== current.replicas) {
      const direction = current.replicas > previous.replicas ? 'scaled up' : 'scaled down';
      title = `Deployment Scaled: ${deploymentName}`;
      message = `Replicas ${direction}: ${previous.replicas} -> ${current.replicas}`;
      priority = 5;
    } else if (previous.availableReplicas > 0 && current.availableReplicas === 0) {
      title = `Deployment Unavailable: ${deploymentName}`;
      message = 'No replicas are available';
      priority = 8;
    }

    try {
      await gotifyService.sendMessage(title, message, priority);
      logger.info(`Sent deployment notification: ${title}`);
    } catch (error) {
      logger.error(`Failed to send deployment notification: ${error.message}`);
    }
  }
}

export default new EventMonitorService();
