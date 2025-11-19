import k8s from '@kubernetes/client-node';
import logger from '../utils/logger.js';

class KubernetesClient {
  constructor() {
    this.kc = new k8s.KubeConfig();
    this.initialized = false;
  }

  initialize() {
    try {
      // Load kubeconfig from default location or environment variable
      if (process.env.KUBECONFIG_PATH) {
        logger.info(`Loading kubeconfig from ${process.env.KUBECONFIG_PATH}`);
        this.kc.loadFromFile(process.env.KUBECONFIG_PATH);
      } else {
        logger.info('Loading kubeconfig from default location');
        this.kc.loadFromDefault();
      }

      // Initialize API clients
      this.coreV1Api = this.kc.makeApiClient(k8s.CoreV1Api);
      this.appsV1Api = this.kc.makeApiClient(k8s.AppsV1Api);
      this.metricsClient = new k8s.Metrics(this.kc);

      this.initialized = true;
      logger.info('Kubernetes client initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Kubernetes client:', error);
      throw error;
    }
  }

  getCoreV1Api() {
    if (!this.initialized) {
      throw new Error('Kubernetes client not initialized');
    }
    return this.coreV1Api;
  }

  getAppsV1Api() {
    if (!this.initialized) {
      throw new Error('Kubernetes client not initialized');
    }
    return this.appsV1Api;
  }

  getMetricsClient() {
    if (!this.initialized) {
      throw new Error('Kubernetes client not initialized');
    }
    return this.metricsClient;
  }

  getCurrentContext() {
    return this.kc.getCurrentContext();
  }
}

// Export singleton instance
const k8sClient = new KubernetesClient();
export default k8sClient;
