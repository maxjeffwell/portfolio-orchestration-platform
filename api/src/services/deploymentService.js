import k8sClient from '../config/kubernetes.js';
import logger from '../utils/logger.js';

class DeploymentService {
  async getAllDeployments(namespace = 'default') {
    try {
      const appsV1Api = k8sClient.getAppsV1Api();
      const response = await appsV1Api.listNamespacedDeployment(namespace);

      return response.body.items.map(deployment => ({
        metadata: {
          name: deployment.metadata.name,
          namespace: deployment.metadata.namespace,
          uid: deployment.metadata.uid,
          creationTimestamp: deployment.metadata.creationTimestamp,
          labels: deployment.metadata.labels,
        },
        spec: {
          replicas: deployment.spec.replicas,
          selector: deployment.spec.selector,
          strategy: deployment.spec.strategy,
        },
        status: {
          replicas: deployment.status.replicas || 0,
          readyReplicas: deployment.status.readyReplicas || 0,
          availableReplicas: deployment.status.availableReplicas || 0,
          unavailableReplicas: deployment.status.unavailableReplicas || 0,
          updatedReplicas: deployment.status.updatedReplicas || 0,
          conditions: deployment.status.conditions || [],
        },
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
        metadata: {
          name: deployment.metadata.name,
          namespace: deployment.metadata.namespace,
          uid: deployment.metadata.uid,
          creationTimestamp: deployment.metadata.creationTimestamp,
          labels: deployment.metadata.labels,
        },
        spec: {
          replicas: deployment.spec.replicas,
          selector: deployment.spec.selector,
          strategy: deployment.spec.strategy,
        },
        status: {
          replicas: deployment.status.replicas || 0,
          readyReplicas: deployment.status.readyReplicas || 0,
          availableReplicas: deployment.status.availableReplicas || 0,
          unavailableReplicas: deployment.status.unavailableReplicas || 0,
          updatedReplicas: deployment.status.updatedReplicas || 0,
          conditions: deployment.status.conditions || [],
        },
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
        metadata: {
          name: deployment.metadata.name,
          namespace: deployment.metadata.namespace,
          uid: deployment.metadata.uid,
          creationTimestamp: deployment.metadata.creationTimestamp,
          labels: deployment.metadata.labels,
          annotations: deployment.metadata.annotations,
        },
        spec: {
          replicas: deployment.spec.replicas,
          selector: deployment.spec.selector,
          strategy: deployment.spec.strategy,
          template: {
            spec: {
              containers: deployment.spec.template.spec.containers.map(container => ({
                name: container.name,
                image: container.image,
                ports: container.ports || [],
                env: container.env || [],
                resources: container.resources || {},
              })),
            },
          },
        },
        status: {
          replicas: deployment.status.replicas || 0,
          readyReplicas: deployment.status.readyReplicas || 0,
          availableReplicas: deployment.status.availableReplicas || 0,
          unavailableReplicas: deployment.status.unavailableReplicas || 0,
          updatedReplicas: deployment.status.updatedReplicas || 0,
          conditions: deployment.status.conditions || [],
        },
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

      // Use patch instead of replace to avoid conflicts
      const patch = {
        spec: {
          template: {
            metadata: {
              annotations: {
                'kubectl.kubernetes.io/restartedAt': new Date().toISOString()
              }
            }
          }
        }
      };

      const options = {
        headers: { 'Content-Type': 'application/strategic-merge-patch+json' }
      };

      await appsV1Api.patchNamespacedDeployment(
        name,
        namespace,
        patch,
        undefined, // pretty
        undefined, // dryRun
        undefined, // fieldManager
        undefined, // fieldValidation
        undefined, // force
        options
      );

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
