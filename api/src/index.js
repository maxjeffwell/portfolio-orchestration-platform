import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import logger from './utils/logger.js';
import k8sClient from './config/kubernetes.js';
import podRoutes from './routes/podRoutes.js';
import deploymentRoutes from './routes/deploymentRoutes.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  },
});

const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    kubernetes: {
      connected: k8sClient.initialized,
      context: k8sClient.initialized ? k8sClient.getCurrentContext() : null,
    },
  });
});

// API Routes
app.use('/api/pods', podRoutes);
app.use('/api/deployments', deploymentRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
});

// WebSocket connection handling
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  socket.on('subscribe:pods', () => {
    logger.info(`Client ${socket.id} subscribed to pod updates`);
    socket.join('pods');
  });

  socket.on('subscribe:deployments', () => {
    logger.info(`Client ${socket.id} subscribed to deployment updates`);
    socket.join('deployments');
  });

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Periodic pod status updates (every 5 seconds)
setInterval(async () => {
  try {
    const coreV1Api = k8sClient.getCoreV1Api();
    const response = await coreV1Api.listNamespacedPod('default', undefined, undefined, undefined, undefined, 'portfolio=true');

    const pods = response.body.items.map(pod => ({
      name: pod.metadata.name,
      status: pod.status.phase,
      ready: pod.status.containerStatuses?.every(c => c.ready) || false,
      restartCount: pod.status.containerStatuses?.reduce((sum, c) => sum + c.restartCount, 0) || 0,
    }));

    io.to('pods').emit('pods:update', pods);
  } catch (error) {
    logger.error('Error sending pod updates:', error);
  }
}, 5000);

// Initialize Kubernetes client and start server
async function startServer() {
  try {
    // Initialize Kubernetes client
    logger.info('Initializing Kubernetes client...');
    k8sClient.initialize();
    logger.info('Kubernetes client initialized successfully');

    // Start HTTP server
    httpServer.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Kubernetes context: ${k8sClient.getCurrentContext()}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

// Start the server
startServer();
