import k8sClient from '../lib/k8sClient.js';

function mapService(svc) {
  return {
    name: svc.metadata.name,
    namespace: svc.metadata.namespace,
    uid: svc.metadata.uid,
    type: svc.spec.type,
    clusterIP: svc.spec.clusterIP || null,
    ports: (svc.spec.ports || []).map((p) => ({
      name: p.name || null,
      port: p.port,
      targetPort: String(p.targetPort),
      protocol: p.protocol || 'TCP',
      nodePort: p.nodePort || null,
    })),
    selector: svc.spec.selector || {},
    creationTimestamp: svc.metadata.creationTimestamp,
  };
}

export const serviceResolvers = {
  Query: {
    services: async (_, { namespace }) => {
      const api = k8sClient.getCoreV1Api();
      const res = namespace
        ? await api.listNamespacedService(namespace)
        : await api.listServiceForAllNamespaces();
      return res.body.items.map(mapService);
    },
    service: async (_, { name, namespace = 'default' }) => {
      const api = k8sClient.getCoreV1Api();
      const res = await api.readNamespacedService(name, namespace);
      return mapService(res.body);
    },
  },
};
