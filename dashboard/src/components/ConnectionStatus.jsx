import { useState, useEffect } from 'react';
import { Box, Chip, Tooltip } from '@mui/material';
import {
  Circle as CircleIcon,
  WifiOff as WifiOffIcon,
  Sync as SyncIcon,
} from '@mui/icons-material';
import socketService from '../services/socketService';

const ConnectionStatus = () => {
  const [connectionState, setConnectionState] = useState('disconnected');
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    const updateConnectionState = () => {
      setConnectionState(socketService.getConnectionState());
    };

    // Initial state
    updateConnectionState();

    // Set up listeners
    const socket = socketService.connect();

    const handleConnect = () => {
      setConnectionState('connected');
      setIsReconnecting(false);
    };

    const handleDisconnect = () => {
      setConnectionState('disconnected');
    };

    const handleReconnecting = () => {
      setIsReconnecting(true);
    };

    const handleReconnectFailed = () => {
      setIsReconnecting(false);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.io.on('reconnect_attempt', handleReconnecting);
    socket.io.on('reconnect_failed', handleReconnectFailed);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.io.off('reconnect_attempt', handleReconnecting);
      socket.io.off('reconnect_failed', handleReconnectFailed);
    };
  }, []);

  const getStatusProps = () => {
    if (isReconnecting) {
      return {
        label: 'Reconnecting',
        color: 'warning',
        icon: <SyncIcon sx={{ animation: 'spin 1s linear infinite', '@keyframes spin': { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } } }} />,
      };
    }

    switch (connectionState) {
      case 'connected':
        return {
          label: 'Connected',
          color: 'success',
          icon: <CircleIcon sx={{ fontSize: 12 }} />,
        };
      case 'connecting':
        return {
          label: 'Connecting',
          color: 'warning',
          icon: <CircleIcon sx={{ fontSize: 12 }} />,
        };
      case 'disconnected':
      default:
        return {
          label: 'Disconnected',
          color: 'error',
          icon: <WifiOffIcon sx={{ fontSize: 16 }} />,
        };
    }
  };

  const statusProps = getStatusProps();

  return (
    <Tooltip title={`Real-time updates ${statusProps.label.toLowerCase()}`}>
      <Chip
        icon={statusProps.icon}
        label={statusProps.label}
        color={statusProps.color}
        size="small"
        sx={{
          height: 28,
          '& .MuiChip-icon': {
            marginLeft: '8px',
          },
        }}
      />
    </Tooltip>
  );
};

export default ConnectionStatus;
