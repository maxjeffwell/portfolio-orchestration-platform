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
  Edit as EditIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';
import deploymentService from '../services/deploymentService';
import socketService from '../services/socketService';
// URL mapping for portfolio apps (only frontend/client apps that have public URLs)
const APP_URLS = {
  'bookmarked-client': 'https://bookmarked-k8s.el-jefe.me/',
  'firebook-client': 'https://firebook-k8s.el-jefe.me/',
  'intervalai-client': 'https://intervalai-k8s.el-jefe.me/',
  'educationelly-client': 'https://educationelly-k8s.el-jefe.me/',
  'educationelly-graphql-client': 'https://educationelly-graphql-k8s.el-jefe.me/',
  'code-talk-client': 'https://code-talk-k8s.el-jefe.me/',
  'tenantflow-frontend': 'https://tenantflow.el-jefe.me/',
  'devops-portfolio-dashboard': 'https://podrick.el-jefe.me/',
  'vertex-platform-auth': 'https://vertex-platform.el-jefe.me/',
  'grafana': 'https://grafana.el-jefe.me/login',
  'prometheus': 'https://prometheus.el-jefe.me/query',
  // Backend/API services don't have public URLs
};
export default function Deployments() {
  const [deployments, setDeployments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDeployment, setSelectedDeployment] = useState(null);
  const [scaleDialogOpen, setScaleDialogOpen] = useState(false);
  const [replicas, setReplicas] = useState(1);
  const fetchDeployments = async () => {
    try {
      setLoading(true);
      const data = await deploymentService.getAllDeployments();
      setDeployments(data);
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching deployments:', err);
    } finally {
      setLoading(false);
    }
  };
  const handleOpenScaleDialog = (deployment) => {
    setSelectedDeployment(deployment);
    setReplicas(deployment.spec?.replicas || 1);
    setScaleDialogOpen(true);
  };
  const handleScale = async () => {
    try {
      await deploymentService.scaleDeployment(
        selectedDeployment.metadata?.name,
        parseInt(replicas)
      );
      setScaleDialogOpen(false);
      fetchDeployments();
    } catch (err) {
      console.error('Error scaling deployment:', err);
      alert('Error scaling deployment: ' + err.message);
    }
  };
  const handleRestart = async (name) => {
    try {
      await deploymentService.restartDeployment(name);
      fetchDeployments();
    } catch (err) {
      console.error('Error restarting deployment:', err);
      alert('Error restarting deployment: ' + err.message);
    }
  };
  useEffect(() => {
    fetchDeployments();
    socketService.connect();
    socketService.emit('subscribe:deployments');
    const handleDeploymentUpdate = (deploymentData) => {
      console.log('Received deployments:update', deploymentData);
      // WebSocket sends simplified deployment data, so we refetch for full details
      fetchDeployments();
    };
    socketService.on('deployments:update', handleDeploymentUpdate);
    return () => {
      socketService.off('deployments:update', handleDeploymentUpdate);
    };
  }, []);
  const getStatusColor = (available, desired) => {
    if (available === desired && desired > 0) return 'success';
    if (available === 0) return 'error';
    return 'warning';
  };
  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }
  if (error) {
    return <Alert severity="error">Error loading deployments: {error}</Alert>;
  }
  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={2}>
        <Typography variant="h4" sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>Deployments</Typography>
        <Button startIcon={<RefreshIcon />} onClick={fetchDeployments} variant="outlined" size="small">
          Refresh
        </Button>
      </Box>
      {/* Mobile Card View */}
      <Box sx={{ display: { xs: 'block', sm: 'none' } }}>
        {deployments.map((deployment) => {
          const available = deployment.status?.availableReplicas || 0;
          const desired = deployment.spec?.replicas || 0;
          const deploymentName = deployment.metadata?.name;
          const appUrl = APP_URLS[deploymentName];
          return (
            <Card key={deployment.metadata?.uid} sx={{ mb: 1.5 }}>
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Box sx={{ minWidth: 0, flex: 1, mr: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography
                        variant="subtitle2"
                        sx={{
                          fontWeight: 600,
                          fontSize: '0.85rem',
                          wordBreak: 'break-word',
                        }}
                      >
                        {deploymentName}
                      </Typography>
                      {appUrl && (
                        <IconButton
                          size="small"
                          onClick={(e) => { e.preventDefault(); window.open(appUrl, "_blank"); }}
                          title="Open app"
                          sx={{ p: 0.25 }}
                        >
                          <OpenInNewIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      )}
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {deployment.metadata?.namespace}
                    </Typography>
                  </Box>
                  <Chip
                    label={available === desired ? 'Ready' : 'Not Ready'}
                    color={getStatusColor(available, desired)}
                    size="small"
                  />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Typography variant="caption" color="text.secondary">
                      Replicas: {available}/{desired}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(deployment.metadata?.creationTimestamp).toLocaleDateString()}
                    </Typography>
                  </Box>
                  <Box>
                    <IconButton
                      size="small"
                      onClick={() => handleOpenScaleDialog(deployment)}
                      title="Scale Deployment"
                      sx={{ p: 0.75 }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleRestart(deployment.metadata?.name)}
                      title="Restart Deployment"
                      sx={{ p: 0.75 }}
                    >
                      <RefreshIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          );
        })}
      </Box>

      {/* Desktop Table View */}
      <Card sx={{ display: { xs: 'none', sm: 'block' } }}>
        <CardContent sx={{ p: 2 }}>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>URL</TableCell>
                  <TableCell>Namespace</TableCell>
                  <TableCell>Replicas</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Age</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {deployments.map((deployment) => {
                  const available = deployment.status?.availableReplicas || 0;
                  const desired = deployment.spec?.replicas || 0;
                  const deploymentName = deployment.metadata?.name;
                  const appUrl = APP_URLS[deploymentName];
                  return (
                    <TableRow key={deployment.metadata?.uid}>
                      <TableCell sx={{ fontSize: '0.875rem' }}>{deploymentName}</TableCell>
                      <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>
                        {appUrl ? (
                          <IconButton
                            size="small"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(appUrl, "_blank"); }}
                            title="Open app"
                          >
                            <OpenInNewIcon fontSize="small" />
                          </IconButton>
                        ) : (
                          <Typography variant="body2" color="text.secondary">-</Typography>
                        )}
                      </TableCell>
                      <TableCell>{deployment.metadata?.namespace}</TableCell>
                      <TableCell>
                        {available} / {desired}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={
                            available === desired ? 'Ready' : 'Not Ready'
                          }
                          color={getStatusColor(available, desired)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                        {new Date(deployment.metadata?.creationTimestamp).toLocaleDateString()}
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          onClick={() => handleOpenScaleDialog(deployment)}
                          title="Scale Deployment"
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleRestart(deployment.metadata?.name)}
                          title="Restart Deployment"
                        >
                          <RefreshIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
      <Dialog
        open={scaleDialogOpen}
        onClose={() => setScaleDialogOpen(false)}
        fullWidth
        maxWidth="xs"
        PaperProps={{
          sx: {
            m: { xs: 2, sm: 3 },
            width: { xs: 'calc(100% - 32px)', sm: 'auto' },
          },
        }}
      >
        <DialogTitle sx={{ fontSize: { xs: '1rem', sm: '1.25rem' }, pb: 1 }}>
          <Typography noWrap>
            Scale - {selectedDeployment?.metadata?.name}
          </Typography>
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Replicas"
            type="number"
            value={replicas}
            onChange={(e) => setReplicas(e.target.value)}
            inputProps={{ min: 0, inputMode: 'numeric' }}
            margin="normal"
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setScaleDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleScale} variant="contained" color="primary">
            Scale
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
