import k8sClient from '../lib/k8sClient.js';

function mapDeployment(dep) {
  return {
    name: dep.metadata.name,
    namespace: dep.metadata.namespace,
    uid: dep.metadata.uid,
    creationTimestamp: dep.metadata.creationTimestamp,
    labels: dep.metadata.labels || {},
    replicas: dep.spec?.replicas || 0,
    readyReplicas: dep.status?.readyReplicas || 0,
    availableReplicas: dep.status?.availableReplicas || 0,
    unavailableReplicas: dep.status?.unavailableReplicas || 0,
    updatedReplicas: dep.status?.updatedReplicas || 0,
    strategy: dep.spec?.strategy?.type || null,
    conditions: (dep.status?.conditions || []).map((c) => ({
      type: c.type,
      status: c.status,
      reason: c.reason || null,
      message: c.message || null,
      lastTransitionTime: c.lastTransitionTime || null,
    })),
  };
}

export const deploymentResolvers = {
  Query: {
    deployments: async (_, { namespace }) => {
      const api = k8sClient.getAppsV1Api();
      const res = namespace
        ? await api.listNamespacedDeployment(namespace)
        : await api.listDeploymentForAllNamespaces();
      return res.body.items.map(mapDeployment);
    },
    deployment: async (_, { name, namespace = 'default' }) => {
      const api = k8sClient.getAppsV1Api();
      const res = await api.readNamespacedDeployment(name, namespace);
      return mapDeployment(res.body);
    },
  },
};
