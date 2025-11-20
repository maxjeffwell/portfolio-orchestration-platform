import { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  CircularProgress,
  Alert,
  Button,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import metricsService from '../services/metricsService';
import socketService from '../services/socketService';

export default function Metrics() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const [podMetrics, clusterMetrics] = await Promise.all([
        metricsService.getPodMetrics(),
        metricsService.getClusterMetrics(),
      ]);

      setMetrics({
        pods: podMetrics,
        cluster: clusterMetrics,
      });
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();

    socketService.connect();
    socketService.emit('subscribe:metrics');

    const handleMetricsUpdate = (metricsData) => {
      console.log('Received metrics:update', metricsData);
      setMetrics(metricsData);
      setLoading(false);
      setError(null);
    };

    socketService.on('metrics:update', handleMetricsUpdate);

    return () => {
      socketService.off('metrics:update', handleMetricsUpdate);
    };
  }, []);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">Error loading metrics: {error}</Alert>;
  }

  const podMetricsData = metrics?.pods?.map((pod) => ({
    name: pod.metadata?.name?.substring(0, 15) + '...',
    cpu: parseFloat(pod.usage?.cpu || 0),
    memory: parseFloat(pod.usage?.memory || 0),
  })) || [];

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={2}>
        <Typography variant="h4" sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>Metrics</Typography>
        <Button startIcon={<RefreshIcon />} onClick={fetchMetrics} variant="outlined" size="small">
          Refresh
        </Button>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Pod CPU Usage (millicores)
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={podMetricsData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="cpu" fill="#2196f3" name="CPU (m)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Pod Memory Usage (Mi)
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={podMetricsData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="memory" fill="#4caf50" name="Memory (Mi)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {metrics?.cluster && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Cluster Overview
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography color="textSecondary">Total Nodes</Typography>
                    <Typography variant="h4">
                      {metrics.cluster.nodes || 0}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography color="textSecondary">Total Pods</Typography>
                    <Typography variant="h4">
                      {metrics.cluster.totalPods || 0}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography color="textSecondary">Running Pods</Typography>
                    <Typography variant="h4">
                      {metrics.cluster.runningPods || 0}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography color="textSecondary">Namespaces</Typography>
                    <Typography variant="h4">
                      {metrics.cluster.namespaces || 0}
                    </Typography>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        )}

        {metrics?.gpu && metrics.gpu.length > 0 && (
          <>
            {metrics.gpu.map((gpu) => (
              <Grid item xs={12} key={gpu.index}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      GPU {gpu.index}: {gpu.name}
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6} md={3}>
                        <Typography color="textSecondary">GPU Utilization</Typography>
                        <Typography variant="h4" color={gpu.utilization.gpu > 80 ? 'error' : 'primary'}>
                          {gpu.utilization.gpu.toFixed(1)}%
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <Typography color="textSecondary">Memory Utilization</Typography>
                        <Typography variant="h4" color={gpu.utilization.memory > 80 ? 'error' : 'primary'}>
                          {gpu.utilization.memory.toFixed(1)}%
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <Typography color="textSecondary">Memory Used</Typography>
                        <Typography variant="h4">
                          {gpu.memory.used.toFixed(0)} / {gpu.memory.total.toFixed(0)} MB
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <Typography color="textSecondary">Temperature</Typography>
                        <Typography variant="h4" color={gpu.temperature > 80 ? 'error' : gpu.temperature > 70 ? 'warning.main' : 'success.main'}>
                          {gpu.temperature?.toFixed(0) || 'N/A'}°C
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <Typography color="textSecondary">Power Draw</Typography>
                        <Typography variant="h4">
                          {gpu.power?.draw?.toFixed(1) || 'N/A'} / {gpu.power?.limit?.toFixed(0) || 'N/A'} W
                        </Typography>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </>
        )}
      </Grid>
    </Box>
  );
}
