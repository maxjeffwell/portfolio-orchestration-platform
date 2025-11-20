import { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  CircularProgress,
  Alert,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import podService from '../services/podService';
import socketService from '../services/socketService';

export default function Logs() {
  const [pods, setPods] = useState([]);
  const [selectedPod, setSelectedPod] = useState('');
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [streaming, setStreaming] = useState(false);

  const fetchPods = async () => {
    try {
      const data = await podService.getAllPods();
      setPods(data);
      if (data.length > 0 && !selectedPod) {
        setSelectedPod(data[0].metadata?.name);
      }
    } catch (err) {
      setError(err.message);
      console.error('Error fetching pods:', err);
    }
  };

  const fetchLogs = async () => {
    if (!selectedPod) return;

    try {
      setLoading(true);
      const logData = await podService.getPodLogs(selectedPod, { tailLines: 100 });
      setLogs(logData.logs || 'No logs available');
      setError(null);
    } catch (err) {
      setError(err.message);
      setLogs('');
      console.error('Error fetching logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPods();
  }, []);

  useEffect(() => {
    if (selectedPod) {
      // Fetch initial logs
      fetchLogs();

      // Subscribe to log streaming
      socketService.connect();
      socketService.emit('subscribe:logs', selectedPod);
      setStreaming(true);

      const handleLogsUpdate = (data) => {
        if (data.podName === selectedPod && data.lines && data.lines.length > 0) {
          console.log(`Received ${data.lines.length} new log lines for ${selectedPod}`);
          setLogs((prevLogs) => {
            const newLogs = data.lines.join('\n');
            return prevLogs ? `${prevLogs}\n${newLogs}` : newLogs;
          });
        }
      };

      socketService.on('logs:update', handleLogsUpdate);

      return () => {
        // Unsubscribe from logs when changing pods or unmounting
        socketService.emit('unsubscribe:logs');
        socketService.off('logs:update', handleLogsUpdate);
        setStreaming(false);
      };
    }
  }, [selectedPod]);

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">
          Logs
        </Typography>
        {streaming && (
          <Typography variant="body2" color="success.main" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: 'success.main',
                animation: 'pulse 2s infinite',
                '@keyframes pulse': {
                  '0%, 100%': { opacity: 1 },
                  '50%': { opacity: 0.5 },
                },
              }}
            />
            Live streaming
          </Typography>
        )}
      </Box>

      <Box mb={3} display="flex" gap={2} alignItems="center">
        <FormControl sx={{ minWidth: 300 }}>
          <InputLabel>Select Pod</InputLabel>
          <Select
            value={selectedPod}
            onChange={(e) => setSelectedPod(e.target.value)}
            label="Select Pod"
          >
            {pods.map((pod) => (
              <MenuItem key={pod.metadata?.uid} value={pod.metadata?.name}>
                {pod.metadata?.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Button
          startIcon={<RefreshIcon />}
          onClick={fetchLogs}
          variant="outlined"
          disabled={!selectedPod || loading}
        >
          Refresh Logs
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>Error loading logs: {error}</Alert>}

      <Card>
        <CardContent>
          {loading ? (
            <Box display="flex" justifyContent="center" p={3}>
              <CircularProgress />
            </Box>
          ) : (
            <TextField
              multiline
              fullWidth
              value={logs}
              variant="outlined"
              InputProps={{
                readOnly: true,
                style: {
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  backgroundColor: '#1e1e1e',
                  color: '#d4d4d4',
                },
              }}
              minRows={25}
              maxRows={25}
            />
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
