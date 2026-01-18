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

function Metrics() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Format power for display (convert to mW if < 1W)
  const formatPower = (watts) => {
    if (watts === null || watts === undefined) return 'N/A';
    if (watts < 1) {
      return `${(watts * 1000).toFixed(1)} mW`;
    }
    return `${watts.toFixed(1)} W`;
  };

  // Format memory for display
  const formatMemory = (mb, total) => {
    if (total > 1024) {
      return `${(mb / 1024).toFixed(1)} / ${(total / 1024).toFixed(1)} GB`;
    }
    return `${mb.toFixed(0)} / ${total.toFixed(0)} MB`;
  };

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const allMetrics = await metricsService.getAllMetrics();

      setMetrics({
        pods: allMetrics.pods,
        cluster: allMetrics.cluster,
        gpu: allMetrics.gpu,
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
    name: pod.metadata?.name?.length > 20
      ? pod.metadata?.name?.substring(0, 20) + '...'
      : pod.metadata?.name,
    fullName: pod.metadata?.name,
    cpu: parseFloat(pod.usage?.cpu || 0),
    memory: parseFloat(pod.usage?.memory || 0),
  })) || [];

  // Custom tooltip to show full pod name
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <Box
          sx={{
            backgroundColor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            p: 2,
            boxShadow: 3,
            maxWidth: 350,
          }}
        >
          <Typography variant="body1" sx={{ fontWeight: 600, mb: 1, wordBreak: 'break-all', fontSize: '0.95rem' }}>
            {data.fullName}
          </Typography>
          {payload.map((entry, index) => (
            <Typography key={index} variant="body1" sx={{ color: entry.color, fontSize: '0.9rem' }}>
              {entry.name}: {entry.value.toFixed(1)}
            </Typography>
          ))}
        </Box>
      );
    }
    return null;
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={2}>
        <Typography variant="h4" sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>Metrics</Typography>
        <Button startIcon={<RefreshIcon />} onClick={fetchMetrics} variant="outlined" size="small">
          Refresh
        </Button>
      </Box>

      <Grid container spacing={{ xs: 2, sm: 3 }}>
        <Grid size={{ xs: 12 }}>
          <Card>
            <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
              <Typography
                variant="h6"
                gutterBottom
                sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}
              >
                Pod CPU Usage (millicores)
              </Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Box sx={{ minWidth: { xs: 400, sm: 'auto' } }}>
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={podMetricsData} margin={{ top: 20, right: 20, left: 0, bottom: 120 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="name"
                        angle={-45}
                        textAnchor="end"
                        height={120}
                        tick={{ fontSize: 14 }}
                        interval={0}
                        dy={10}
                      />
                      <YAxis tick={{ fontSize: 14 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: '14px', paddingTop: '20px' }} />
                      <Bar dataKey="cpu" fill="#2196f3" name="CPU (m)" />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <Card>
            <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
              <Typography
                variant="h6"
                gutterBottom
                sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}
              >
                Pod Memory Usage (Mi)
              </Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Box sx={{ minWidth: { xs: 400, sm: 'auto' } }}>
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={podMetricsData} margin={{ top: 20, right: 20, left: 0, bottom: 120 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="name"
                        angle={-45}
                        textAnchor="end"
                        height={120}
                        tick={{ fontSize: 14 }}
                        interval={0}
                        dy={10}
                      />
                      <YAxis tick={{ fontSize: 14 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: '14px', paddingTop: '20px' }} />
                      <Bar dataKey="memory" fill="#4caf50" name="Memory (Mi)" />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {metrics?.cluster && (
          <Grid size={{ xs: 12 }}>
            <Card>
              <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
                <Typography
                  variant="h6"
                  gutterBottom
                  sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}
                >
                  Cluster Overview
                </Typography>
                <Grid container spacing={{ xs: 1.5, sm: 2 }}>
                  <Grid size={{ xs: 6, sm: 6, md: 3 }}>
                    <Typography
                      variant="body2"
                      color="textSecondary"
                      sx={{ mb: 0.5, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                    >
                      Total Nodes
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 600, fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
                      {metrics.cluster.nodes || 0}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 6, md: 3 }}>
                    <Typography
                      variant="body2"
                      color="textSecondary"
                      sx={{ mb: 0.5, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                    >
                      Total Pods
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 600, fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
                      {metrics.cluster.totalPods || 0}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 6, md: 3 }}>
                    <Typography
                      variant="body2"
                      color="textSecondary"
                      sx={{ mb: 0.5, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                    >
                      Running Pods
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 600, fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
                      {metrics.cluster.runningPods || 0}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 6, md: 3 }}>
                    <Typography
                      variant="body2"
                      color="textSecondary"
                      sx={{ mb: 0.5, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                    >
                      Namespaces
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 600, fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
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
              <Grid size={{ xs: 12, md: 6 }} key={gpu.index}>
                <Card>
                  <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
                    <Typography
                      variant="h6"
                      gutterBottom
                      sx={{ mb: 2, fontSize: { xs: '0.9rem', sm: '1.25rem' } }}
                    >
                      GPU {gpu.index}: {gpu.name}
                    </Typography>
                    <Grid container spacing={{ xs: 1.5, sm: 2 }}>
                      <Grid size={{ xs: 6, sm: 4 }}>
                        <Typography
                          variant="body2"
                          color="textSecondary"
                          sx={{ mb: 0.5, fontSize: { xs: '0.7rem', sm: '0.875rem' } }}
                        >
                          GPU Util
                        </Typography>
                        <Typography
                          variant="h5"
                          sx={{ fontWeight: 600, fontSize: { xs: '1.1rem', sm: '1.5rem' } }}
                          color={gpu.utilization.gpu > 80 ? 'error' : 'primary'}
                        >
                          {gpu.utilization.gpu.toFixed(1)}%
                        </Typography>
                      </Grid>
                      <Grid size={{ xs: 6, sm: 4 }}>
                        <Typography
                          variant="body2"
                          color="textSecondary"
                          sx={{ mb: 0.5, fontSize: { xs: '0.7rem', sm: '0.875rem' } }}
                        >
                          Mem Util
                        </Typography>
                        <Typography
                          variant="h5"
                          sx={{ fontWeight: 600, fontSize: { xs: '1.1rem', sm: '1.5rem' } }}
                          color={gpu.utilization.memory > 80 ? 'error' : 'primary'}
                        >
                          {gpu.utilization.memory.toFixed(1)}%
                        </Typography>
                      </Grid>
                      <Grid size={{ xs: 6, sm: 4 }}>
                        <Typography
                          variant="body2"
                          color="textSecondary"
                          sx={{ mb: 0.5, fontSize: { xs: '0.7rem', sm: '0.875rem' } }}
                        >
                          Memory
                        </Typography>
                        <Typography
                          variant="h6"
                          sx={{ fontWeight: 600, fontSize: { xs: '0.9rem', sm: '1.25rem' } }}
                        >
                          {formatMemory(gpu.memory.used, gpu.memory.total)}
                        </Typography>
                      </Grid>
                      <Grid size={{ xs: 6, sm: 4 }}>
                        <Typography
                          variant="body2"
                          color="textSecondary"
                          sx={{ mb: 0.5, fontSize: { xs: '0.7rem', sm: '0.875rem' } }}
                        >
                          Temp
                        </Typography>
                        <Typography
                          variant="h5"
                          sx={{ fontWeight: 600, fontSize: { xs: '1.1rem', sm: '1.5rem' } }}
                          color={gpu.temperature > 80 ? 'error' : gpu.temperature > 70 ? 'warning.main' : 'success.main'}
                        >
                          {gpu.temperature?.toFixed(0) || 'N/A'}°C
                        </Typography>
                      </Grid>
                      <Grid size={{ xs: 12, sm: 8 }}>
                        <Typography
                          variant="body2"
                          color="textSecondary"
                          sx={{ mb: 0.5, fontSize: { xs: '0.7rem', sm: '0.875rem' } }}
                        >
                          Power
                        </Typography>
                        <Typography
                          variant="h6"
                          sx={{ fontWeight: 600, fontSize: { xs: '0.9rem', sm: '1.25rem' } }}
                        >
                          {formatPower(gpu.power?.draw)} {gpu.power?.limit ? `/ ${formatPower(gpu.power.limit)}` : ''}
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

export default Metrics;
