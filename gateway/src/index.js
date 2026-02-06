import { createServer } from 'node:http';
import { createYoga } from 'graphql-yoga';
import { schema } from './schema/index.js';
import k8sClient from './lib/k8sClient.js';

const PORT = parseInt(process.env.PORT || '4000', 10);
const CORS_ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:8000')
  .split(',')
  .map((s) => s.trim());

k8sClient.initialize();

const yoga = createYoga({
  schema,
  cors: {
    origin: CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
  },
  graphiql: process.env.NODE_ENV !== 'production',
  landingPage: false,
});

const server = createServer(yoga);

server.listen(PORT, () => {
  console.log(`GraphQL Gateway running at http://localhost:${PORT}/graphql`);
  console.log(`Health check at http://localhost:${PORT}/health`);
  console.log(`K8s context: ${k8sClient.getCurrentContext()}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  server.close(() => process.exit(0));
});
