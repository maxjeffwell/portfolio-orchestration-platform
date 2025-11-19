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
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
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
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Metrics</Typography>
        <Button startIcon={<RefreshIcon />} onClick={fetchMetrics} variant="outlined">
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
                    <Typography color="textSecondary">CPU Usage</Typography>
                    <Typography variant="h4">
                      {metrics.cluster.cpuUsage || 0}%
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography color="textSecondary">Memory Usage</Typography>
                    <Typography variant="h4">
                      {metrics.cluster.memoryUsage || 0}%
                    </Typography>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}
