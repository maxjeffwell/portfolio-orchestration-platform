import express from 'express';
import axios from 'axios';
import logger from '../utils/logger.js';

const router = express.Router();

// AI Gateway service URL (internal Kubernetes service or external URL)
const AI_GATEWAY_URL = process.env.AI_GATEWAY_URL || 'http://shared-ai-gateway:8002';

// Lens Loop proxy URL (optional - for observability)
const LENS_LOOP_PROXY = process.env.LENS_LOOP_PROXY;
const LENS_LOOP_PROJECT = process.env.LENS_LOOP_PROJECT || 'pop-ai-assistant';

logger.info(`AI Gateway URL configured as: ${AI_GATEWAY_URL}`);
if (LENS_LOOP_PROXY) {
  logger.info(`Lens Loop proxy configured: ${LENS_LOOP_PROXY}`);
}

/**
 * Log request/response to Lens Loop for observability
 * Since Claude uses a different API format, we log manually rather than proxying
 */
async function logToLensLoop(request, response, durationMs) {
  if (!LENS_LOOP_PROXY) return;

  try {
    const logEntry = {
      timestamp: new Date().toISOString(),
      project: LENS_LOOP_PROJECT,
      provider: 'anthropic',
      model: response.model || 'claude-sonnet-4-20250514',
      request: {
        messages: request.messages?.length || 0,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
      },
      response: {
        responseLength: response.response?.length || 0,
        usage: response.usage,
      },
      durationMs,
      backend: response.backend,
    };

    // POST to Lens Loop log endpoint (if available)
    await axios.post(`${LENS_LOOP_PROXY}/api/logs`, logEntry, {
      timeout: 2000,
      headers: {
        'Content-Type': 'application/json',
        'X-Loop-Project': LENS_LOOP_PROJECT,
      },
    }).catch(() => {
      // Silent fail - observability shouldn't break the app
    });
  } catch (error) {
    logger.debug('Lens Loop logging failed (non-critical):', error.message);
  }
}

/**
 * Chat with AI (Claude)
 * POST /api/ai/chat
 */
router.post('/chat', async (req, res) => {
  const startTime = Date.now();

  try {
    const { messages, backend = 'anthropic', maxTokens, temperature } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        success: false,
        error: 'Messages array is required',
      });
    }

    logger.info(`AI chat request: ${messages.length} messages, backend: ${backend}`);

    // Forward to AI Gateway - always use anthropic for POP
    const response = await axios.post(`${AI_GATEWAY_URL}/api/ai/chat`, {
      messages,
      backend: 'anthropic', // Force Claude for POP
      maxTokens: maxTokens || 2048,
      temperature: temperature || 0.7,
    }, {
      timeout: 120000, // 2 minute timeout for Claude
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const durationMs = Date.now() - startTime;

    // Log to Lens Loop for observability
    await logToLensLoop(req.body, response.data, durationMs);

    logger.info(`AI chat response received in ${durationMs}ms, backend: ${response.data.backend}`);

    res.json({
      success: true,
      ...response.data,
      durationMs,
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error('Error calling AI Gateway:', error.message);

    // Check if it's a gateway error with details
    if (error.response?.data) {
      return res.status(error.response.status || 500).json({
        success: false,
        error: error.response.data.error || 'AI Gateway error',
        details: error.response.data.details,
        durationMs,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to communicate with AI Gateway',
      details: error.message,
      durationMs,
    });
  }
});

/**
 * Simple inference endpoint
 * POST /api/ai/inference
 */
router.post('/inference', async (req, res) => {
  const startTime = Date.now();

  try {
    const { prompt, systemPrompt, maxTokens, temperature } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required',
      });
    }

    logger.info(`AI inference request: ${prompt.substring(0, 50)}...`);

    const response = await axios.post(`${AI_GATEWAY_URL}/api/ai/generate`, {
      prompt,
      systemPrompt,
      forceBackend: 'anthropic', // Force Claude for POP
      maxTokens: maxTokens || 1024,
      temperature: temperature || 0.7,
    }, {
      timeout: 120000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const durationMs = Date.now() - startTime;

    logger.info(`AI inference response in ${durationMs}ms`);

    res.json({
      success: true,
      ...response.data,
      durationMs,
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error('Error calling AI Gateway inference:', error.message);

    res.status(500).json({
      success: false,
      error: 'Failed to communicate with AI Gateway',
      details: error.message,
      durationMs,
    });
  }
});

/**
 * Get AI Gateway health status
 * GET /api/ai/health
 */
router.get('/health', async (req, res) => {
  try {
    const response = await axios.get(`${AI_GATEWAY_URL}/health`, {
      timeout: 5000,
    });

    res.json({
      success: true,
      gateway: 'connected',
      ...response.data,
    });
  } catch (error) {
    logger.error('AI Gateway health check failed:', error.message);

    res.status(503).json({
      success: false,
      gateway: 'disconnected',
      error: 'AI Gateway is not reachable',
      details: error.message,
    });
  }
});

/**
 * Get AI Gateway info
 * GET /api/ai/info
 */
router.get('/info', async (req, res) => {
  try {
    const response = await axios.get(`${AI_GATEWAY_URL}/`, {
      timeout: 5000,
    });

    res.json({
      success: true,
      ...response.data,
    });
  } catch (error) {
    logger.error('AI Gateway info request failed:', error.message);

    res.status(503).json({
      success: false,
      error: 'AI Gateway is not reachable',
      details: error.message,
    });
  }
});

export default router;
