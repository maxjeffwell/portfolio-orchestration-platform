import { Box, Card, CardContent, Grid, Typography, Paper, Chip } from '@mui/material';
import {
  TrendingUp,
  Speed,
  CheckCircle,
  Warning,
} from '@mui/icons-material';
import MetabaseDashboard from '../components/MetabaseDashboard';
import MetabaseQuestion from '../components/MetabaseQuestion';

function Analytics() {
  // KPI data - these could come from your API
  const kpis = [
    {
      title: 'Total Deployments',
      value: '1,247',
      change: '+12.5%',
      icon: <TrendingUp />,
      color: '#1976d2',
    },
    {
      title: 'Avg Response Time',
      value: '245ms',
      change: '-8.2%',
      icon: <Speed />,
      color: '#2e7d32',
    },
    {
      title: 'Success Rate',
      value: '99.8%',
      change: '+0.3%',
      icon: <CheckCircle />,
      color: '#ed6c02',
    },
    {
      title: 'Active Alerts',
      value: '3',
      change: '-2',
      icon: <Warning />,
      color: '#d32f2f',
    },
  ];

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 600 }}>
          Analytics & Insights
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Monitor your Kubernetes infrastructure and application performance
        </Typography>
      </Box>

      {/* KPI Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {kpis.map((kpi, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Card
              elevation={2}
              sx={{
                height: '100%',
                background: `linear-gradient(135deg, ${kpi.color}15 0%, ${kpi.color}05 100%)`,
                borderLeft: `4px solid ${kpi.color}`,
              }}
            >
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 48,
                      height: 48,
                      borderRadius: 2,
                      backgroundColor: `${kpi.color}20`,
                      color: kpi.color,
                      mr: 2,
                    }}
                  >
                    {kpi.icon}
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      {kpi.title}
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 600 }}>
                      {kpi.value}
                    </Typography>
                  </Box>
                </Box>
                <Chip
                  label={kpi.change}
                  size="small"
                  sx={{
                    backgroundColor: kpi.change.startsWith('+') ? '#4caf5020' : '#f4433620',
                    color: kpi.change.startsWith('+') ? '#2e7d32' : '#d32f2f',
                    fontWeight: 600,
                  }}
                />
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Main Dashboard */}
      <Box sx={{ mb: 3 }}>
        <Paper elevation={3} sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <MetabaseDashboard
            dashboardId={1}
            title="Infrastructure Overview"
            height="700px"
          />
        </Paper>
      </Box>

      {/* Charts Grid */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Paper elevation={3} sx={{ borderRadius: 2, overflow: 'hidden' }}>
            <MetabaseQuestion
              questionId={1}
              title="Pod Resource Usage"
              height="400px"
            />
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper elevation={3} sx={{ borderRadius: 2, overflow: 'hidden' }}>
            <MetabaseQuestion
              questionId={2}
              title="Deployment Frequency"
              height="400px"
            />
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper elevation={3} sx={{ borderRadius: 2, overflow: 'hidden' }}>
            <MetabaseQuestion
              questionId={3}
              title="Namespace Distribution"
              height="400px"
            />
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper elevation={3} sx={{ borderRadius: 2, overflow: 'hidden' }}>
            <MetabaseQuestion
              questionId={4}
              title="Error Rate Trends"
              height="400px"
            />
          </Paper>
        </Grid>
      </Grid>

      {/* Setup Guide */}
      <Paper
        elevation={1}
        sx={{
          p: 3,
          backgroundColor: '#f5f5f5',
          borderRadius: 2,
          borderLeft: '4px solid #1976d2',
        }}
      >
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
          📊 Configure Your Analytics
        </Typography>
        <Typography variant="body2" paragraph>
          To customize the dashboards above with your actual Metabase data:
        </Typography>
        <Box component="ol" sx={{ pl: 2, '& li': { mb: 1 } }}>
          <Typography component="li" variant="body2">
            <strong>Get Dashboard IDs:</strong> In Metabase, navigate to your dashboard and note the ID from the URL
            (e.g., <code>/dashboard/5</code> means ID is <code>5</code>)
          </Typography>
          <Typography component="li" variant="body2">
            <strong>Enable Embedding:</strong> In the dashboard settings, enable "Embedding" for each
            dashboard/question you want to display
          </Typography>
          <Typography component="li" variant="body2">
            <strong>Add Secret Key:</strong> Copy your Metabase embedding secret key and add it to{' '}
            <code>api/.env</code> as <code>METABASE_SECRET_KEY</code>
          </Typography>
          <Typography component="li" variant="body2">
            <strong>Update IDs:</strong> Edit this file (<code>src/pages/Analytics.jsx</code>) and replace the
            placeholder dashboard/question IDs with your actual ones
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}

export default Analytics;
