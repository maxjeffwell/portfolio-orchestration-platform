import api from './api';

/**
 * AI Service - Interfaces with Claude via the shared-ai-gateway
 * All calls are routed through the POP backend proxy
 */
export const aiService = {
  /**
   * Send a chat message to Claude
   * @param {Array} messages - Array of message objects with role and content
   * @param {Object} options - Optional parameters (maxTokens, temperature)
   * @returns {Promise<Object>} Response with message and metadata
   */
  async chat(messages, options = {}) {
    const response = await api.post('/ai/chat', {
      messages,
      backend: 'anthropic', // Always use Claude for POP
      ...options
    });
    return response.data;
  },

  /**
   * Send a simple prompt to Claude
   * @param {string} prompt - The user's prompt
   * @param {string} systemPrompt - Optional system context
   * @param {Object} options - Optional parameters
   * @returns {Promise<Object>} Response with message and metadata
   */
  async prompt(prompt, systemPrompt = null, options = {}) {
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    return this.chat(messages, options);
  },

  /**
   * Analyze Kubernetes resources using Claude
   * @param {string} resourceType - Type of resource (pod, deployment, etc.)
   * @param {Object} resourceData - The resource data to analyze
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeK8sResource(resourceType, resourceData) {
    const systemPrompt = `You are a Kubernetes expert assistant integrated into a Portfolio Orchestration Platform.
Analyze the provided ${resourceType} resource and provide insights about its configuration, health status,
potential issues, and recommendations for optimization. Be concise but thorough.`;

    const prompt = `Analyze this ${resourceType}:\n\`\`\`json\n${JSON.stringify(resourceData, null, 2)}\n\`\`\``;

    return this.prompt(prompt, systemPrompt, { maxTokens: 1024 });
  },

  /**
   * Get help with debugging an issue
   * @param {string} issue - Description of the issue
   * @param {Object} context - Additional context (logs, events, etc.)
   * @returns {Promise<Object>} Debugging suggestions
   */
  async debugHelp(issue, context = {}) {
    const systemPrompt = `You are a DevOps debugging assistant. Help diagnose and resolve issues
in a Kubernetes-based portfolio platform. Provide actionable suggestions.`;

    let prompt = `Issue: ${issue}`;
    if (context.logs) {
      prompt += `\n\nRelevant logs:\n\`\`\`\n${context.logs}\n\`\`\``;
    }
    if (context.events) {
      prompt += `\n\nRecent events:\n\`\`\`\n${context.events}\n\`\`\``;
    }

    return this.prompt(prompt, systemPrompt, { maxTokens: 1024 });
  },

  /**
   * Check AI gateway health status
   * @returns {Promise<Object>} Health status of the AI gateway
   */
  async getHealth() {
    const response = await api.get('/ai/health');
    return response.data;
  }
};

export default aiService;
