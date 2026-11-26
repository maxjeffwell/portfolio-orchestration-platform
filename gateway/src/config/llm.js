// How language models are used in the cluster: which apps ask, what routes the
// request, which model answers (on local hardware or at a hosted provider),
// and what is kept afterwards.
//
// Hand-maintained from the live configuration (the AI gateway's settings and
// routing code, the LiteLLM model list, the OpenVINO Model Server configs,
// each app's environment), read on 2026-11-20. Health and request counts are
// live; the structure is not.
//
// 2026-11-26: the two model servers are KServe InferenceServices now
// (qwen-llm and embeddings in the ovms namespace). KServe names the Deployment
// it generates <name>-predictor, which is what the health signal reads.
// Each has a second copy on the other GPU laptop (qwen-llm-2, embeddings-2), and
// embeddings a third on a desktop's older GPU (embeddings-3); a
// box is healthy when both copies run, degraded with one, offline with none
// (signal.pooled).
//   pooled   the workloads are interchangeable copies behind one address
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

const OVMS_LLM = 'KServe + OpenVINO · GPU Workers 1 + 2';
const OVMS_EMBED = 'KServe + OpenVINO · 3 copies';

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
    id: 'educationelly',
    stage: 'APP',
    displayName: 'EducationELLy',
    location: 'English-learner tracking, REST',
    role: 'A chat assistant for teachers, plus generated flashcards, quizzes and study recommendations.',
    signal: { workloads: ['educationelly-server'] },
  },
  {
    id: 'educationelly-graphql',
    stage: 'APP',
    displayName: 'EducationELLy GQL',
    location: 'The same app on GraphQL',
    role: 'The same assistant, flashcards and quizzes, reached through GraphQL resolvers.',
    signal: { workloads: ['educationelly-graphql-server'] },
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
    role: 'Uses three models. Its own neural network decides when a card should next be reviewed. E5 Large turns each card into a vector so related cards can be found. The study chat is answered by Qwen2.5 1.5B on my hardware, with Groq GPT-OSS 120B as the backup.',
    signal: { workloads: ['intervalai-server'] },
  },
  {
    id: 'immich',
    stage: 'APP',
    displayName: 'Immich',
    location: 'Photo library',
    role: 'Sends photos to its own machine-learning service so they can be searched by what is in them.',
    signal: { workloads: ['immich-server'] },
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
    role: 'The one door every app uses. It builds the prompt for each task and picks the model by who is asking: Code Talk and both EducationELLy apps go straight to Groq; everyone else gets the local model first and falls back tier by tier to hosted models when it is down or its answer is unusable.',
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
    role: 'Qwen2.5 1.5B Instruct, served by OpenVINO Model Server (OVMS) on an Intel integrated GPU. The server is deployed as a KServe InferenceService: KServe downloads the model from the cluster’s object store, attaches the GPU and keeps the pod running. First choice for Pop!_Portfolio, IntervalAI, bookmark tags, tenants and outside callers. It runs as two copies, one on each GPU laptop, and requests are spread across them, so chat keeps working when one laptop is down. After fifteen minutes without a request a copy unloads its model to free memory, and the next request reloads it in about a second. Both GPUs are shared with other work (Immich’s vision models, Channels DVR, Jellyfin and Tdarr transcoding), so a long transcode slows answers.',
    signal: { workloads: ['qwen-llm-predictor', 'qwen-llm-2-predictor'], pooled: true, model: 'qwen2.5-1.5b-instruct' },
  },
  {
    id: 'qwen-embed',
    stage: 'LOCAL',
    displayName: 'Qwen3 Embedding 0.6B',
    location: OVMS_EMBED,
    role: 'Turns text into vectors so that things with similar meaning land close together. It runs on a second OpenVINO Model Server, also a KServe InferenceService, which holds both embedding models and the reranker in one process. The three are unloaded together after fifteen idle minutes and reloaded together, in about four seconds, on the next request. This server runs as three copies returning identical vectors: one on each GPU laptop and one on a desktop’s older integrated GPU, which needed Intel’s legacy driver added to the server image. Nothing hosted stands in for embeddings, so the extra copies are what keep search working when a machine is down.',
    signal: { workloads: ['embeddings-predictor', 'embeddings-2-predictor', 'embeddings-3-predictor'], pooled: true, model: 'qwen3-embedding-0.6b' },
  },
  {
    id: 'e5',
    stage: 'LOCAL',
    displayName: 'E5 Large',
    location: OVMS_EMBED,
    role: 'An older embedding model, still serving the callers that were built on it. Its vectors are not comparable with Qwen3 ones.',
    signal: { workloads: ['embeddings-predictor', 'embeddings-2-predictor', 'embeddings-3-predictor'], pooled: true, model: 'e5-large' },
  },
  {
    id: 'reranker',
    stage: 'LOCAL',
    displayName: 'Qwen3 Reranker 0.6B',
    location: OVMS_EMBED,
    role: 'Given a question and a list of candidates, puts the candidates in order of relevance.',
    signal: { workloads: ['embeddings-predictor', 'embeddings-2-predictor', 'embeddings-3-predictor'], pooled: true, model: 'qwen3-reranker-0.6b' },
  },
  {
    id: 'interval-model',
    stage: 'LOCAL',
    displayName: 'IntervalAI neural net',
    location: OVMS_EMBED,
    // Figures from the app's ml/saved-model/metadata.json (model 5.0.0-v2-growth)
    // and from OVMS itself, which reports interval_ai version 2, input [-1, 24].
    role: 'Not a language model: IntervalAI’s own neural network, a plain feed-forward net with four hidden layers (128, 64, 32 and 16 units) and about 14,700 weights. It takes 24 numbers describing a card, such as how strong the memory is, how hard the card has been, the success rate and whether the answer just given was right, and returns the number of days until the next review. Trained in TensorFlow on 41,725 examples in October 2026, converted to OpenVINO, and served as interval_ai version 2 on the same model server as the embedding models.',
    signal: { workloads: ['embeddings-predictor', 'embeddings-2-predictor', 'embeddings-3-predictor'], pooled: true, model: 'interval_ai' },
  },
  {
    id: 'immich-ml',
    stage: 'LOCAL',
    displayName: 'Immich vision models',
    location: 'OpenVINO · GPU Worker 1',
    role: 'Not language models: Immich’s own image models, loaded on demand and unloaded after ten idle minutes. They use the OpenVINO runtime inside Immich’s service rather than the model server, and share the same integrated GPU as the local chat model.',
    signal: { workloads: ['immich-ml'] },
  },

  // --- hosted models
  {
    id: 'groq',
    stage: 'CLOUD',
    displayName: 'Groq · GPT-OSS 120B',
    location: 'Hosted, free tier',
    role: 'A large open-weight model. First choice for Code Talk and both EducationELLy apps, and the next tier for everyone else when the local model is unavailable or its answer is unusable.',
  },
  {
    id: 'anthropic',
    stage: 'CLOUD',
    displayName: 'Claude Sonnet 4',
    location: 'Anthropic API',
    role: 'Used when a request asks for it by name, and as the stand-in when Groq rate-limits a chat.',
  },
  {
    id: 'openai',
    stage: 'CLOUD',
    displayName: 'OpenAI · GPT-4o mini',
    location: 'OpenAI API',
    role: 'A path that exists but is idle: Bookmarked calls OpenAI directly only when no gateway is configured, and one is.',
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

// signal: CHAT, EMBED, RERANK, PREDICT, VISION, FALLBACK, TRACE or STORE.
export const LLM_FLOWS = [
  // apps -> gateway
  flow('bookmarked', 'gateway', 'CHAT', 'Tag suggestions (local model first, Groq if its answer is unusable) and short generated text for a bookmark.'),
  flow('code-talk', 'gateway', 'CHAT', 'Chat replies, code explanations and quizzes.'),
  flow('educationelly', 'gateway', 'CHAT', 'Assistant chat, flashcards, quizzes and study recommendations.'),
  flow('educationelly-graphql', 'gateway', 'CHAT', 'Assistant chat, flashcards and quizzes.'),
  flow('intervalai', 'gateway', 'CHAT', 'Study chat and explanations of a card. Answered by Qwen2.5 1.5B on my hardware; Groq GPT-OSS 120B takes over if the local model is down or its answer is unusable.'),
  flow('pop-portfolio', 'gateway', 'CHAT', 'Dashboard assistant: chat and text generation.'),
  flow('tenants', 'gateway', 'CHAT', 'Text generation, allowed in by a network policy for tenant namespaces only.'),
  flow('public', 'gateway', 'CHAT', 'Through the Cloudflare Tunnel to a separate listener that requires a client key.'),

  // apps -> models and stores directly
  flow('bookmarked', 'qwen-embed', 'EMBED', 'Bookmarked embeds each bookmark and each search query, calling the model server directly.'),
  flow('bookmarked', 'pgvector', 'STORE', 'Saves the vector beside the bookmark and searches by cosine distance.'),
  flow('immich', 'immich-ml', 'VISION', 'Each new photo, and each search phrase, goes to Immich’s own service.'),
  flow('bookmarked', 'openai', 'FALLBACK', 'Idle today: used only if the gateway setting is removed.'),
  flow('intervalai', 'interval-model', 'PREDICT', 'After each answer, sends 24 numbers describing the card and gets back the days until the next review. If the model server is down the app runs its own TensorFlow.js copy of the same network, and if that fails too it uses the classic SM-2 formula.'),
  flow('intervalai', 'e5', 'EMBED', 'Embeds each flashcard with E5 Large to find related ones.'),
  flow('intervalai', 'qdrant', 'STORE', 'Indexes card vectors and asks for the nearest neighbours.'),

  // gateway -> models
  flow('gateway', 'qwen-chat', 'CHAT', 'First choice for callers that are not on the Groq list, if the local model’s health check passes.'),
  flow('gateway', 'e5', 'EMBED', 'The gateway’s own embedding endpoint.'),
  flow('gateway', 'reranker', 'RERANK', 'The gateway’s rerank endpoint.'),
  flow('gateway', 'litellm', 'FALLBACK', 'Hosted models are reached through LiteLLM so the call is logged and its cost counted. If LiteLLM is down the gateway calls the provider directly.'),
  flow('gateway', 'runpod', 'FALLBACK', 'Last tier, called directly.'),
  flow('litellm', 'groq', 'FALLBACK', 'First choice for Code Talk and both EducationELLy apps; the next tier after the local model for everyone else.'),
  flow('litellm', 'anthropic', 'FALLBACK', 'When the request names Claude, or when Groq rate-limits a chat.'),
  flow('litellm', 'qwen-chat', 'CHAT', 'LiteLLM also lists the local model, under the alias local-llama.'),

  // what is kept
  flow('gateway', 'cache', 'STORE', 'Answers are cached; a repeated question is served from here.'),
  flow('litellm', 'cache', 'STORE', 'Shared rate limits and cool-downs across the two replicas.'),
  flow('gateway', 'lunary', 'TRACE', 'Each request with its prompt, answer and timing.'),
  flow('litellm', 'lunary', 'TRACE', 'Every proxied call, successful or failed.'),
  flow('gateway', 'events', 'STORE', 'One event per request.'),
];
