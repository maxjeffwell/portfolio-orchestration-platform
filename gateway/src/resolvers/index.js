import { podResolvers } from './pods.js';
import { deploymentResolvers } from './deployments.js';
import { serviceResolvers } from './services.js';
import { nodeResolvers } from './nodes.js';
import { namespaceResolvers } from './namespaces.js';
import { clusterMetricsResolvers } from './clusterMetrics.js';
import { aiEventResolvers } from './aiEvents.js';
import { argocdResolvers } from './argocdApps.js';
import { githubResolvers } from './githubRuns.js';
import { contactFormResolvers } from './contactForm.js';
import { networkTopologyResolvers } from './networkTopology.js';

export const resolvers = {
  Query: {
    ...podResolvers.Query,
    ...deploymentResolvers.Query,
    ...serviceResolvers.Query,
    ...nodeResolvers.Query,
    ...namespaceResolvers.Query,
    ...clusterMetricsResolvers.Query,
    ...aiEventResolvers.Query,
    ...argocdResolvers.Query,
    ...githubResolvers.Query,
    ...networkTopologyResolvers.Query,
  },
  Mutation: {
    ...contactFormResolvers.Mutation,
  },
  Subscription: {
    ...clusterMetricsResolvers.Subscription,
    ...aiEventResolvers.Subscription,
    ...argocdResolvers.Subscription,
    ...githubResolvers.Subscription,
    ...networkTopologyResolvers.Subscription,
  },
};
