import axios from 'axios';
import logger from '../utils/logger.js';

const GOTIFY_URL = process.env.GOTIFY_URL || 'http://gotify.monitoring:80';
const GOTIFY_APP_TOKEN = process.env.GOTIFY_APP_TOKEN;
const GOTIFY_CLIENT_TOKEN = process.env.GOTIFY_CLIENT_TOKEN;
const GOTIFY_KEEL_APP_ID = process.env.GOTIFY_KEEL_APP_ID;

class GotifyService {
  constructor() {
    this.client = axios.create({
      baseURL: GOTIFY_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Send a notification message to Gotify
   * @param {string} title - Notification title
   * @param {string} message - Notification body
   * @param {number} priority - Priority level (1-10, higher = more urgent)
   * @returns {Promise<object>} - Created message object
   */
  async sendMessage(title, message, priority = 5) {
    try {
      if (!GOTIFY_APP_TOKEN) {
        throw new Error('GOTIFY_APP_TOKEN is not configured');
      }

      const response = await this.client.post(
        '/message',
        {
          title,
          message,
          priority,
        },
        {
          headers: {
            'X-Gotify-Key': GOTIFY_APP_TOKEN,
          },
        }
      );

      logger.info(`Gotify notification sent: ${title}`);
      return response.data;
    } catch (error) {
      logger.error('Error sending Gotify notification:', error.message);
      throw error;
    }
  }

  /**
   * Get all messages from Gotify
   * @param {number} limit - Maximum number of messages to return
   * @returns {Promise<object[]>} - Array of message objects
   */
  async getMessages(limit = 50) {
    try {
      if (!GOTIFY_CLIENT_TOKEN) {
        throw new Error('GOTIFY_CLIENT_TOKEN is not configured');
      }

      const endpoint = GOTIFY_KEEL_APP_ID
        ? `/application/${GOTIFY_KEEL_APP_ID}/message`
        : '/message';

      const response = await this.client.get(endpoint, {
        params: { limit },
        headers: {
          'X-Gotify-Key': GOTIFY_CLIENT_TOKEN,
        },
      });

      return response.data.messages || [];
    } catch (error) {
      logger.error('Error fetching Gotify messages:', error.message);
      throw error;
    }
  }

  /**
   * Delete a specific message
   * @param {number} id - Message ID to delete
   * @returns {Promise<boolean>} - Success status
   */
  async deleteMessage(id) {
    try {
      if (!GOTIFY_CLIENT_TOKEN) {
        throw new Error('GOTIFY_CLIENT_TOKEN is not configured');
      }

      await this.client.delete(`/message/${id}`, {
        headers: {
          'X-Gotify-Key': GOTIFY_CLIENT_TOKEN,
        },
      });

      logger.info(`Gotify message ${id} deleted`);
      return true;
    } catch (error) {
      logger.error(`Error deleting Gotify message ${id}:`, error.message);
      throw error;
    }
  }

  /**
   * Delete all messages
   * @returns {Promise<boolean>} - Success status
   */
  async deleteAllMessages() {
    try {
      if (!GOTIFY_CLIENT_TOKEN) {
        throw new Error('GOTIFY_CLIENT_TOKEN is not configured');
      }

      await this.client.delete('/message', {
        headers: {
          'X-Gotify-Key': GOTIFY_CLIENT_TOKEN,
        },
      });

      logger.info('All Gotify messages deleted');
      return true;
    } catch (error) {
      logger.error('Error deleting all Gotify messages:', error.message);
      throw error;
    }
  }

  /**
   * Check Gotify health/connectivity
   * @returns {Promise<object>} - Health status
   */
  async checkHealth() {
    try {
      const response = await this.client.get('/health');
      return {
        healthy: true,
        status: response.status,
        url: GOTIFY_URL,
        tokenConfigured: !!GOTIFY_APP_TOKEN,
      };
    } catch (error) {
      logger.error('Gotify health check failed:', error.message);
      return {
        healthy: false,
        error: error.message,
        url: GOTIFY_URL,
        tokenConfigured: !!GOTIFY_APP_TOKEN,
      };
    }
  }

  /**
   * Get the current application info
   * @returns {Promise<object>} - Application info
   */
  async getCurrentApplication() {
    try {
      if (!GOTIFY_APP_TOKEN) {
        throw new Error('GOTIFY_APP_TOKEN is not configured');
      }

      const response = await this.client.get('/current/user', {
        headers: {
          'X-Gotify-Key': GOTIFY_APP_TOKEN,
        },
      });

      return response.data;
    } catch (error) {
      logger.error('Error getting current application:', error.message);
      throw error;
    }
  }
}

export default new GotifyService();
