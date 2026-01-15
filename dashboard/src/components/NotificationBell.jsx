import { useState } from 'react';
import {
  Badge,
  Box,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Popover,
  Typography,
  Button,
  Chip,
  CircularProgress,
} from '@mui/material';
import {
  Notifications as NotificationsIcon,
  NotificationsNone as NotificationsNoneIcon,
  Delete as DeleteIcon,
  DeleteSweep as ClearAllIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  CheckCircle as SuccessIcon,
} from '@mui/icons-material';
import { useNotifications } from '../contexts/NotificationContext';

// Get icon and color based on priority
const getPriorityInfo = (priority) => {
  if (priority >= 8) {
    return { icon: <ErrorIcon fontSize="small" />, color: 'error', label: 'Critical' };
  }
  if (priority >= 6) {
    return { icon: <WarningIcon fontSize="small" />, color: 'warning', label: 'Warning' };
  }
  if (priority >= 4) {
    return { icon: <InfoIcon fontSize="small" />, color: 'info', label: 'Info' };
  }
  return { icon: <SuccessIcon fontSize="small" />, color: 'success', label: 'Low' };
};

// Format relative time
const formatTime = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

export default function NotificationBell() {
  const [anchorEl, setAnchorEl] = useState(null);
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
  } = useNotifications();

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleNotificationClick = (notification) => {
    markAsRead(notification.id);
  };

  const handleDelete = async (event, id) => {
    event.stopPropagation();
    try {
      await deleteNotification(id);
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const handleClearAll = async () => {
    try {
      await clearAll();
      handleClose();
    } catch (err) {
      console.error('Failed to clear notifications:', err);
    }
  };

  const handleMarkAllRead = () => {
    markAllAsRead();
  };

  const open = Boolean(anchorEl);
  const id = open ? 'notification-popover' : undefined;

  return (
    <>
      <IconButton
        color="inherit"
        onClick={handleClick}
        aria-describedby={id}
        sx={{ ml: 1 }}
      >
        <Badge badgeContent={unreadCount} color="error" max={99}>
          {unreadCount > 0 ? <NotificationsIcon /> : <NotificationsNoneIcon />}
        </Badge>
      </IconButton>

      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        PaperProps={{
          sx: {
            width: { xs: 300, sm: 380 },
            maxHeight: 480,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        {/* Header */}
        <Box
          sx={{
            p: 2,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Typography variant="h6">Notifications</Typography>
          {unreadCount > 0 && (
            <Button size="small" onClick={handleMarkAllRead}>
              Mark all read
            </Button>
          )}
        </Box>

        {/* Notification List */}
        <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : notifications.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <NotificationsNoneIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography color="text.secondary">No notifications</Typography>
            </Box>
          ) : (
            <List disablePadding>
              {notifications.map((notification, index) => {
                const priorityInfo = getPriorityInfo(notification.priority);
                const readIds = JSON.parse(localStorage.getItem('read_notification_ids') || '[]');
                const isRead = readIds.includes(notification.id);

                return (
                  <Box key={notification.id}>
                    <ListItem
                      disablePadding
                      secondaryAction={
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={(e) => handleDelete(e, notification.id)}
                          sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      }
                    >
                      <ListItemButton
                        onClick={() => handleNotificationClick(notification)}
                        sx={{
                          bgcolor: isRead ? 'transparent' : 'action.hover',
                          '&:hover': {
                            bgcolor: isRead ? 'action.hover' : 'action.selected',
                          },
                        }}
                      >
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                              <Typography
                                variant="subtitle2"
                                sx={{
                                  fontWeight: isRead ? 'normal' : 'bold',
                                  flexGrow: 1,
                                }}
                              >
                                {notification.title}
                              </Typography>
                              <Chip
                                size="small"
                                icon={priorityInfo.icon}
                                label={priorityInfo.label}
                                color={priorityInfo.color}
                                sx={{ height: 20, fontSize: '0.7rem' }}
                              />
                            </Box>
                          }
                          secondary={
                            <>
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden',
                                  mb: 0.5,
                                }}
                              >
                                {notification.message}
                              </Typography>
                              <Typography variant="caption" color="text.disabled">
                                {formatTime(notification.date)}
                              </Typography>
                            </>
                          }
                        />
                      </ListItemButton>
                    </ListItem>
                    {index < notifications.length - 1 && <Divider />}
                  </Box>
                );
              })}
            </List>
          )}
        </Box>

        {/* Footer */}
        {notifications.length > 0 && (
          <Box
            sx={{
              p: 1,
              borderTop: 1,
              borderColor: 'divider',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <Button
              size="small"
              color="error"
              startIcon={<ClearAllIcon />}
              onClick={handleClearAll}
            >
              Clear All
            </Button>
          </Box>
        )}
      </Popover>
    </>
  );
}
