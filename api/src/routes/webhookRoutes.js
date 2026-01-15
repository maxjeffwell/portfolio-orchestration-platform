import express from 'express';
import gotifyService from '../services/gotifyService.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * POST /api/webhooks/keel
 * Receives Keel deployment notifications and forwards them to Gotify
 *
 * Keel webhook payload format:
 * {
 *   "name": "deployment.keel.sh/v1/poll",
 *   "message": "New update available: keelhq/keel:0.19.1",
 *   "createdAt": "2023-01-01T00:00:00Z"
 * }
 */
router.post('/keel', async (req, res) => {
  try {
    const { name, message, createdAt } = req.body;

    logger.info('Received Keel webhook', { name, message, createdAt });

    // Determine notification priority based on event type
    let priority = 5; // Default: normal
    let title = 'Keel Deployment';

    if (name) {
      if (name.includes('update')) {
        title = 'Image Update Available';
        priority = 5;
      } else if (name.includes('approved')) {
        title = 'Deployment Approved';
        priority = 6;
      } else if (name.includes('rejected')) {
        title = 'Deployment Rejected';
        priority = 7;
      } else if (name.includes('applied')) {
        title = 'Deployment Applied';
        priority = 6;
      } else if (name.includes('failed')) {
        title = 'Deployment Failed';
        priority = 8;
      }
    }

    // Forward to Gotify
    await gotifyService.sendMessage(
      `🚀 ${title}`,
      message || name || 'Keel notification received',
      priority
    );

    res.status(200).json({ success: true, message: 'Webhook processed' });
  } catch (error) {
    logger.error('Error processing Keel webhook:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/webhooks/health
 * Health check endpoint for webhook routes
 */
router.get('/health', (req, res) => {
  res.json({ status: 'ok', webhooks: ['keel'] });
});

export default router;
