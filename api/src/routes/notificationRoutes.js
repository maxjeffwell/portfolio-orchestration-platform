import express from 'express';
import notificationController from '../controllers/notificationController.js';

const router = express.Router();

// Health check for Gotify connectivity
router.get('/health', notificationController.checkHealth.bind(notificationController));

// Get all notifications
router.get('/', notificationController.getNotifications.bind(notificationController));

// Send a new notification
router.post('/', notificationController.sendNotification.bind(notificationController));

// Delete a specific notification
router.delete('/:id', notificationController.deleteNotification.bind(notificationController));

// Clear all notifications
router.delete('/', notificationController.clearAllNotifications.bind(notificationController));

export default router;
