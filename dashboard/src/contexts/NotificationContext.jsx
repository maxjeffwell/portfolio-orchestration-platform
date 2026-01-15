import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import notificationService from '../services/notificationService';
import socketService from '../services/socketService';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);
  const { isAuthenticated } = useAuth();

  // Track read notification IDs in local storage
  const getReadIds = useCallback(() => {
    try {
      const stored = localStorage.getItem('read_notification_ids');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  }, []);

  const setReadIds = useCallback((ids) => {
    localStorage.setItem('read_notification_ids', JSON.stringify([...ids]));
  }, []);

  // Calculate unread count
  const updateUnreadCount = useCallback((messages) => {
    const readIds = getReadIds();
    const unread = messages.filter(msg => !readIds.has(msg.id)).length;
    setUnreadCount(unread);
  }, [getReadIds]);

  // Fetch notifications from API
  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      const messages = await notificationService.getNotifications(50);
      setNotifications(messages);
      updateUnreadCount(messages);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
      setError('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, updateUnreadCount]);

  // Mark notification as read
  const markAsRead = useCallback((id) => {
    const readIds = getReadIds();
    readIds.add(id);
    setReadIds(readIds);
    updateUnreadCount(notifications);
  }, [getReadIds, setReadIds, notifications, updateUnreadCount]);

  // Mark all as read
  const markAllAsRead = useCallback(() => {
    const readIds = getReadIds();
    notifications.forEach(msg => readIds.add(msg.id));
    setReadIds(readIds);
    setUnreadCount(0);
  }, [getReadIds, setReadIds, notifications]);

  // Delete a notification
  const deleteNotification = useCallback(async (id) => {
    try {
      await notificationService.deleteNotification(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      // Also remove from read IDs
      const readIds = getReadIds();
      readIds.delete(id);
      setReadIds(readIds);
    } catch (err) {
      console.error('Failed to delete notification:', err);
      throw err;
    }
  }, [getReadIds, setReadIds]);

  // Clear all notifications
  const clearAll = useCallback(async () => {
    try {
      await notificationService.clearAllNotifications();
      setNotifications([]);
      setUnreadCount(0);
      localStorage.removeItem('read_notification_ids');
    } catch (err) {
      console.error('Failed to clear notifications:', err);
      throw err;
    }
  }, []);

  // Send a notification (for testing/manual use)
  const sendNotification = useCallback(async (title, message, priority = 5) => {
    try {
      const result = await notificationService.sendNotification(title, message, priority);
      // Refetch to get the new notification
      await fetchNotifications();
      return result;
    } catch (err) {
      console.error('Failed to send notification:', err);
      throw err;
    }
  }, [fetchNotifications]);

  // Set up WebSocket subscription
  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    // Initial fetch
    fetchNotifications();

    // Connect to WebSocket
    socketService.connect();
    socketService.emit('subscribe:notifications');

    // Handle notification updates
    const handleUpdate = (data) => {
      console.log('Received notification update:', data);
      if (data.messages) {
        setNotifications(data.messages);
        updateUnreadCount(data.messages);
      }
    };

    // Handle connection state
    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);

    socketService.on('notifications:update', handleUpdate);
    socketService.on('connect', handleConnect);
    socketService.on('disconnect', handleDisconnect);

    // Set initial connected state
    setConnected(socketService.isConnected());

    return () => {
      socketService.off('notifications:update', handleUpdate);
      socketService.off('connect', handleConnect);
      socketService.off('disconnect', handleDisconnect);
    };
  }, [isAuthenticated, fetchNotifications, updateUnreadCount]);

  const value = {
    notifications,
    unreadCount,
    loading,
    error,
    connected,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
    sendNotification,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationContext;
