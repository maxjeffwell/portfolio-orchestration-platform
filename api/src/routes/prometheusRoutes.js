import express from 'express';
import axios from 'axios';
import logger from '../utils/logger.js';

const router = express.Router();

// Prometheus service URL (internal Kubernetes service)
const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://prometheus:9090';

/**
 * Query Prometheus API
 * GET /api/prometheus/query?query=up
 */
router.get('/query', async (req, res) => {
  try {
    const { query, time } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required',
      });
    }

    const params = { query };
    if (time) {
      params.time = time;
    }

    const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
      params,
      timeout: 10000,
    });

    res.json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    logger.error('Error querying Prometheus:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to query Prometheus',
      details: error.message,
    });
  }
});

/**
 * Query Prometheus API with range
 * GET /api/prometheus/query_range?query=up&start=1h&end=now&step=15s
 */
router.get('/query_range', async (req, res) => {
  try {
    const { query, start, end, step } = req.query;

    if (!query || !start || !end) {
      return res.status(400).json({
        success: false,
        error: 'Query, start, and end parameters are required',
      });
    }

    // Convert relative times to Unix timestamps
    const now = Math.floor(Date.now() / 1000);
    let startTime = start;
    let endTime = end;

    // Handle relative time formats (e.g., "1h", "30m")
    if (typeof start === 'string' && start.match(/^\d+[mhd]$/)) {
      const value = parseInt(start);
      const unit = start.slice(-1);
      const multipliers = { m: 60, h: 3600, d: 86400 };
      startTime = now - (value * multipliers[unit]);
    } else if (start === 'now') {
      startTime = now;
    }

    if (end === 'now') {
      endTime = now;
    }

    const params = {
      query,
      start: startTime,
      end: endTime,
      step: step || '15s',
    };

    const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query_range`, {
      params,
      timeout: 10000,
    });

    res.json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    logger.error('Error querying Prometheus range:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to query Prometheus range',
      details: error.message,
    });
  }
});

/**
 * Get Prometheus targets
 * GET /api/prometheus/targets
 */
router.get('/targets', async (req, res) => {
  try {
    const response = await axios.get(`${PROMETHEUS_URL}/api/v1/targets`, {
      timeout: 10000,
    });

    res.json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    logger.error('Error getting Prometheus targets:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get Prometheus targets',
      details: error.message,
    });
  }
});

/**
 * Get Prometheus labels
 * GET /api/prometheus/labels
 */
router.get('/labels', async (req, res) => {
  try {
    const response = await axios.get(`${PROMETHEUS_URL}/api/v1/labels`, {
      timeout: 10000,
    });

    res.json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    logger.error('Error getting Prometheus labels:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get Prometheus labels',
      details: error.message,
    });
  }
});

/**
 * Get metrics for a specific pod
 * GET /api/prometheus/pod-metrics/:podName
 */
router.get('/pod-metrics/:podName', async (req, res) => {
  try {
    const { podName } = req.params;
    const { timeRange = '1h' } = req.query;

    // Calculate time range
    const now = Math.floor(Date.now() / 1000);
    const value = parseInt(timeRange);
    const unit = timeRange.slice(-1);
    const multipliers = { m: 60, h: 3600, d: 86400 };
    const startTime = now - (value * multipliers[unit]);

    // Query CPU usage
    const cpuQuery = `rate(container_cpu_usage_seconds_total{pod="${podName}"}[5m])`;
    const cpuResponse = await axios.get(`${PROMETHEUS_URL}/api/v1/query_range`, {
      params: {
        query: cpuQuery,
        start: startTime,
        end: now,
        step: '30s',
      },
      timeout: 10000,
    });

    // Query Memory usage
    const memQuery = `container_memory_usage_bytes{pod="${podName}"}`;
    const memResponse = await axios.get(`${PROMETHEUS_URL}/api/v1/query_range`, {
      params: {
        query: memQuery,
        start: startTime,
        end: now,
        step: '30s',
      },
      timeout: 10000,
    });

    res.json({
      success: true,
      data: {
        cpu: cpuResponse.data,
        memory: memResponse.data,
      },
    });
  } catch (error) {
    logger.error('Error getting pod metrics:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get pod metrics',
      details: error.message,
    });
  }
});

/**
 * Get cluster-wide metrics
 * GET /api/prometheus/cluster-metrics
 */
router.get('/cluster-metrics', async (req, res) => {
  try {
    const { timeRange = '1h' } = req.query;

    const now = Math.floor(Date.now() / 1000);
    const value = parseInt(timeRange);
    const unit = timeRange.slice(-1);
    const multipliers = { m: 60, h: 3600, d: 86400 };
    const startTime = now - (value * multipliers[unit]);

    // Aggregate CPU usage across all containers
    const cpuQuery = 'sum(rate(container_cpu_usage_seconds_total[5m])) by (namespace)';
    const cpuResponse = await axios.get(`${PROMETHEUS_URL}/api/v1/query_range`, {
      params: {
        query: cpuQuery,
        start: startTime,
        end: now,
        step: '1m',
      },
      timeout: 10000,
    });

    // Aggregate Memory usage across all containers
    const memQuery = 'sum(container_memory_usage_bytes) by (namespace)';
    const memResponse = await axios.get(`${PROMETHEUS_URL}/api/v1/query_range`, {
      params: {
        query: memQuery,
        start: startTime,
        end: now,
        step: '1m',
      },
      timeout: 10000,
    });

    // Pod count
    const podCountQuery = 'count(kube_pod_info) by (namespace)';
    const podCountResponse = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
      params: { query: podCountQuery },
      timeout: 10000,
    });

    res.json({
      success: true,
      data: {
        cpu: cpuResponse.data,
        memory: memResponse.data,
        podCount: podCountResponse.data,
      },
    });
  } catch (error) {
    logger.error('Error getting cluster metrics:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get cluster metrics',
      details: error.message,
    });
  }
});

export default router;
