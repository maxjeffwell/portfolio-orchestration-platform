import k8sClient from '../lib/k8sClient.js';

function mapNamespace(ns) {
  return {
    name: ns.metadata.name,
    uid: ns.metadata.uid,
    status: ns.status?.phase || 'Unknown',
    creationTimestamp: ns.metadata.creationTimestamp,
    labels: ns.metadata.labels || {},
  };
}

export const namespaceResolvers = {
  Query: {
    namespaces: async () => {
      const api = k8sClient.getCoreV1Api();
      const res = await api.listNamespace();
      return res.body.items.map(mapNamespace);
    },
  },
};
