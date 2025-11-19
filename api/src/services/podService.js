import k8sClient from '../config/kubernetes.js';
import logger from '../utils/logger.js';

class PodService {
  async getAllPods(namespace = 'default') {
    try {
      const coreV1Api = k8sClient.getCoreV1Api();
      const response = await coreV1Api.listNamespacedPod(namespace);

      return response.body.items.map(pod => ({
        name: pod.metadata.name,
        namespace: pod.metadata.namespace,
        status: pod.status.phase,
        podIP: pod.status.podIP,
        hostIP: pod.status.hostIP,
        startTime: pod.status.startTime,
        labels: pod.metadata.labels,
        containers: pod.spec.containers.map(container => ({
          name: container.name,
          image: container.image,
          ports: container.ports || [],
        })),
        containerStatuses: pod.status.containerStatuses?.map(status => ({
          name: status.name,
          ready: status.ready,
          restartCount: status.restartCount,
          state: status.state,
        })) || [],
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
        name: pod.metadata.name,
        namespace: pod.metadata.namespace,
        status: pod.status.phase,
        podIP: pod.status.podIP,
        startTime: pod.status.startTime,
        labels: pod.metadata.labels,
        app: pod.metadata.labels?.app || 'unknown',
        component: pod.metadata.labels?.component || null,
        tier: pod.metadata.labels?.tier || 'unknown',
        containers: pod.spec.containers.map(container => ({
          name: container.name,
          image: container.image,
          ports: container.ports || [],
        })),
        containerStatuses: pod.status.containerStatuses?.map(status => ({
          name: status.name,
          ready: status.ready,
          restartCount: status.restartCount,
          state: status.state,
        })) || [],
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
        name: pod.metadata.name,
        namespace: pod.metadata.namespace,
        status: pod.status.phase,
        podIP: pod.status.podIP,
        hostIP: pod.status.hostIP,
        startTime: pod.status.startTime,
        labels: pod.metadata.labels,
        annotations: pod.metadata.annotations,
        containers: pod.spec.containers.map(container => ({
          name: container.name,
          image: container.image,
          ports: container.ports || [],
          env: container.env || [],
          resources: container.resources || {},
        })),
        containerStatuses: pod.status.containerStatuses?.map(status => ({
          name: status.name,
          ready: status.ready,
          restartCount: status.restartCount,
          state: status.state,
          image: status.image,
          imageID: status.imageID,
        })) || [],
        conditions: pod.status.conditions || [],
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
}

export default new PodService();
