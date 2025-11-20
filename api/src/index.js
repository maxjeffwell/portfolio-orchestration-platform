import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { PassThrough } from 'stream';
import { exec } from 'child_process';
import { promisify } from 'util';
import k8s from '@kubernetes/client-node';
import logger from './utils/logger.js';
import k8sClient from './config/kubernetes.js';
import userService from './services/userService.js';
import podRoutes from './routes/podRoutes.js';
import deploymentRoutes from './routes/deploymentRoutes.js';
import metricsRoutes from './routes/metricsRoutes.js';
import authRoutes from './routes/authRoutes.js';
import { authMiddleware } from './middleware/auth.js';

const execAsync = promisify(exec);

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
app.use('/api/auth', authRoutes);

// Protected routes (require authentication)
app.use('/api/pods', authMiddleware, podRoutes);
app.use('/api/deployments', authMiddleware, deploymentRoutes);
app.use('/api/metrics', authMiddleware, metricsRoutes);

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

  socket.on('subscribe:metrics', () => {
    logger.info(`Client ${socket.id} subscribed to metrics updates`);
    socket.join('metrics');
  });

  socket.on('subscribe:logs', (podName) => {
    logger.info(`Client ${socket.id} subscribed to logs for pod: ${podName}`);
    socket.data.logsPod = podName;
    socket.join(`logs:${podName}`);
  });

  socket.on('unsubscribe:logs', () => {
    const podName = socket.data.logsPod;
    if (podName) {
      logger.info(`Client ${socket.id} unsubscribed from logs for pod: ${podName}`);
      socket.leave(`logs:${podName}`);
      delete socket.data.logsPod;
    }
  });

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Periodic pod status updates (every 5 seconds)
let podUpdateInterval;
let deploymentUpdateInterval;
let metricsUpdateInterval;

