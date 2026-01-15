import gotifyService from '../services/gotifyService.js';
import { asyncHandler, sendSuccess } from '../utils/asyncHandler.js';

class NotificationController {
  getNotifications = asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const messages = await gotifyService.getMessages(limit);
    sendSuccess(res, messages);
  });

  sendNotification = asyncHandler(async (req, res) => {
    const { title, message, priority } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        error: 'Title and message are required',
      });
    }

    const result = await gotifyService.sendMessage(
      title,
      message,
      priority || 5
    );
    sendSuccess(res, result, 201);
  });

  deleteNotification = asyncHandler(async (req, res) => {
    const { id } = req.params;
    await gotifyService.deleteMessage(parseInt(id));
    sendSuccess(res, { deleted: true, id: parseInt(id) });
  });

  clearAllNotifications = asyncHandler(async (req, res) => {
    await gotifyService.deleteAllMessages();
    sendSuccess(res, { cleared: true });
  });

  checkHealth = asyncHandler(async (req, res) => {
    const health = await gotifyService.checkHealth();
    const statusCode = health.healthy ? 200 : 503;
    res.status(statusCode).json({
      success: health.healthy,
      ...health,
    });
  });
}

export default new NotificationController();
