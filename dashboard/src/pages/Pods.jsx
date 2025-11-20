import { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  CircularProgress,
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import podService from '../services/podService';
import socketService from '../services/socketService';

export default function Pods() {
  const [pods, setPods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPod, setSelectedPod] = useState(null);
  const [logs, setLogs] = useState('');
  const [logsOpen, setLogsOpen] = useState(false);

  const fetchPods = async () => {
    try {
      setLoading(true);
      const data = await podService.getAllPods();
      setPods(data);
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching pods:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewLogs = async (pod) => {
    try {
      setSelectedPod(pod);
      const logData = await podService.getPodLogs(pod.metadata?.name);
      setLogs(logData.logs || 'No logs available');
      setLogsOpen(true);
    } catch (err) {
      console.error('Error fetching logs:', err);
      setLogs('Error loading logs: ' + err.message);
      setLogsOpen(true);
    }
  };

  const handleRestartPod = async (podName) => {
    try {
      await podService.restartPod(podName);
      fetchPods();
    } catch (err) {
      console.error('Error restarting pod:', err);
      alert('Error restarting pod: ' + err.message);
    }
  };

  const handleDeletePod = async (podName) => {
    if (!window.confirm(`Are you sure you want to delete pod ${podName}?`)) {
      return;
    }
    try {
      await podService.deletePod(podName);
      fetchPods();
    } catch (err) {
      console.error('Error deleting pod:', err);
      alert('Error deleting pod: ' + err.message);
    }
  };

  useEffect(() => {
    fetchPods();

    socketService.connect();
    socketService.emit('subscribe:pods');

    const handlePodUpdate = (podData) => {
      console.log('Received pods:update', podData);
      // WebSocket sends simplified pod data, so we refetch for full details
      fetchPods();
    };

    socketService.on('pods:update', handlePodUpdate);

    return () => {
      socketService.off('pods:update', handlePodUpdate);
    };
  }, []);

  const getStatusColor = (phase) => {
    switch (phase?.toLowerCase()) {
      case 'running':
        return 'success';
      case 'pending':
        return 'warning';
      case 'failed':
        return 'error';
      case 'succeeded':
        return 'info';
      default:
        return 'default';
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">Error loading pods: {error}</Alert>;
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={2}>
        <Typography variant="h4" sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>Pods</Typography>
        <Button startIcon={<RefreshIcon />} onClick={fetchPods} variant="outlined" size="small">
          Refresh
        </Button>
      </Box>

      <Card>
        <CardContent sx={{ p: { xs: 1, sm: 2 } }}>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Namespace</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Restarts</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Age</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pods.map((pod) => (
                  <TableRow key={pod.metadata?.uid}>
                    <TableCell sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>{pod.metadata?.name}</TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{pod.metadata?.namespace}</TableCell>
                    <TableCell>
                      <Chip
                        label={pod.status?.phase || 'Unknown'}
                        color={getStatusColor(pod.status?.phase)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      {pod.status?.containerStatuses?.[0]?.restartCount || 0}
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      {new Date(pod.metadata?.creationTimestamp).toLocaleDateString()}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        onClick={() => handleViewLogs(pod)}
                        title="View Logs"
                      >
                        <ViewIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleRestartPod(pod.metadata?.name)}
                        title="Restart Pod"
                      >
                        <RefreshIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleDeletePod(pod.metadata?.name)}
                        title="Delete Pod"
                        color="error"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={logsOpen} onClose={() => setLogsOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Logs - {selectedPod?.metadata?.name}
        </DialogTitle>
        <DialogContent>
          <TextField
            multiline
            fullWidth
            value={logs}
            variant="outlined"
            InputProps={{
              readOnly: true,
              style: { fontFamily: 'monospace', fontSize: '12px' },
            }}
            minRows={20}
            maxRows={20}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLogsOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
