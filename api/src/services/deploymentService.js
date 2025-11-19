import k8sClient from '../config/kubernetes.js';
import logger from '../utils/logger.js';

class DeploymentService {
  async getAllDeployments(namespace = 'default') {
    try {
      const appsV1Api = k8sClient.getAppsV1Api();
      const response = await appsV1Api.listNamespacedDeployment(namespace);

      return response.body.items.map(deployment => ({
        name: deployment.metadata.name,
        namespace: deployment.metadata.namespace,
        replicas: {
          desired: deployment.spec.replicas,
          ready: deployment.status.readyReplicas || 0,
          available: deployment.status.availableReplicas || 0,
          unavailable: deployment.status.unavailableReplicas || 0,
        },
        labels: deployment.metadata.labels,
        selector: deployment.spec.selector.matchLabels,
        strategy: deployment.spec.strategy.type,
        creationTimestamp: deployment.metadata.creationTimestamp,
      }));
    } catch (error) {
      logger.error(`Error getting deployments in namespace ${namespace}:`, error);
      throw error;
    }
  }

  async getPortfolioDeployments() {
    try {
      const appsV1Api = k8sClient.getAppsV1Api();
      const response = await appsV1Api.listNamespacedDeployment('default', undefined, undefined, undefined, undefined, 'portfolio=true');

      return response.body.items.map(deployment => ({
        name: deployment.metadata.name,
        namespace: deployment.metadata.namespace,
        app: deployment.metadata.labels?.app || 'unknown',
        component: deployment.metadata.labels?.component || null,
        tier: deployment.metadata.labels?.tier || 'unknown',
        replicas: {
          desired: deployment.spec.replicas,
          ready: deployment.status.readyReplicas || 0,
          available: deployment.status.availableReplicas || 0,
          unavailable: deployment.status.unavailableReplicas || 0,
        },
        labels: deployment.metadata.labels,
        selector: deployment.spec.selector.matchLabels,
        strategy: deployment.spec.strategy.type,
        creationTimestamp: deployment.metadata.creationTimestamp,
        conditions: deployment.status.conditions || [],
      }));
    } catch (error) {
      logger.error('Error getting portfolio deployments:', error);
      throw error;
    }
  }

  async getDeploymentByName(name, namespace = 'default') {
    try {
      const appsV1Api = k8sClient.getAppsV1Api();
      const response = await appsV1Api.readNamespacedDeployment(name, namespace);

      const deployment = response.body;
      return {
        name: deployment.metadata.name,
        namespace: deployment.metadata.namespace,
        replicas: {
          desired: deployment.spec.replicas,
          ready: deployment.status.readyReplicas || 0,
          available: deployment.status.availableReplicas || 0,
          unavailable: deployment.status.unavailableReplicas || 0,
          updated: deployment.status.updatedReplicas || 0,
        },
        labels: deployment.metadata.labels,
        annotations: deployment.metadata.annotations,
        selector: deployment.spec.selector.matchLabels,
        strategy: {
          type: deployment.spec.strategy.type,
          ...deployment.spec.strategy.rollingUpdate,
        },
        containers: deployment.spec.template.spec.containers.map(container => ({
          name: container.name,
          image: container.image,
          ports: container.ports || [],
          env: container.env || [],
          resources: container.resources || {},
        })),
        conditions: deployment.status.conditions || [],
        creationTimestamp: deployment.metadata.creationTimestamp,
      };
    } catch (error) {
      logger.error(`Error getting deployment ${name} in namespace ${namespace}:`, error);
      throw error;
    }
  }

  async scaleDeployment(name, namespace = 'default', replicas) {
    try {
      const appsV1Api = k8sClient.getAppsV1Api();

      // Get current deployment
      const currentDeployment = await appsV1Api.readNamespacedDeployment(name, namespace);

      // Update replicas
      currentDeployment.body.spec.replicas = replicas;

      // Apply the update
      await appsV1Api.replaceNamespacedDeployment(name, namespace, currentDeployment.body);

      logger.info(`Deployment ${name} scaled to ${replicas} replicas`);
      return {
        success: true,
        message: `Deployment ${name} scaled to ${replicas} replicas`,
        replicas,
      };
    } catch (error) {
      logger.error(`Error scaling deployment ${name}:`, error);
      throw error;
    }
  }

  async restartDeployment(name, namespace = 'default') {
    try {
      const appsV1Api = k8sClient.getAppsV1Api();

      // Get current deployment
      const deployment = await appsV1Api.readNamespacedDeployment(name, namespace);

      // Add/update restart annotation to trigger rolling restart
      if (!deployment.body.spec.template.metadata.annotations) {
        deployment.body.spec.template.metadata.annotations = {};
      }
      deployment.body.spec.template.metadata.annotations['kubectl.kubernetes.io/restartedAt'] = new Date().toISOString();

      // Apply the update
      await appsV1Api.replaceNamespacedDeployment(name, namespace, deployment.body);

      logger.info(`Deployment ${name} restarted`);
      return {
        success: true,
        message: `Deployment ${name} restarted successfully`,
      };
    } catch (error) {
      logger.error(`Error restarting deployment ${name}:`, error);
      throw error;
    }
  }
}

export default new DeploymentService();
