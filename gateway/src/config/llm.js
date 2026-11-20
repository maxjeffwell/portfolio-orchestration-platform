// How language models are used in the cluster: which apps ask, what routes the
// request, which model answers (on local hardware or at a hosted provider),
// and what is kept afterwards.
//
// Hand-maintained from the live configuration (the AI gateway's settings and
// routing code, the LiteLLM model list, the OpenVINO Model Server configs,
// each app's environment), read on 2026-11-20. Health and request counts are
// live; the structure is not.
//
//   stage    column on the page, left to right
//   signal   which live figures to attach (see resolvers/llmTopology.js)

export const LLM_STAGES = [
  { id: 'APP', label: 'Who asks' },
  { id: 'ROUTE', label: 'Routing' },
  { id: 'LOCAL', label: 'Models on my hardware' },
  { id: 'CLOUD', label: 'Hosted models' },
  { id: 'KEEP', label: 'Memory and records' },
];

const OVMS_LLM = 'OpenVINO server · GPU Worker 1';
const OVMS_EMBED = 'OpenVINO server · GPU Worker 2';

export const LLM_NODES = [
  // --- who asks
  {
    id: 'bookmarked',
    stage: 'APP',
    displayName: 'Bookmarked',
    location: 'Bookmark manager',
    role: 'Suggests tags for a saved link and finds bookmarks by meaning rather than by keyword.',
    signal: { workloads: ['bookmarked-server'] },
  },
  {
    id: 'code-talk',
    stage: 'APP',
    displayName: 'Code Talk',
    location: 'Chat app for developers',
    role: 'Explains code, answers questions in chat and writes quizzes.',
    signal: { workloads: ['code-talk-server'] },
  },
  {
    id: 'pop-portfolio',
    stage: 'APP',
    displayName: 'Pop!_Portfolio',
    location: 'This site’s platform API',
    role: 'The assistant on the cluster dashboard: chat and one-off text generation.',
    signal: { workloads: ['portfolio-api'] },
  },
  {
    id: 'intervalai',
    stage: 'APP',
    displayName: 'IntervalAI',
    location: 'Spaced-repetition flashcards',
    role: 'Asks a small trained model when a card should next be reviewed, and finds related cards by meaning.',
    signal: { workloads: ['intervalai-server'] },
  },
  {
    id: 'tenants',
    stage: 'APP',
    displayName: 'TenantFlow tenants',
    location: 'Per-tenant namespaces',
    role: 'Apps deployed for tenants of the multi-tenant platform may call the gateway for text generation.',
  },
  {
    id: 'public',
    stage: 'APP',
    displayName: 'Outside callers',
    location: 'Firebook, scripts (tunnel)',
    role: 'Callers outside the cluster reach the gateway at a public address. Each needs its own client key; requests without one are refused.',
    signal: { workloads: ['cloudflared-ai-gateway'] },
  },

  // --- routing
  {
    id: 'gateway',
    stage: 'ROUTE',
    displayName: 'AI gateway',
    location: 'shared-ai-gateway',
    role: 'The one door every app uses. It builds the prompt for each task, tries the local model first, and falls back tier by tier to hosted models when the local one is down or its answer is unusable.',
    signal: { workloads: ['shared-ai-gateway'] },
  },
  {
    id: 'litellm',
    stage: 'ROUTE',
    displayName: 'LiteLLM',
    location: 'Model proxy',
    role: 'Gives every model one OpenAI-style API, holds the provider keys, and records spend per virtual key in HA Postgres.',
    signal: { workloads: ['litellm'] },
  },

  // --- models on my hardware
  {
    id: 'qwen-chat',
    stage: 'LOCAL',
    displayName: 'Qwen2.5 1.5B chat',
    location: OVMS_LLM,
    role: 'Qwen2.5 1.5B Instruct, served by OpenVINO Model Server (OVMS) on an Intel integrated GPU. First choice for every generation request.',
    signal: { workloads: ['ovms-llm'], model: 'qwen2.5-1.5b-instruct' },
  },
  {
    id: 'qwen-embed',
    stage: 'LOCAL',
    displayName: 'Qwen3 Embedding 0.6B',
    location: OVMS_EMBED,
    role: 'Turns text into vectors so that things with similar meaning land close together.',
    signal: { workloads: ['ovms-embeddings'], model: 'qwen3-embedding-0.6b' },
  },
  {
    id: 'e5',
    stage: 'LOCAL',
    displayName: 'E5 Large',
    location: OVMS_EMBED,
    role: 'An older embedding model, still serving the callers that were built on it. Its vectors are not comparable with Qwen3 ones.',
    signal: { workloads: ['ovms-embeddings'], model: 'e5-large' },
  },
  {
    id: 'reranker',
    stage: 'LOCAL',
    displayName: 'Qwen3 Reranker 0.6B',
    location: OVMS_EMBED,
    role: 'Given a question and a list of candidates, puts the candidates in order of relevance.',
    signal: { workloads: ['ovms-embeddings'], model: 'qwen3-reranker-0.6b' },
  },
  {
    id: 'interval-model',
    stage: 'LOCAL',
    displayName: 'Interval predictor',
    location: OVMS_EMBED,
    role: 'Not a language model: a small network trained on review history that predicts how long until a card is forgotten. It shares the model server with the embedding models.',
    signal: { workloads: ['ovms-embeddings'], model: 'interval_ai' },
  },

  // --- hosted models
  {
    id: 'groq',
    stage: 'CLOUD',
    displayName: 'Groq · GPT-OSS 120B',
    location: 'Hosted, free tier',
    role: 'A large open-weight model. Used when the local model is unavailable or its answer is unusable.',
  },
  {
    id: 'anthropic',
    stage: 'CLOUD',
    displayName: 'Claude Sonnet 4',
    location: 'Anthropic API',
    role: 'Used only when a request asks for it by name, for work that needs stronger reasoning.',
  },
  {
    id: 'runpod',
    stage: 'CLOUD',
    displayName: 'RunPod · Llama 3.1 8B',
    location: 'Rented GPU, pay per second',
    role: 'The last resort when every tier before it has failed.',
  },

  // --- memory and records
  {
    id: 'cache',
    stage: 'KEEP',
    displayName: 'Answer cache',
    location: 'HA Redis',
    role: 'Keeps recent answers so a repeated question is not sent to a model twice. LiteLLM also uses it to share rate limits between its replicas.',
    signal: { pods: { namespace: 'default', prefix: 'redis-ha-redis-' } },
  },
  {
    id: 'pgvector',
    stage: 'KEEP',
    displayName: 'Bookmark vectors',
    location: 'pgvector in Postgres',
    role: 'Stores one vector per bookmark and ranks them by similarity inside the database.',
    signal: { pods: { namespace: 'default', prefix: 'cnpg-bookmarked-' } },
  },
  {
    id: 'qdrant',
    stage: 'KEEP',
    displayName: 'Qdrant',
    location: 'Vector database',
    role: 'Stores one vector per flashcard and returns the cards nearest in meaning.',
    signal: { pods: { namespace: 'qdrant', prefix: 'qdrant-ha-qdrant-' } },
  },
  {
    id: 'lunary',
    stage: 'KEEP',
    displayName: 'Lunary',
    location: 'Self-hosted LLM observability',
    role: 'Records each model call with its prompt, answer, timing and token counts, so a bad answer can be traced afterwards.',
    signal: { workloads: ['lunary-backend', 'lunary-frontend'] },
  },
  {
    id: 'events',
    stage: 'KEEP',
    displayName: 'AI event stream',
    location: 'Kafka topic ai.gateway.events',
    role: 'One event per gateway request, for anything that wants to react to or count AI usage.',
    signal: { pods: { namespace: 'microservices', prefix: 'vertex-kafka-vertex-kafka-pool-' } },
  },
];

