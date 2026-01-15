import api from './api';

export const notificationService = {
  async getNotifications(limit = 50) {
    const response = await api.get(`/notifications?limit=${limit}`);
    return response.data.data || [];
  },

  async sendNotification(title, message, priority = 5) {
    const response = await api.post('/notifications', {
      title,
      message,
      priority,
    });
    return response.data.data;
  },

  async deleteNotification(id) {
    const response = await api.delete(`/notifications/${id}`);
    return response.data.data;
  },

  async clearAllNotifications() {
    const response = await api.delete('/notifications');
    return response.data.data;
  },

  async checkHealth() {
    const response = await api.get('/notifications/health');
    return response.data;
  },
};

export default notificationService;
