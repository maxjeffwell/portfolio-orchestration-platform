import api from './api';

export const deploymentService = {
  async getAllDeployments() {
    const response = await api.get('/deployments/portfolio');
    return response.data.data;
  },

  async getDeploymentDetails(name) {
    const response = await api.get(`/deployments/${name}`);
    return response.data.data;
  },

  async scaleDeployment(name, replicas) {
    const response = await api.post(`/deployments/${name}/scale`, { replicas });
    return response.data.data;
  },

  async updateDeployment(name, updates) {
    const response = await api.patch(`/deployments/${name}`, updates);
    return response.data.data;
  },

  async restartDeployment(name) {
    const response = await api.post(`/deployments/${name}/restart`);
    return response.data.data;
  },
};

export default deploymentService;
