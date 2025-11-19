import api from './api';

export const deploymentService = {
  async getAllDeployments() {
    const response = await api.get('/deployments');
    return response.data;
  },

  async getDeploymentDetails(name) {
    const response = await api.get(`/deployments/${name}`);
    return response.data;
  },

  async scaleDeployment(name, replicas) {
    const response = await api.post(`/deployments/${name}/scale`, { replicas });
    return response.data;
  },

  async updateDeployment(name, updates) {
    const response = await api.patch(`/deployments/${name}`, updates);
    return response.data;
  },

  async restartDeployment(name) {
    const response = await api.post(`/deployments/${name}/restart`);
    return response.data;
  },
};

export default deploymentService;