function startPeriodicUpdates() {
  podUpdateInterval = setInterval(async () => {
    try {
      const coreV1Api = k8sClient.getCoreV1Api();
      const response = await coreV1Api.listNamespacedPod('default', undefined, undefined, undefined, undefined, 'portfolio=true');

      const pods = response.body.items.map(pod => ({
        name: pod.metadata.name,
        status: pod.status.phase,
        ready: pod.status.containerStatuses?.every(c => c.ready) || false,
        restartCount: pod.status.containerStatuses?.reduce((sum, c) => sum + c.restartCount, 0) || 0,
      }));

      logger.debug(`Emitting pods:update to ${io.sockets.adapter.rooms.get('pods')?.size || 0} clients`);
      io.to('pods').emit('pods:update', pods);
    } catch (error) {
      logger.error('Error sending pod updates:', error);
    }
  }, 30000); // Update every 30 seconds

  deploymentUpdateInterval = setInterval(async () => {
    try {
      const appsV1Api = k8sClient.getAppsV1Api();
      const response = await appsV1Api.listNamespacedDeployment('default', undefined, undefined, undefined, undefined, 'portfolio=true');

      const deployments = response.body.items.map(deployment => ({
        name: deployment.metadata.name,
        replicas: deployment.spec.replicas,
        availableReplicas: deployment.status.availableReplicas || 0,
        readyReplicas: deployment.status.readyReplicas || 0,
        updatedReplicas: deployment.status.updatedReplicas || 0,
      }));

      logger.debug(`Emitting deployments:update to ${io.sockets.adapter.rooms.get('deployments')?.size || 0} clients`);
      io.to('deployments').emit('deployments:update', deployments);
    } catch (error) {
      logger.error('Error sending deployment updates:', error);
    }
  }, 30000); // Update every 30 seconds

  // Metrics updates (every 15 seconds)
  metricsUpdateInterval = setInterval(async () => {
    try {
      const metricsClient = k8sClient.getMetricsClient();
      const coreV1Api = k8sClient.getCoreV1Api();

      // Get pod metrics
      const podMetricsResponse = await metricsClient.getPodMetrics('default');
      const rawPodMetrics = podMetricsResponse.items || [];

      // Parse pod metrics - CPU in millicores, Memory in MiB
      const parseCpu = (cpuString) => {
        if (!cpuString) return 0;
        // Convert to millicores (m)
        if (cpuString.endsWith('n')) return parseFloat(cpuString) / 1000000; // nanocores to millicores
        if (cpuString.endsWith('u')) return parseFloat(cpuString) / 1000; // microcores to millicores
        if (cpuString.endsWith('m')) return parseFloat(cpuString); // already millicores
        return parseFloat(cpuString) * 1000; // cores to millicores
      };

      const parseMemory = (memoryString) => {
        if (!memoryString) return 0;
        // Convert to MiB
        if (memoryString.endsWith('Ki')) return parseFloat(memoryString) / 1024; // KiB to MiB
        if (memoryString.endsWith('Mi')) return parseFloat(memoryString); // already MiB
        if (memoryString.endsWith('Gi')) return parseFloat(memoryString) * 1024; // GiB to MiB
        if (memoryString.endsWith('K')) return parseFloat(memoryString) / 1000 / 1024; // K to MiB
        if (memoryString.endsWith('M')) return parseFloat(memoryString) * 1000 / 1024 / 1024; // M to MiB
        if (memoryString.endsWith('G')) return parseFloat(memoryString) * 1000000000 / 1024 / 1024; // G to MiB
        return parseFloat(memoryString) / 1024 / 1024; // bytes to MiB
      };

      const podMetrics = rawPodMetrics.map(item => ({
        metadata: {
          name: item.metadata.name,
          namespace: item.metadata.namespace,
        },
        usage: {
          cpu: item.containers.reduce((sum, c) => sum + parseCpu(c.usage.cpu), 0),
          memory: item.containers.reduce((sum, c) => sum + parseMemory(c.usage.memory), 0),
        },
      }));

      // Get cluster metrics
      const nodesResponse = await coreV1Api.listNode();
      const nodes = nodesResponse.body.items || [];
      const podsResponse = await coreV1Api.listPodForAllNamespaces();
      const allPods = podsResponse.body.items || [];

      const clusterMetrics = {
        nodes: nodes.length,
        totalPods: allPods.length,
        runningPods: allPods.filter(p => p.status.phase === 'Running').length,
        pendingPods: allPods.filter(p => p.status.phase === 'Pending').length,
        failedPods: allPods.filter(p => p.status.phase === 'Failed').length,
        namespaces: [...new Set(allPods.map(p => p.metadata.namespace))].length,
      };

      // Get GPU metrics
      let gpuMetrics = [];
      try {
        const { stdout } = await execAsync(
          'nvidia-smi --query-gpu=index,name,utilization.gpu,utilization.memory,memory.used,memory.total,temperature.gpu,power.draw,power.limit --format=csv,noheader,nounits'
        );

        gpuMetrics = stdout.trim().split('\n').map(line => {
          const [index, name, gpuUtil, memUtil, memUsed, memTotal, temp, powerDraw, powerLimit] = line.split(', ');
          return {
            index: parseInt(index),
            name: name.trim(),
            utilization: {
              gpu: parseFloat(gpuUtil),
              memory: parseFloat(memUtil)
            },
            memory: {
              used: parseFloat(memUsed),
              total: parseFloat(memTotal)
            },
            temperature: parseFloat(temp),
            power: {
              draw: parseFloat(powerDraw),
              limit: parseFloat(powerLimit)
            }
          };
        });
      } catch (error) {
        logger.debug('GPU metrics not available:', error.message);
      }

      const metricsData = {
        pods: podMetrics,
        cluster: clusterMetrics,
        gpu: gpuMetrics
      };

      logger.debug(`Emitting metrics:update to ${io.sockets.adapter.rooms.get('metrics')?.size || 0} clients`);
      io.to('metrics').emit('metrics:update', metricsData);
    } catch (error) {
      logger.debug('Error sending metrics updates (metrics-server may not be available):', error.message);
    }
  }, 15000); // Update every 15 seconds

  // Check log stream subscriptions every 5 seconds
  setInterval(checkLogStreamSubscriptions, 5000);

  logger.info('Started periodic WebSocket updates and log stream monitoring');
}

