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

export default function Logs() {
  const [pods, setPods] = useState([]);
  const [selectedPod, setSelectedPod] = useState('');
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
      const logData = await podService.getPodLogs(selectedPod, { tailLines: 500 });
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
      fetchLogs();
    }
  }, [selectedPod]);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Logs
      </Typography>

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
