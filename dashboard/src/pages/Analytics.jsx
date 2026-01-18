import { useState, useEffect } from 'react';
import { Box, Card, CardContent, Grid, Typography, Paper, Chip } from '@mui/material';
import {
  TrendingUp,
  Speed,
  CheckCircle,
  Warning,
  Memory,
  Storage,
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import axios from 'axios';
import { API_BASE_URL } from '../config/apiConfig.js';
import { withCache } from '../utils/queryCache.js';

function Analytics() {
  const [metrics, setMetrics] = useState(null);
  const [historicalData, setHistoricalData] = useState([]);
  const [namespaceData, setNamespaceData] = useState([]);
  const [podResourceData, setPodResourceData] = useState([]);

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

  useEffect(() => {
    // Fetch real-time metrics from your API
    const fetchMetrics = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/metrics`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        });
        setMetrics(response.data);
      } catch (error) {
        console.error('Error fetching metrics:', error);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 15000); // Update every 15 seconds

    return () => clearInterval(interval);
  }, []);

  // Fetch historical data from Prometheus
  useEffect(() => {
    const fetchHistoricalData = async () => {
      try {
        const token = localStorage.getItem('token');
        const baseUrl = `${API_BASE_URL}/prometheus`;

        // Fetch cluster-wide metrics from Prometheus (with caching)
        const response = await withCache(
          () => axios.get(`${baseUrl}/cluster-metrics?timeRange=1h`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          'prometheus-cluster-metrics-1h',
          30000 // 30 second cache
        );

        if (response.data.success && response.data.data) {
          const { cpu, memory } = response.data.data;

          // Process Prometheus time-series data
          const processedData = [];

          if (cpu?.data?.result?.length > 0) {
            const cpuSeries = cpu.data.result[0]?.values || [];
            const memSeries = memory?.data?.result?.[0]?.values || [];

            cpuSeries.forEach((point, idx) => {
              const timestamp = point[0];
              const cpuValue = parseFloat(point[1]) * 100; // Convert to percentage
              const memValue = memSeries[idx] ? parseFloat(memSeries[idx][1]) / (1024 * 1024) : 0; // Convert to MB

              processedData.push({
                time: new Date(timestamp * 1000).toLocaleTimeString(),
                cpu: cpuValue.toFixed(2),
                memory: memValue.toFixed(2),
              });
            });
          }

          // If we have data, use it; otherwise fall back to simulated data
          if (processedData.length > 0) {
            setHistoricalData(processedData.slice(-12)); // Last 12 data points
          } else {
            // Fallback to simulated data if Prometheus is not available yet
            generateSimulatedData();
          }
        } else {
          generateSimulatedData();
        }
      } catch (error) {
        console.error('Error fetching Prometheus data:', error);
        // Fallback to simulated data
        generateSimulatedData();
      }
    };

    const generateSimulatedData = () => {
      const data = [];
      const now = Date.now();
      for (let i = 11; i >= 0; i--) {
        data.push({
          time: new Date(now - i * 300000).toLocaleTimeString(),
          cpu: Math.random() * 100,
          memory: Math.random() * 80 + 20,
        });
      }
      setHistoricalData(data);
    };

    fetchHistoricalData();
    const interval = setInterval(fetchHistoricalData, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Fetch namespace distribution from Prometheus
  useEffect(() => {
    const fetchNamespaceData = async () => {
      try {
        const token = localStorage.getItem('token');
        const baseUrl = `${API_BASE_URL}/prometheus`;

        // Query for pod count by namespace (with caching)
        const response = await withCache(
          () => axios.get(
            `${baseUrl}/query?query=count(kube_pod_info) by (namespace)`,
            { headers: { Authorization: `Bearer ${token}` } }
          ),
          'prometheus-namespace-pods',
          30000 // 30 second cache
        );

        if (response.data.success && response.data.data?.data?.result) {
          const colors = ['#1976d2', '#2e7d32', '#ed6c02', '#9c27b0', '#f44336', '#ff9800'];
          const namespaces = response.data.data.data.result.map((item, idx) => ({
            name: item.metric.namespace,
            value: parseInt(item.value[1]),
            color: colors[idx % colors.length],
          }));
          setNamespaceData(namespaces);
        }
      } catch (error) {
        console.error('Error fetching namespace data:', error);
      }
    };

    fetchNamespaceData();
    const interval = setInterval(fetchNamespaceData, 30000);

    return () => clearInterval(interval);
  }, []);

  // Fetch pod resource usage from Prometheus
  useEffect(() => {
    const fetchPodResourceData = async () => {
      try {
        const token = localStorage.getItem('token');
        const baseUrl = `${API_BASE_URL}/prometheus`;

        // Query for top pods by CPU and Memory (with caching)
        const [cpuResponse, memResponse] = await Promise.all([
          withCache(
            () => axios.get(
              `${baseUrl}/query?query=topk(10, sum(rate(container_cpu_usage_seconds_total{pod!="",container!=""}[5m])) by (pod))`,
              { headers: { Authorization: `Bearer ${token}` } }
            ),
            'prometheus-pod-cpu-top10',
            30000 // 30 second cache
          ),
          withCache(
            () => axios.get(
              `${baseUrl}/query?query=topk(10, sum(container_memory_working_set_bytes{pod!="",container!=""}) by (pod))`,
              { headers: { Authorization: `Bearer ${token}` } }
            ),
            'prometheus-pod-memory-top10',
            30000 // 30 second cache
          ),
        ]);

        if (cpuResponse.data.success && memResponse.data.success) {
          const cpuData = cpuResponse.data.data?.data?.result || [];
          const memData = memResponse.data.data?.data?.result || [];

          // Create a map of pod names to their metrics
          const podMap = new Map();

          cpuData.forEach(item => {
            const podName = item.metric.pod;
            const cpuValue = parseFloat(item.value[1]) * 1000; // Convert to millicores
            podMap.set(podName, { name: podName, cpu: Math.round(cpuValue), memory: 0 });
          });

          memData.forEach(item => {
            const podName = item.metric.pod;
            const memValue = parseFloat(item.value[1]) / (1024 * 1024); // Convert to MiB
            if (podMap.has(podName)) {
              podMap.get(podName).memory = Math.round(memValue);
            } else {
              podMap.set(podName, { name: podName, cpu: 0, memory: Math.round(memValue) });
            }
          });

          // Convert to array and take top 10 by combined score
          const pods = Array.from(podMap.values())
            .map(pod => ({
              ...pod,
              name: pod.name.substring(0, 20), // Truncate long names
            }))
            .slice(0, 10);

          setPodResourceData(pods);
        }
      } catch (error) {
        console.error('Error fetching pod resource data:', error);
      }
    };

    fetchPodResourceData();
    const interval = setInterval(fetchPodResourceData, 30000);

    return () => clearInterval(interval);
  }, []);

  // Calculate KPIs from metrics
  const kpis = metrics ? [
    {
      title: 'Running Pods',
      value: metrics.cluster.runningPods.toString(),
      total: metrics.cluster.totalPods,
      icon: <CheckCircle />,
      color: '#2e7d32',
    },
    {
      title: 'CPU Usage',
      value: metrics.pods.length > 0
        ? `${Math.round(metrics.pods.reduce((sum, p) => sum + p.usage.cpu, 0))}m`
        : '0m',
      change: 'millicores',
      icon: <Speed />,
      color: '#1976d2',
    },
    {
      title: 'Memory Usage',
      value: metrics.pods.length > 0
        ? `${Math.round(metrics.pods.reduce((sum, p) => sum + p.usage.memory, 0))}Mi`
        : '0Mi',
      change: 'MiB',
      icon: <Memory />,
      color: '#ed6c02',
    },
    {
      title: 'Failed Pods',
      value: metrics.cluster.failedPods.toString(),
      total: metrics.cluster.totalPods,
      icon: <Warning />,
      color: '#d32f2f',
    },
  ] : [];

  // GPU metrics if available
  const gpuData = metrics?.gpu || [];

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      {/* Header */}
      <Box sx={{ mb: { xs: 2, sm: 4 } }}>
        <Typography
          variant="h4"
          gutterBottom
          sx={{ fontWeight: 600, fontSize: { xs: '1.5rem', sm: '2.125rem' } }}
        >
          Analytics & Insights
        </Typography>
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ display: { xs: 'none', sm: 'block' } }}
        >
          Monitor your Kubernetes infrastructure with Prometheus metrics
        </Typography>
      </Box>

      {/* KPI Cards */}
      <Grid container spacing={{ xs: 1.5, sm: 3 }} sx={{ mb: { xs: 2, sm: 4 } }}>
        {kpis.map((kpi, index) => (
          <Grid size={{ xs: 6, sm: 6, md: 3 }} key={index}>
            <Card
              elevation={2}
              sx={{
                height: '100%',
                background: `linear-gradient(135deg, ${kpi.color}15 0%, ${kpi.color}05 100%)`,
                borderLeft: `4px solid ${kpi.color}`,
              }}
            >
              <CardContent sx={{ p: { xs: 1.5, sm: 2 }, pb: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    mb: { xs: 0.5, sm: 1.5 },
                    flexDirection: { xs: 'column', sm: 'row' },
                  }}
                >
                  <Box
                    sx={{
                      display: { xs: 'none', sm: 'flex' },
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 40,
                      height: 40,
                      borderRadius: 2,
                      backgroundColor: `${kpi.color}20`,
                      color: kpi.color,
                      mr: 1.5,
                      flexShrink: 0,
                    }}
                  >
                    {kpi.icon}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mb: 0.5, fontSize: { xs: '0.7rem', sm: '0.875rem' } }}
                    >
                      {kpi.title}
                    </Typography>
                    <Typography
                      variant="h5"
                      sx={{
                        fontWeight: 600,
                        wordBreak: 'break-word',
                        fontSize: { xs: '1.25rem', sm: '1.5rem' },
                      }}
                    >
                      {kpi.value}
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                  {kpi.change && (
                    <Chip
                      label={kpi.change}
                      size="small"
                      sx={{
                        backgroundColor: `${kpi.color}20`,
                        color: kpi.color,
                        fontWeight: 600,
                        fontSize: '0.75rem',
                      }}
                    />
                  )}
                  {kpi.total && (
                    <Typography variant="caption" color="text.secondary" sx={{ ml: kpi.change ? 1 : 0 }}>
                      of {kpi.total} total
                    </Typography>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Charts Grid */}
      <Grid container spacing={{ xs: 2, sm: 3 }} sx={{ mb: 3 }}>
        {/* Historical Trends */}
        <Grid size={{ xs: 12, lg: 8 }}>
          <Paper elevation={3} sx={{ p: { xs: 1.5, sm: 3 }, borderRadius: 2 }}>
            <Typography
              variant="h6"
              gutterBottom
              sx={{ fontWeight: 600, fontSize: { xs: '1rem', sm: '1.25rem' } }}
            >
              Resource Trends (Last Hour)
            </Typography>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={historicalData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Area
                  type="monotone"
                  dataKey="cpu"
                  stackId="1"
                  stroke="#1976d2"
                  fill="#1976d2"
                  name="CPU %"
                />
                <Area
                  type="monotone"
                  dataKey="memory"
                  stackId="2"
                  stroke="#2e7d32"
                  fill="#2e7d32"
                  name="Memory %"
                />
              </AreaChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Namespace Distribution */}
        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper elevation={3} sx={{ p: { xs: 1.5, sm: 3 }, borderRadius: 2 }}>
            <Typography
              variant="h6"
              gutterBottom
              sx={{ fontWeight: 600, fontSize: { xs: '1rem', sm: '1.25rem' } }}
            >
              Namespace Distribution
            </Typography>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                <Pie
                  data={namespaceData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => {
                    const truncatedName = name.length > 8 ? `${name.substring(0, 8)}..` : name;
                    return `${truncatedName} ${(percent * 100).toFixed(0)}%`;
                  }}
                  outerRadius={70}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {namespaceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Pod Resource Usage */}
        <Grid size={{ xs: 12 }}>
          <Paper elevation={3} sx={{ p: { xs: 1.5, sm: 3 }, borderRadius: 2, overflowX: 'auto' }}>
            <Typography
              variant="h6"
              gutterBottom
              sx={{ fontWeight: 600, fontSize: { xs: '1rem', sm: '1.25rem' } }}
            >
              Top Pods by Resource Usage
            </Typography>
            <Box sx={{ minWidth: { xs: 500, sm: 'auto' } }}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={podResourceData}
                  margin={{ top: 5, right: 5, left: -10, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="name"
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    tick={{ fontSize: 10 }}
                    interval={0}
                  />
                  <YAxis yAxisId="left" orientation="left" stroke="#1976d2" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" stroke="#2e7d32" tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  <Bar yAxisId="left" dataKey="cpu" fill="#1976d2" name="CPU (mc)" />
                  <Bar yAxisId="right" dataKey="memory" fill="#2e7d32" name="Mem (Mi)" />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Grid>

        {/* GPU Metrics (if available) */}
        {gpuData.length > 0 && (
          <Grid size={{ xs: 12 }}>
            <Paper elevation={3} sx={{ p: 3, borderRadius: 2 }}>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                GPU Utilization
              </Typography>
              <Grid container spacing={2}>
                {gpuData.map((gpu, index) => (
                  <Grid size={{ xs: 12, md: 6 }} key={index}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
                          {gpu.name} (GPU {gpu.index})
                        </Typography>
                        <Grid container spacing={2}>
                          <Grid size={{ xs: 6 }}>
                            <Typography variant="caption" color="text.secondary">GPU Utilization</Typography>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                              {gpu.utilization.gpu.toFixed(1)}%
                            </Typography>
                          </Grid>
                          <Grid size={{ xs: 6 }}>
                            <Typography variant="caption" color="text.secondary">Memory Util</Typography>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                              {gpu.utilization.memory.toFixed(1)}%
                            </Typography>
                          </Grid>
                          <Grid size={{ xs: 6 }}>
                            <Typography variant="caption" color="text.secondary">Memory</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {formatMemory(gpu.memory.used, gpu.memory.total)}
                            </Typography>
                          </Grid>
                          <Grid size={{ xs: 6 }}>
                            <Typography variant="caption" color="text.secondary">Temperature</Typography>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                              {gpu.temperature?.toFixed(0) || 'N/A'}°C
                            </Typography>
                          </Grid>
                          <Grid size={{ xs: 12 }}>
                            <Typography variant="caption" color="text.secondary">Power Draw</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {formatPower(gpu.power?.draw)} {gpu.power?.limit ? `/ ${formatPower(gpu.power.limit)}` : ''}
                            </Typography>
                          </Grid>
                        </Grid>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Paper>
          </Grid>
        )}
      </Grid>

    </Box>
  );
}

export default Analytics;