const flow = (from, to, signal, note) => ({ from, to, signal, note });

// signal: CHAT, EMBED, RERANK, PREDICT, FALLBACK, TRACE or STORE.
export const LLM_FLOWS = [
  // apps -> gateway
  flow('bookmarked', 'gateway', 'CHAT', 'Tag suggestions and short generated text for a bookmark.'),
  flow('code-talk', 'gateway', 'CHAT', 'Chat replies, code explanations and quizzes.'),
  flow('pop-portfolio', 'gateway', 'CHAT', 'Dashboard assistant: chat and text generation.'),
  flow('tenants', 'gateway', 'CHAT', 'Text generation, allowed in by a network policy for tenant namespaces only.'),
  flow('public', 'gateway', 'CHAT', 'Through the Cloudflare Tunnel to a separate listener that requires a client key.'),

  // apps -> models and stores directly
  flow('bookmarked', 'qwen-embed', 'EMBED', 'Bookmarked embeds each bookmark and each search query, calling the model server directly.'),
  flow('bookmarked', 'pgvector', 'STORE', 'Saves the vector beside the bookmark and searches by cosine distance.'),
  flow('intervalai', 'interval-model', 'PREDICT', 'Sends a card’s review history and gets back a predicted interval. Falls back to a copy of the model inside the app, then to the classic SM-2 formula.'),
  flow('intervalai', 'e5', 'EMBED', 'Embeds each flashcard to find related ones.'),
  flow('intervalai', 'qdrant', 'STORE', 'Indexes card vectors and asks for the nearest neighbours.'),

  // gateway -> models
  flow('gateway', 'qwen-chat', 'CHAT', 'First choice for every request: the local model, if its health check passes.'),
  flow('gateway', 'e5', 'EMBED', 'The gateway’s own embedding endpoint.'),
  flow('gateway', 'reranker', 'RERANK', 'The gateway’s rerank endpoint.'),
  flow('gateway', 'litellm', 'FALLBACK', 'Hosted models are reached through LiteLLM so the call is logged and its cost counted. If LiteLLM is down the gateway calls the provider directly.'),
  flow('gateway', 'runpod', 'FALLBACK', 'Last tier, called directly.'),
  flow('litellm', 'groq', 'FALLBACK', 'Next tier after the local model.'),
  flow('litellm', 'anthropic', 'FALLBACK', 'Only when the request names Claude.'),
  flow('litellm', 'qwen-chat', 'CHAT', 'LiteLLM also lists the local model, under the alias local-llama.'),

  // what is kept
  flow('gateway', 'cache', 'STORE', 'Answers are cached; a repeated question is served from here.'),
  flow('litellm', 'cache', 'STORE', 'Shared rate limits and cool-downs across the two replicas.'),
  flow('gateway', 'lunary', 'TRACE', 'Each request with its prompt, answer and timing.'),
  flow('litellm', 'lunary', 'TRACE', 'Every proxied call, successful or failed.'),
  flow('gateway', 'events', 'STORE', 'One event per request.'),
];
