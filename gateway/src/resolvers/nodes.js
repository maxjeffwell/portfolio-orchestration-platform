import k8sClient from '../lib/k8sClient.js';

function mapNode(node) {
  return {
    name: node.metadata.name,
    uid: node.metadata.uid,
    labels: node.metadata.labels || {},
    creationTimestamp: node.metadata.creationTimestamp,
    conditions: (node.status?.conditions || []).map((c) => ({
      type: c.type,
      status: c.status,
      reason: c.reason || null,
      message: c.message || null,
      lastTransitionTime: c.lastTransitionTime || null,
    })),
    capacity: {
      cpu: node.status?.capacity?.cpu || '0',
      memory: node.status?.capacity?.memory || '0',
      pods: node.status?.capacity?.pods || '0',
    },
    allocatable: {
      cpu: node.status?.allocatable?.cpu || '0',
      memory: node.status?.allocatable?.memory || '0',
      pods: node.status?.allocatable?.pods || '0',
    },
    addresses: (node.status?.addresses || []).map((a) => ({
      type: a.type,
      address: a.address,
    })),
    nodeInfo: {
      kubeletVersion: node.status?.nodeInfo?.kubeletVersion || '',
      osImage: node.status?.nodeInfo?.osImage || '',
      containerRuntimeVersion: node.status?.nodeInfo?.containerRuntimeVersion || '',
      architecture: node.status?.nodeInfo?.architecture || '',
    },
  };
}

export const nodeResolvers = {
  Query: {
    nodes: async () => {
      const api = k8sClient.getCoreV1Api();
      const res = await api.listNode();
      return res.body.items.map(mapNode);
    },
    node: async (_, { name }) => {
      const api = k8sClient.getCoreV1Api();
      const res = await api.readNode(name);
      return mapNode(res.body);
    },
  },
};
