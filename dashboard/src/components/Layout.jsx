import { useState } from 'react';
import {
  AppBar,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Toolbar,
  Typography,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  ViewList as ViewListIcon,
  CloudUpload as DeployIcon,
  Assessment as AssessmentIcon,
  Description as LogsIcon,
  BarChart as AnalyticsIcon,
  Psychology as AIChatIcon,
  Logout as LogoutIcon,
  AccountTree as ArgoIcon,
  Hub as PodrickIcon,
  Apartment as TenantFlowIcon,
  Speed as GrafanaIcon,
  QueryStats as PrometheusIcon,
  AltRoute as TraefikIcon,
  Timeline as LangfuseIcon,
  AutoStories as StorybookIcon,
} from '@mui/icons-material';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ConnectionStatus from './ConnectionStatus';
import NotificationBell from './NotificationBell';

const drawerWidth = 240;

const navigationItems = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },
  { text: 'Pods', icon: <ViewListIcon />, path: '/pods' },
  { text: 'Deployments', icon: <DeployIcon />, path: '/deployments' },
  { text: 'Metrics', icon: <AssessmentIcon />, path: '/metrics' },
  { text: 'Logs', icon: <LogsIcon />, path: '/logs' },
  { text: 'Analytics', icon: <AnalyticsIcon />, path: '/analytics' },
  { text: 'AI Chat', icon: <AIChatIcon />, path: '/ai-chat' },
];

const applicationItems = [
  { text: 'ArgoCD', icon: <ArgoIcon />, path: 'https://argocd.el-jefe.me', external: true },
  { text: 'PodRick', icon: <PodrickIcon />, path: 'https://podrick.el-jefe.me', external: true },
  { text: 'TenantFlow', icon: <TenantFlowIcon />, path: 'https://tenantflow.el-jefe.me', external: true },
  { text: 'React Storybook', icon: <StorybookIcon />, path: 'https://showcase.el-jefe.me', external: true },
];

const monitoringItems = [
  { text: 'Grafana', icon: <GrafanaIcon />, path: 'https://grafana.el-jefe.me', external: true },
  { text: 'Prometheus', icon: <PrometheusIcon />, path: 'https://prometheus.el-jefe.me', external: true },
  { text: 'Traefik', icon: <TraefikIcon />, path: 'https://traefik.el-jefe.me/dashboard/', external: true },
  { text: 'Langfuse', icon: <LangfuseIcon />, path: 'https://langfuse.el-jefe.me', external: true },
];

export default function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const renderMenuItems = (items) =>
    items.map((item) => (
      <ListItem key={item.text} disablePadding>
        <ListItemButton
          component={item.external ? 'a' : Link}
          {...(item.external ? { href: item.path, target: '_blank', rel: 'noopener noreferrer' } : { to: item.path })}
          selected={!item.external && location.pathname === item.path}
          onClick={() => setMobileOpen(false)}
        >
          <ListItemIcon sx={{ color: !item.external && location.pathname === item.path ? 'primary.main' : 'inherit' }}>
            {item.icon}
          </ListItemIcon>
          <ListItemText primary={item.text} />
        </ListItemButton>
      </ListItem>
    ));

  const drawer = (
    <div>
      <Toolbar>
        <Typography variant="h6" noWrap component="div">
          Pop!_Portfolio
        </Typography>
      </Toolbar>
      <List subheader={<ListSubheader>Navigation</ListSubheader>}>
        {renderMenuItems(navigationItems)}
      </List>
      <Divider />
      <List subheader={<ListSubheader>Applications</ListSubheader>}>
        {renderMenuItems(applicationItems)}
      </List>
      <Divider />
      <List subheader={<ListSubheader>Monitoring</ListSubheader>}>
        {renderMenuItems(monitoringItems)}
      </List>
    </div>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography
            variant="h6"
            noWrap
            component="div"
            sx={{
              flexGrow: 1,
              textAlign: 'center',
              fontSize: { xs: '0.9rem', sm: '1.25rem' },
            }}
          >
            <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>
              Portfolio Orchestration Platform
            </Box>
            <Box component="span" sx={{ display: { xs: 'inline', md: 'none' } }}>
              POP Dashboard
            </Box>
          </Typography>
          {user && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 } }}>
              <ConnectionStatus />
              <NotificationBell />
              <Typography variant="body2" sx={{ display: { xs: 'none', sm: 'block' } }}>
                {user.username}
              </Typography>
              <Button
                color="inherit"
                onClick={handleLogout}
                startIcon={<LogoutIcon />}
                sx={{
                  minWidth: { xs: 'auto', sm: '64px' },
                  px: { xs: 1, sm: 2 }
                }}
              >
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                  Logout
                </Box>
              </Button>
            </Box>
          )}
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true,
          }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3 },
          width: { sm: `calc(100% - ${drawerWidth}px)` },
        }}
      >
        <Toolbar />
        {children}
      </Box>
    </Box>
  );
}
