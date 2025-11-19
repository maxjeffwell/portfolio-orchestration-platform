import api from './api';

export const podService = {
  async getAllPods() {
    const response = await api.get('/pods');
    return response.data;
  },

  async getPodDetails(name) {
    const response = await api.get(`/pods/${name}`);
    return response.data;
  },

  async getPodLogs(name, options = {}) {
    const { container, tailLines = 100, follow = false } = options;
    const params = new URLSearchParams();

    if (container) params.append('container', container);
    params.append('tailLines', tailLines.toString());
    params.append('follow', follow.toString());

    const response = await api.get(`/pods/${name}/logs?${params.toString()}`);
    return response.data;
  },

  async restartPod(name) {
    const response = await api.post(`/pods/${name}/restart`);
    return response.data;
  },

  async deletePod(name) {
    const response = await api.delete(`/pods/${name}`);
    return response.data;
  },
};

export default podService;
