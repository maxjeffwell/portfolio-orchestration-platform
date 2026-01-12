import { useState, useRef, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  IconButton,
  Paper,
  CircularProgress,
  Chip,
  Alert,
  Divider,
} from '@mui/material';
import {
  Send as SendIcon,
  SmartToy as BotIcon,
  Person as PersonIcon,
  Psychology as ClaudeIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';
import aiService from '../services/aiService';
import api from '../services/api';

const buildSystemPrompt = (clusterContext) => {
  let prompt = `You are Claude, an AI assistant integrated into the Portfolio Orchestration Platform (POP).
You help users manage their Kubernetes infrastructure, debug issues, and understand their deployments.
Be concise, helpful, and technically accurate. When discussing K8s resources, be specific about namespaces,
resource types, and commands. Format code blocks and commands clearly.

`;

  if (clusterContext) {
    prompt += `CURRENT CLUSTER STATE (live data from the user's cluster):
================================================================================
`;

    if (clusterContext.pods && clusterContext.pods.length > 0) {
      prompt += `\nPODS (${clusterContext.pods.length} total):\n`;
      clusterContext.pods.forEach(pod => {
        const status = pod.status?.phase || 'Unknown';
        const ready = pod.status?.containerStatuses?.every(c => c.ready) ? 'Ready' : 'Not Ready';
        const restarts = pod.status?.containerStatuses?.reduce((sum, c) => sum + (c.restartCount || 0), 0) || 0;
        prompt += `  - ${pod.metadata?.name} [${status}] ${ready}, Restarts: ${restarts}, Namespace: ${pod.metadata?.namespace}\n`;
      });
    }

    if (clusterContext.deployments && clusterContext.deployments.length > 0) {
      prompt += `\nDEPLOYMENTS (${clusterContext.deployments.length} total):\n`;
      clusterContext.deployments.forEach(dep => {
        const ready = dep.status?.readyReplicas || 0;
        const desired = dep.spec?.replicas || 0;
        prompt += `  - ${dep.metadata?.name} [${ready}/${desired} ready], Namespace: ${dep.metadata?.namespace}\n`;
      });
    }

    if (clusterContext.metrics) {
      prompt += `\nCLUSTER METRICS:\n`;
      if (clusterContext.metrics.cpu) {
        prompt += `  - CPU: ${clusterContext.metrics.cpu}\n`;
      }
      if (clusterContext.metrics.memory) {
        prompt += `  - Memory: ${clusterContext.metrics.memory}\n`;
      }
    }

    prompt += `\n================================================================================
Use this real-time data to answer questions about the user's cluster. Reference specific pods and deployments by name.
`;
  }

  return prompt;
};

function AIChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [healthStatus, setHealthStatus] = useState(null);
  const [clusterContext, setClusterContext] = useState(null);
  const [contextLoading, setContextLoading] = useState(true);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Check AI gateway health on mount
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const health = await aiService.getHealth();
        setHealthStatus(health);
      } catch (err) {
        console.error('Failed to check AI health:', err);
        setHealthStatus({ status: 'error', message: err.message });
      }
    };
    checkHealth();
  }, []);

  // Fetch cluster context on mount
  useEffect(() => {
    const fetchClusterContext = async () => {
      setContextLoading(true);
      try {
        // Fetch all pods and deployments across ALL namespaces
        const [podsRes, deploymentsRes, metricsRes] = await Promise.allSettled([
          api.get('/pods/all'),
          api.get('/deployments/all'),
          api.get('/metrics/cluster')
        ]);

        const context = {
          pods: podsRes.status === 'fulfilled' ? (podsRes.value.data?.data || []) : [],
          deployments: deploymentsRes.status === 'fulfilled' ? (deploymentsRes.value.data?.data || []) : [],
          metrics: metricsRes.status === 'fulfilled' ? (metricsRes.value.data?.data || null) : null
        };

        setClusterContext(context);
        console.log('Cluster context loaded:', {
          pods: context.pods?.length || 0,
          deployments: context.deployments?.length || 0,
          hasMetrics: !!context.metrics
        });
      } catch (err) {
        console.error('Failed to fetch cluster context:', err);
        setClusterContext(null);
      } finally {
        setContextLoading(false);
      }
    };
    fetchClusterContext();
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input.trim() };
    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      // Build messages array with dynamic system prompt including cluster context
      const systemPrompt = buildSystemPrompt(clusterContext);
      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...updatedMessages
      ];

      const response = await aiService.chat(apiMessages, {
        maxTokens: 2048,
        temperature: 0.7
      });

      const assistantMessage = {
        role: 'assistant',
        content: response.response,
        model: response.model,
        backend: response.backend,
        usage: response.usage
      };

      setMessages([...updatedMessages, assistantMessage]);
    } catch (err) {
      console.error('Chat error:', err);
      setError(err.response?.data?.message || err.message || 'Failed to get response');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  const formatMessage = (content) => {
    // Simple markdown-like formatting for code blocks
    const parts = content.split(/(```[\s\S]*?```)/g);
    return parts.map((part, index) => {
      if (part.startsWith('```')) {
        const code = part.replace(/```\w*\n?/g, '').replace(/```$/g, '');
        return (
          <Paper
            key={index}
            sx={{
              p: 1.5,
              my: 1,
              backgroundColor: '#1e1e1e',
              borderRadius: 1,
              overflow: 'auto',
            }}
          >
            <Typography
              component="pre"
              sx={{
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                color: '#d4d4d4',
                m: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {code}
            </Typography>
          </Paper>
        );
      }
      return (
        <Typography
          key={index}
          component="span"
          sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        >
          {part}
        </Typography>
      );
    });
  };

  return (
    <Box sx={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" gutterBottom sx={{ fontWeight: 600, mb: 0.5 }}>
            AI Assistant
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Powered by Claude - Ask questions about your K8s infrastructure
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {healthStatus && (
            <Chip
              icon={<ClaudeIcon />}
              label={healthStatus.anthropic?.configured ? 'Claude Ready' : 'Claude Not Configured'}
              color={healthStatus.anthropic?.configured ? 'success' : 'warning'}
              size="small"
              variant="outlined"
            />
          )}
          <Chip
            label={
              contextLoading
                ? 'Loading context...'
                : clusterContext
                  ? `${clusterContext.pods?.length || 0} pods, ${clusterContext.deployments?.length || 0} deployments`
                  : 'No cluster data'
            }
            color={contextLoading ? 'default' : clusterContext ? 'info' : 'warning'}
            size="small"
            variant="outlined"
          />
          {messages.length > 0 && (
            <IconButton onClick={clearChat} size="small" title="Clear chat">
              <ClearIcon />
            </IconButton>
          )}
        </Box>
      </Box>

      {/* Chat Messages */}
      <Card
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: 2,
        }}
      >
        <CardContent
          sx={{
            flex: 1,
            overflow: 'auto',
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {messages.length === 0 && !error && (
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'text.secondary',
              }}
            >
              <ClaudeIcon sx={{ fontSize: 64, mb: 2, opacity: 0.5 }} />
              <Typography variant="h6" gutterBottom>
                How can I help you today?
              </Typography>
              <Typography variant="body2" textAlign="center" sx={{ maxWidth: 400 }}>
                Ask me about your deployments, pods, debugging issues, or anything related to your
                Kubernetes infrastructure.
              </Typography>
              <Box sx={{ mt: 3, display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Chip
                  label="Show pod status"
                  onClick={() => setInput('What pods are currently running in my cluster?')}
                  variant="outlined"
                  sx={{ cursor: 'pointer' }}
                />
                <Chip
                  label="Debug CrashLoopBackOff"
                  onClick={() => setInput('How do I debug a pod stuck in CrashLoopBackOff?')}
                  variant="outlined"
                  sx={{ cursor: 'pointer' }}
                />
                <Chip
                  label="K8s best practices"
                  onClick={() => setInput('What are some Kubernetes best practices for production?')}
                  variant="outlined"
                  sx={{ cursor: 'pointer' }}
                />
              </Box>
            </Box>
          )}

          {messages.map((message, index) => (
            <Box
              key={index}
              sx={{
                display: 'flex',
                gap: 1.5,
                alignItems: 'flex-start',
                flexDirection: message.role === 'user' ? 'row-reverse' : 'row',
              }}
            >
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: message.role === 'user' ? 'primary.main' : '#d97706',
                  color: 'white',
                  flexShrink: 0,
                }}
              >
                {message.role === 'user' ? <PersonIcon /> : <BotIcon />}
              </Box>
              <Paper
                elevation={1}
                sx={{
                  p: 2,
                  maxWidth: '80%',
                  backgroundColor: message.role === 'user' ? 'primary.main' : 'background.paper',
                  color: message.role === 'user' ? 'white' : 'text.primary',
                  borderRadius: 2,
                  borderTopLeftRadius: message.role === 'user' ? 16 : 4,
                  borderTopRightRadius: message.role === 'user' ? 4 : 16,
                }}
              >
                {formatMessage(message.content)}
                {message.model && (
                  <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid rgba(0,0,0,0.1)' }}>
                    <Typography variant="caption" sx={{ opacity: 0.7 }}>
                      {message.model}
                      {message.usage && ` | ${message.usage.prompt_tokens + message.usage.completion_tokens} tokens`}
                    </Typography>
                  </Box>
                )}
              </Paper>
            </Box>
          ))}

          {isLoading && (
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#d97706',
                  color: 'white',
                }}
              >
                <BotIcon />
              </Box>
              <Paper elevation={1} sx={{ p: 2, borderRadius: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CircularProgress size={16} />
                  <Typography variant="body2" color="text.secondary">
                    Claude is thinking...
                  </Typography>
                </Box>
              </Paper>
            </Box>
          )}

          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <div ref={messagesEndRef} />
        </CardContent>

        <Divider />

        {/* Input Area */}
        <Box sx={{ p: 2, backgroundColor: 'background.default' }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              multiline
              maxRows={4}
              placeholder="Ask Claude about your infrastructure..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 3,
                },
              }}
            />
            <IconButton
              color="primary"
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              sx={{
                backgroundColor: 'primary.main',
                color: 'white',
                '&:hover': {
                  backgroundColor: 'primary.dark',
                },
                '&.Mui-disabled': {
                  backgroundColor: 'action.disabledBackground',
                },
                borderRadius: 2,
                width: 48,
                height: 48,
              }}
            >
              <SendIcon />
            </IconButton>
          </Box>
        </Box>
      </Card>
    </Box>
  );
}

export default AIChat;
