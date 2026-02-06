import k8sClient from '../lib/k8sClient.js';

function mapPod(pod) {
  const statuses = pod.status?.containerStatuses || [];
  return {
    name: pod.metadata.name,
    namespace: pod.metadata.namespace,
    uid: pod.metadata.uid,
    phase: pod.status?.phase || 'Unknown',
    podIP: pod.status?.podIP || null,
    hostIP: pod.status?.hostIP || null,
    startTime: pod.status?.startTime || null,
    creationTimestamp: pod.metadata.creationTimestamp,
    labels: pod.metadata.labels || {},
    containers: statuses.map((cs) => ({
      name: cs.name,
      image: cs.image,
      ready: cs.ready,
      restartCount: cs.restartCount,
      state: Object.keys(cs.state || {})[0] || 'unknown',
      ports: (pod.spec?.containers?.find((c) => c.name === cs.name)?.ports || []).map((p) => ({
        name: p.name || null,
        containerPort: p.containerPort,
        protocol: p.protocol || 'TCP',
      })),
    })),
    conditions: (pod.status?.conditions || []).map((c) => ({
      type: c.type,
      status: c.status,
      lastTransitionTime: c.lastTransitionTime || null,
    })),
  };
}

export const podResolvers = {
  Query: {
    pods: async (_, { namespace }) => {
      const api = k8sClient.getCoreV1Api();
      const res = namespace
        ? await api.listNamespacedPod(namespace)
        : await api.listPodForAllNamespaces();
      return res.body.items.map(mapPod);
    },
    pod: async (_, { name, namespace = 'default' }) => {
      const api = k8sClient.getCoreV1Api();
      const res = await api.readNamespacedPod(name, namespace);
      return mapPod(res.body);
    },
  },
};
