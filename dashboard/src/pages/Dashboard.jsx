import { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import podService from '../services/podService';
import deploymentService from '../services/deploymentService';
import socketService from '../services/socketService';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalPods: 0,
    runningPods: 0,
    failedPods: 0,
    pendingPods: 0,
    totalDeployments: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const [pods, deployments] = await Promise.all([
        podService.getAllPods(),
        deploymentService.getAllDeployments(),
      ]);

      const podStats = {
        totalPods: pods.length,
        runningPods: pods.filter((p) => p.status?.phase === 'Running').length,
        failedPods: pods.filter((p) => p.status?.phase === 'Failed').length,
        pendingPods: pods.filter((p) => p.status?.phase === 'Pending').length,
        totalDeployments: deployments.length,
      };

      setStats(podStats);
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();

    socketService.connect();
    socketService.on('pod-update', fetchStats);
    socketService.on('deployment-update', fetchStats);

    return () => {
      socketService.off('pod-update', fetchStats);
      socketService.off('deployment-update', fetchStats);
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
    return <Alert severity="error">Error loading dashboard: {error}</Alert>;
  }

  const statCards = [
    {
      title: 'Total Pods',
      value: stats.totalPods,
      icon: <CheckCircleIcon color="primary" sx={{ fontSize: 40 }} />,
      color: 'primary',
    },
    {
      title: 'Running Pods',
      value: stats.runningPods,
      icon: <CheckCircleIcon color="success" sx={{ fontSize: 40 }} />,
      color: 'success',
    },
    {
      title: 'Failed Pods',
      value: stats.failedPods,
      icon: <ErrorIcon color="error" sx={{ fontSize: 40 }} />,
      color: 'error',
    },
    {
      title: 'Pending Pods',
      value: stats.pendingPods,
      icon: <WarningIcon color="warning" sx={{ fontSize: 40 }} />,
      color: 'warning',
    },
    {
      title: 'Total Deployments',
      value: stats.totalDeployments,
      icon: <CheckCircleIcon color="primary" sx={{ fontSize: 40 }} />,
      color: 'primary',
    },
  ];

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>
      <Grid container spacing={3}>
        {statCards.map((card) => (
          <Grid item xs={12} sm={6} md={4} key={card.title}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography color="textSecondary" gutterBottom>
                      {card.title}
                    </Typography>
                    <Typography variant="h3">{card.value}</Typography>
                  </Box>
                  {card.icon}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
