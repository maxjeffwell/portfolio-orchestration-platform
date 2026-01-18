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

function Dashboard() {
  const [stats, setStats] = useState({
    totalPods: 0,
    runningPods: 0,
    failedPods: 0,
    pendingPods: 0,
    totalDeployments: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
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
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchStats();

    socketService.connect();
    socketService.emit('subscribe:pods');
    socketService.emit('subscribe:deployments');

    const handleUpdate = (data) => {
      console.log('Received WebSocket update', data);
      fetchStats(false); // Don't show loading spinner on WebSocket updates
    };

    socketService.on('pods:update', handleUpdate);
    socketService.on('deployments:update', handleUpdate);

    return () => {
      socketService.off('pods:update', handleUpdate);
      socketService.off('deployments:update', handleUpdate);
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
      <Typography
        variant="h4"
        gutterBottom
        sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}
      >
        Dashboard
      </Typography>
      <Grid container spacing={{ xs: 2, sm: 3 }}>
        {statCards.map((card) => (
          <Grid size={{ xs: 6, sm: 6, md: 4 }} key={card.title}>
            <Card sx={{ height: '100%' }}>
              <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
                <Box
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                  flexDirection={{ xs: 'column', sm: 'row' }}
                  textAlign={{ xs: 'center', sm: 'left' }}
                  gap={{ xs: 1, sm: 0 }}
                >
                  <Box order={{ xs: 2, sm: 1 }}>
                    <Typography
                      color="textSecondary"
                      gutterBottom
                      sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                    >
                      {card.title}
                    </Typography>
                    <Typography
                      variant="h3"
                      sx={{ fontSize: { xs: '1.75rem', sm: '3rem' } }}
                    >
                      {card.value}
                    </Typography>
                  </Box>
                  <Box
                    order={{ xs: 1, sm: 2 }}
                    sx={{
                      '& .MuiSvgIcon-root': {
                        fontSize: { xs: 32, sm: 40 },
                      },
                    }}
                  >
                    {card.icon}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

export default Dashboard;
