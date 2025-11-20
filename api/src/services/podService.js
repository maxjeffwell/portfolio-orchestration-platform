import k8sClient from '../config/kubernetes.js';
import logger from '../utils/logger.js';

class PodService {
  async getAllPods(namespace = 'default') {
    try {
      const coreV1Api = k8sClient.getCoreV1Api();
      const response = await coreV1Api.listNamespacedPod(namespace);

      return response.body.items.map(pod => ({
        metadata: {
          name: pod.metadata.name,
          namespace: pod.metadata.namespace,
          uid: pod.metadata.uid,
          creationTimestamp: pod.metadata.creationTimestamp,
          labels: pod.metadata.labels,
        },
        status: {
          phase: pod.status.phase,
          podIP: pod.status.podIP,
          hostIP: pod.status.hostIP,
          startTime: pod.status.startTime,
          containerStatuses: pod.status.containerStatuses?.map(status => ({
            name: status.name,
            ready: status.ready,
            restartCount: status.restartCount,
            state: status.state,
          })) || [],
        },
        spec: {
          containers: pod.spec.containers.map(container => ({
            name: container.name,
            image: container.image,
            ports: container.ports || [],
          })),
        },
      }));
    } catch (error) {
      logger.error(`Error getting pods in namespace ${namespace}:`, error);
      throw error;
    }
  }

  async getPortfolioPods() {
    try {
      const coreV1Api = k8sClient.getCoreV1Api();
      const response = await coreV1Api.listNamespacedPod('default', undefined, undefined, undefined, undefined, 'portfolio=true');

      return response.body.items.map(pod => ({
        metadata: {
          name: pod.metadata.name,
          namespace: pod.metadata.namespace,
          uid: pod.metadata.uid,
          creationTimestamp: pod.metadata.creationTimestamp,
          labels: pod.metadata.labels,
        },
        status: {
          phase: pod.status.phase,
          podIP: pod.status.podIP,
          hostIP: pod.status.hostIP,
          startTime: pod.status.startTime,
          containerStatuses: pod.status.containerStatuses?.map(status => ({
            name: status.name,
            ready: status.ready,
            restartCount: status.restartCount,
            state: status.state,
          })) || [],
        },
        spec: {
          containers: pod.spec.containers.map(container => ({
            name: container.name,
            image: container.image,
            ports: container.ports || [],
          })),
        },
      }));
    } catch (error) {
      logger.error('Error getting portfolio pods:', error);
      throw error;
    }
  }

  async getPodByName(name, namespace = 'default') {
    try {
      const coreV1Api = k8sClient.getCoreV1Api();
      const response = await coreV1Api.readNamespacedPod(name, namespace);

      const pod = response.body;
      return {
        metadata: {
          name: pod.metadata.name,
          namespace: pod.metadata.namespace,
          uid: pod.metadata.uid,
          creationTimestamp: pod.metadata.creationTimestamp,
          labels: pod.metadata.labels,
          annotations: pod.metadata.annotations,
        },
        status: {
          phase: pod.status.phase,
          podIP: pod.status.podIP,
          hostIP: pod.status.hostIP,
          startTime: pod.status.startTime,
          conditions: pod.status.conditions || [],
          containerStatuses: pod.status.containerStatuses?.map(status => ({
            name: status.name,
            ready: status.ready,
            restartCount: status.restartCount,
            state: status.state,
            image: status.image,
            imageID: status.imageID,
          })) || [],
        },
        spec: {
          containers: pod.spec.containers.map(container => ({
            name: container.name,
            image: container.image,
            ports: container.ports || [],
            env: container.env || [],
            resources: container.resources || {},
          })),
        },
      };
    } catch (error) {
      logger.error(`Error getting pod ${name} in namespace ${namespace}:`, error);
      throw error;
    }
  }

  async getPodLogs(name, namespace = 'default', containerName = null, tailLines = 100) {
    try {
      const coreV1Api = k8sClient.getCoreV1Api();
      const response = await coreV1Api.readNamespacedPodLog(
        name,
        namespace,
        containerName,
        false, // follow
        undefined, // insecureSkipTLSVerifyBackend
        undefined, // limitBytes
        false, // pretty
        false, // previous
        undefined, // sinceSeconds
        tailLines, // tailLines
        false // timestamps
      );

      return {
        logs: response.body,
        pod: name,
        namespace,
        container: containerName,
      };
    } catch (error) {
      logger.error(`Error getting logs for pod ${name}:`, error);
      throw error;
    }
  }

  async deletePod(name, namespace = 'default') {
    try {
      const coreV1Api = k8sClient.getCoreV1Api();
      await coreV1Api.deleteNamespacedPod(name, namespace);

      logger.info(`Pod ${name} deleted from namespace ${namespace}`);
      return { success: true, message: `Pod ${name} deleted successfully` };
    } catch (error) {
      logger.error(`Error deleting pod ${name}:`, error);
      throw error;
    }
  }

  async restartPod(name, namespace = 'default') {
    try {
      // Restarting a pod is the same as deleting it (if part of deployment/statefulset, it will be recreated)
      const coreV1Api = k8sClient.getCoreV1Api();
      await coreV1Api.deleteNamespacedPod(name, namespace);

      logger.info(`Pod ${name} restarted (deleted) in namespace ${namespace}`);
      return { success: true, message: `Pod ${name} restarted successfully` };
    } catch (error) {
      logger.error(`Error restarting pod ${name}:`, error);
      throw error;
    }
  }
}

export default new PodService();
