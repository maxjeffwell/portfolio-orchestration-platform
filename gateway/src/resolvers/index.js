import { podResolvers } from './pods.js';
import { deploymentResolvers } from './deployments.js';
import { serviceResolvers } from './services.js';
import { nodeResolvers } from './nodes.js';
import { namespaceResolvers } from './namespaces.js';
import { clusterMetricsResolvers } from './clusterMetrics.js';
import { aiEventResolvers } from './aiEvents.js';

export const resolvers = {
  Query: {
    ...podResolvers.Query,
    ...deploymentResolvers.Query,
    ...serviceResolvers.Query,
    ...nodeResolvers.Query,
    ...namespaceResolvers.Query,
    ...clusterMetricsResolvers.Query,
    ...aiEventResolvers.Query,
  },
  Subscription: {
    ...clusterMetricsResolvers.Subscription,
    ...aiEventResolvers.Subscription,
  },
};
