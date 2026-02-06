import k8s from '@kubernetes/client-node';

class KubernetesClient {
  constructor() {
    this.kc = new k8s.KubeConfig();
    this.initialized = false;
  }

  initialize() {
    if (process.env.KUBERNETES_SERVICE_HOST) {
      console.log('Loading in-cluster kubeconfig');
      this.kc.loadFromCluster();
    } else if (process.env.KUBECONFIG_PATH) {
      console.log(`Loading kubeconfig from ${process.env.KUBECONFIG_PATH}`);
      this.kc.loadFromFile(process.env.KUBECONFIG_PATH);
    } else {
      console.log('Loading kubeconfig from default location');
      this.kc.loadFromDefault();
    }

    this.coreV1Api = this.kc.makeApiClient(k8s.CoreV1Api);
    this.appsV1Api = this.kc.makeApiClient(k8s.AppsV1Api);
    this.metricsClient = new k8s.Metrics(this.kc);

    this.initialized = true;
    console.log('Kubernetes client initialized successfully');
  }

  getCoreV1Api() {
    if (!this.initialized) throw new Error('Kubernetes client not initialized');
    return this.coreV1Api;
  }

  getAppsV1Api() {
    if (!this.initialized) throw new Error('Kubernetes client not initialized');
    return this.appsV1Api;
  }

  getMetricsClient() {
    if (!this.initialized) throw new Error('Kubernetes client not initialized');
    return this.metricsClient;
  }

  getCurrentContext() {
    return this.kc.getCurrentContext();
  }
}

const k8sClient = new KubernetesClient();
export default k8sClient;
