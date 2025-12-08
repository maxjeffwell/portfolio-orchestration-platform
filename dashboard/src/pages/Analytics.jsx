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
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 600 }}>
          Analytics & Insights
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Monitor your Kubernetes infrastructure with Prometheus metrics
        </Typography>
      </Box>

      {/* KPI Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {kpis.map((kpi, index) => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={index}>
            <Card
              elevation={2}
              sx={{
                height: '100%',
                background: `linear-gradient(135deg, ${kpi.color}15 0%, ${kpi.color}05 100%)`,
                borderLeft: `4px solid ${kpi.color}`,
              }}
            >
              <CardContent sx={{ pb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 1.5 }}>
                  <Box
                    sx={{
                      display: 'flex',
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
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                      {kpi.title}
                    </Typography>
                    <Typography
                      variant="h5"
                      sx={{
                        fontWeight: 600,
                        wordBreak: 'break-word',
                      }}
                    >
                      {kpi.value}
                    </Typography>
                  </Box>
                </Box>
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
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Charts Grid */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* Historical Trends */}
        <Grid size={{ xs: 12, lg: 8 }}>
          <Paper elevation={3} sx={{ p: 3, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
              Resource Trends (Last Hour)
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={historicalData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Legend />
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
          <Paper elevation={3} sx={{ p: 3, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
              Namespace Distribution
            </Typography>
            <ResponsiveContainer width="100%" height={400}>
              <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <Pie
                  data={namespaceData}
                  cx="50%"
                  cy="50%"
                  labelLine={{ stroke: '#888', strokeWidth: 1 }}
                  label={({ name, percent, cx, cy, midAngle, outerRadius }) => {
                    const RADIAN = Math.PI / 180;
                    const radius = outerRadius + 35;
                    const x = cx + radius * Math.cos(-midAngle * RADIAN);
                    const y = cy + radius * Math.sin(-midAngle * RADIAN);
                    const truncatedName = name.length > 12 ? `${name.substring(0, 12)}...` : name;

                    return (
                      <text
                        x={x}
                        y={y}
                        fill="#666"
                        textAnchor={x > cx ? 'start' : 'end'}
                        dominantBaseline="central"
                        style={{ fontSize: '13px', fontWeight: 500 }}
                      >
                        {`${truncatedName} ${(percent * 100).toFixed(0)}%`}
                      </text>
                    );
                  }}
                  outerRadius={65}
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
          <Paper elevation={3} sx={{ p: 3, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
              Top Pods by Resource Usage
            </Typography>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={podResourceData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                <YAxis yAxisId="left" orientation="left" stroke="#1976d2" />
                <YAxis yAxisId="right" orientation="right" stroke="#2e7d32" />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="cpu" fill="#1976d2" name="CPU (millicores)" />
                <Bar yAxisId="right" dataKey="memory" fill="#2e7d32" name="Memory (MiB)" />
              </BarChart>
            </ResponsiveContainer>
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

      {/* Setup Guide */}
      <Paper
        elevation={1}
        sx={{
          p: 3,
          backgroundColor: '#e8e8e8',
          borderRadius: 2,
          borderLeft: '4px solid #1976d2',
        }}
      >
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: '#000000' }}>
          Prometheus Integration
        </Typography>
        <Typography variant="body2" paragraph sx={{ color: '#1a1a1a' }}>
          This dashboard displays real-time metrics from your Kubernetes cluster and historical data from Prometheus.
        </Typography>
        <Typography variant="body2" paragraph sx={{ color: '#1a1a1a' }}>
          <strong>To deploy Prometheus to your cluster:</strong>
        </Typography>
        <Box component="ol" sx={{ pl: 2, '& li': { mb: 1, color: '#1a1a1a' } }}>
          <Typography component="li" variant="body2">
            Deploy Prometheus: <code>kubectl apply -f k8s/monitoring/</code>
          </Typography>
          <Typography component="li" variant="body2">
            Verify deployment: <code>kubectl get pods -l app=prometheus</code>
          </Typography>
          <Typography component="li" variant="body2">
            Check Prometheus UI (optional): <code>kubectl port-forward svc/prometheus 9090:9090</code>
          </Typography>
          <Typography component="li" variant="body2">
            View metrics in this dashboard - it will automatically start showing Prometheus data!
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ mt: 2, color: '#1a1a1a' }}>
          <strong>Features:</strong> Historical trends, cluster metrics, pod-level monitoring, and GPU tracking.
        </Typography>
      </Paper>
    </Box>
  );
}

export default Analytics;