// Log streaming management
const logStreams = new Map(); // Map<podName, { stream, buffer, lastEmit }>

async function startLogStream(podName) {
  if (logStreams.has(podName)) {
    logger.debug(`Log stream already exists for ${podName}`);
    return; // Already streaming
  }

  try {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();

    const log = new k8s.Log(kc);
    const logBuffer = [];
    let lastEmit = Date.now();

    const stream = new PassThrough();

    stream.on('data', (chunk) => {
      const lines = chunk.toString().split('\n').filter(line => line.trim());
      logBuffer.push(...lines);

      // Throttle: emit at most every 500ms
      const now = Date.now();
      if (now - lastEmit >= 500 && logBuffer.length > 0) {
        const linesToEmit = logBuffer.splice(0, logBuffer.length);
        io.to(`logs:${podName}`).emit('logs:update', {
          podName,
          lines: linesToEmit,
          timestamp: new Date().toISOString()
        });
        lastEmit = now;
        logger.debug(`Emitted ${linesToEmit.length} log lines for pod ${podName}`);
      }
    });

    stream.on('error', (error) => {
      logger.error(`Log stream error for pod ${podName}:`, error.message);
      stopLogStream(podName);
    });

    stream.on('end', () => {
      logger.info(`Log stream ended for pod ${podName}`);
      stopLogStream(podName);
    });

    // Start the log stream
    log.log('default', podName, '', stream, {
      follow: true,
      tailLines: 100,
      pretty: false,
      timestamps: false
    }).then(() => {
      logger.info(`Log stream started successfully for pod ${podName}`);
    }).catch((error) => {
      logger.error(`Log stream failed for pod ${podName}:`, error.message);
      stopLogStream(podName);
    });

    logStreams.set(podName, { stream, buffer: logBuffer, lastEmit });
    logger.info(`Created log stream for pod ${podName}`);

  } catch (error) {
    logger.error(`Failed to start log stream for pod ${podName}:`, error.message);
  }
}

function stopLogStream(podName) {
  const streamData = logStreams.get(podName);
  if (streamData) {
    try {
      streamData.stream.destroy();
    } catch (error) {
      logger.debug(`Error destroying log stream for ${podName}:`, error.message);
    }
    logStreams.delete(podName);
    logger.info(`Stopped log stream for pod ${podName}`);
  }
}

// Monitor which pods need log streaming
function checkLogStreamSubscriptions() {
  const activeStreams = new Set(logStreams.keys());
  const requiredStreams = new Set();

  // Check all rooms that start with 'logs:'
  io.sockets.adapter.rooms.forEach((sockets, roomName) => {
    if (roomName.startsWith('logs:')) {
      const podName = roomName.substring(5);
      if (sockets.size > 0) {
        requiredStreams.add(podName);
        logger.debug(`Found ${sockets.size} client(s) in room logs:${podName}`);
      }
    }
  });

  // Start streams for pods that need them
  requiredStreams.forEach(podName => {
    if (!activeStreams.has(podName)) {
      logger.info(`Starting log stream for ${podName} (${io.sockets.adapter.rooms.get(`logs:${podName}`)?.size || 0} subscribers)`);
      startLogStream(podName);
    }
  });

  // Stop streams that are no longer needed
  activeStreams.forEach(podName => {
    if (!requiredStreams.has(podName)) {
      stopLogStream(podName);
    }
  });
}

// Initialize Kubernetes client and start server
async function startServer() {
  try {
    // Initialize database
    logger.info('Initializing database...');
    await userService.initializeDatabase();
    logger.info('Database initialized successfully');

    // Initialize Kubernetes client
    logger.info('Initializing Kubernetes client...');
    k8sClient.initialize();
    logger.info('Kubernetes client initialized successfully');

    // Start periodic WebSocket updates
    startPeriodicUpdates();

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
