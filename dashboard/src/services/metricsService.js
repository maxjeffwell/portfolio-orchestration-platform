import api from './api';

export const metricsService = {
  async getPodMetrics() {
    const response = await api.get('/metrics/pods');
    return response.data;
  },

  async getNodeMetrics() {
    const response = await api.get('/metrics/nodes');
    return response.data;
  },

  async getClusterMetrics() {
    const response = await api.get('/metrics/cluster');
    return response.data;
  },

  async getPodMetricsByName(name) {
    const response = await api.get(`/metrics/pods/${name}`);
    return response.data;
  },
};

export default metricsService;
