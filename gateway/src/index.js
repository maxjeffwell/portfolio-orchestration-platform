import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { createYoga } from 'graphql-yoga';
import { schema } from './schema/index.js';
import k8sClient from './lib/k8sClient.js';
import { startConsumer, stopConsumer, onAIEvent } from './kafka/consumer.js';
import { eventBuffer } from './kafka/eventBuffer.js';

const PORT = parseInt(process.env.PORT || '4000', 10);
const CORS_ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:8000')
  .split(',')
  .map((s) => s.trim());

k8sClient.initialize();

// Start Kafka consumer in background — retries indefinitely until connected
const kafkaEnabled = process.env.KAFKA_ENABLED !== 'false';
let kafkaConnected = false;
if (kafkaEnabled) {
  onAIEvent((event) => eventBuffer.add(event));
  startConsumer().then(() => {
    kafkaConnected = true;
    console.log('[Kafka] Consumer started, buffering events');
  });
}

const yoga = createYoga({
  schema,
  cors: {
    origin: CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
  },
  graphiql: {
    subscriptionsProtocol: 'WS',
  },
  landingPage: false,
});

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      kafka: { enabled: kafkaEnabled, connected: kafkaConnected },
    }));
    return;
  }
  yoga(req, res);
});

// WebSocket server for GraphQL subscriptions
const wsServer = new WebSocketServer({ server, path: '/graphql' });

useServer(
  {
    execute: (args) => args.rootValue.execute(args),
    subscribe: (args) => args.rootValue.subscribe(args),
    onSubscribe: async (ctx, msg) => {
      const { schema, execute, subscribe, contextFactory, parse, validate } =
        yoga.getEnveloped({
          ...ctx,
          req: ctx.extra.request,
          socket: ctx.extra.socket,
          params: msg.payload,
        });

      const args = {
        schema,
        operationName: msg.payload.operationName,
        document: parse(msg.payload.query),
        variableValues: msg.payload.variables,
        contextValue: await contextFactory(),
        rootValue: { execute, subscribe },
      };

      const errors = validate(args.schema, args.document);
      if (errors.length) return errors;
      return args;
    },
  },
  wsServer,
);

server.listen(PORT, () => {
  console.log(`GraphQL Gateway running at http://localhost:${PORT}/graphql`);
  console.log(`WebSocket subscriptions at ws://localhost:${PORT}/graphql`);
  console.log(`Health check at http://localhost:${PORT}/health`);
  console.log(`K8s context: ${k8sClient.getCurrentContext()}`);
});

async function shutdown() {
  console.log('Shutting down...');
  await stopConsumer();
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
