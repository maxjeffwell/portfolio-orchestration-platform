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
} from '@mui/icons-material';
import deploymentService from '../services/deploymentService';
import socketService from '../services/socketService';

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

      <Card>
        <CardContent sx={{ p: { xs: 1, sm: 2 } }}>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Namespace</TableCell>
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

                  return (
                    <TableRow key={deployment.metadata?.uid}>
                      <TableCell sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>{deployment.metadata?.name}</TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{deployment.metadata?.namespace}</TableCell>
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

      <Dialog open={scaleDialogOpen} onClose={() => setScaleDialogOpen(false)}>
        <DialogTitle>
          Scale Deployment - {selectedDeployment?.metadata?.name}
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Replicas"
            type="number"
            value={replicas}
            onChange={(e) => setReplicas(e.target.value)}
            inputProps={{ min: 0 }}
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setScaleDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleScale} variant="contained" color="primary">
            Scale
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
