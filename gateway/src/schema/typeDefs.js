export const typeDefs = /* GraphQL */ `
  scalar JSON

  type Query {
    pods(namespace: String): [Pod!]!
    pod(name: String!, namespace: String): Pod

    deployments(namespace: String): [Deployment!]!
    deployment(name: String!, namespace: String): Deployment

    services(namespace: String): [Service!]!
    service(name: String!, namespace: String): Service

    nodes: [KubeNode!]!
    node(name: String!): KubeNode

    namespaces: [Namespace!]!

    clusterMetrics: ClusterMetrics!
    recentAIEvents: [AIEvent!]!

    argoCDApplications: [ArgoCDApplication!]!
    recentGitHubRuns: [GitHubRun!]!
  }

  type Pod {
    name: String!
    namespace: String!
    uid: String!
    phase: String!
    podIP: String
    hostIP: String
    startTime: String
    creationTimestamp: String!
    labels: JSON
    containers: [Container!]!
    conditions: [PodCondition!]!
  }

  type Container {
    name: String!
    image: String!
    ready: Boolean!
    restartCount: Int!
    state: String!
    ports: [ContainerPort!]!
  }

  type ContainerPort {
    name: String
    containerPort: Int!
    protocol: String!
  }

  type PodCondition {
    type: String!
    status: String!
    lastTransitionTime: String
  }

  type Deployment {
    name: String!
    namespace: String!
    uid: String!
    creationTimestamp: String!
    labels: JSON
    replicas: Int!
    readyReplicas: Int!
    availableReplicas: Int!
    unavailableReplicas: Int!
    updatedReplicas: Int!
    strategy: String
    conditions: [DeploymentCondition!]!
  }

  type DeploymentCondition {
    type: String!
    status: String!
    reason: String
    message: String
    lastTransitionTime: String
  }

  type Service {
    name: String!
    namespace: String!
    uid: String!
    type: String!
    clusterIP: String
    ports: [ServicePort!]!
    selector: JSON
    creationTimestamp: String!
  }

  type ServicePort {
    name: String
    port: Int!
    targetPort: String!
    protocol: String!
    nodePort: Int
  }

  type KubeNode {
    name: String!
    uid: String!
    labels: JSON
    creationTimestamp: String!
    conditions: [NodeCondition!]!
    capacity: NodeResources!
    allocatable: NodeResources!
    addresses: [NodeAddress!]!
    nodeInfo: NodeSystemInfo!
  }

  type NodeCondition {
    type: String!
    status: String!
    reason: String
    message: String
    lastTransitionTime: String
  }

  type NodeResources {
    cpu: String!
    memory: String!
    pods: String!
  }

  type NodeAddress {
    type: String!
    address: String!
  }

  type NodeSystemInfo {
    kubeletVersion: String!
    osImage: String!
    containerRuntimeVersion: String!
    architecture: String!
  }

  type Namespace {
    name: String!
    uid: String!
    status: String!
    creationTimestamp: String!
    labels: JSON
  }

  type ClusterMetrics {
    nodeCount: Int!
    totalPods: Int!
    runningPods: Int!
    pendingPods: Int!
    failedPods: Int!
    namespaceCount: Int!
    cpuUsageCores: Float
    memoryUsageBytes: Float
  }

  type Mutation {
    submitContactForm(input: ContactFormInput!): ContactFormResult!
  }

  input ContactFormInput {
    name: String!
    email: String!
    message: String!
  }

  type ContactFormResult {
    success: Boolean!
    message: String!
  }

  type Subscription {
    aiEventStream: AIEvent!
    clusterMetricsStream: ClusterMetrics!
    argoCDAppsStream: [ArgoCDApplication!]!
    githubRunsStream: [GitHubRun!]!
  }

  type ArgoCDApplication {
    name: String!
    namespace: String!
    healthStatus: String!
    syncStatus: String!
    syncRevision: String!
    repoURL: String!
    path: String!
  }

  type GitHubRun {
    runId: String!
    name: String!
    repo: String!
    repoDisplayName: String!
    conclusion: String!
    htmlUrl: String!
    createdAt: String!
  }

  type AIEvent {
    eventId: String!
    timestamp: Float!
    endpoint: String!
    app: String!
    backend: String!
    model: String
    status: String!
    latencyMs: Float!
    usage: AIEventUsage!
    fromCache: Boolean!
  }

  type AIEventUsage {
    promptTokens: Int!
    completionTokens: Int!
  }
`;
