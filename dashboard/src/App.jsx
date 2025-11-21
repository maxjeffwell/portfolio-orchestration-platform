import { Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import theme from './theme';
import { AuthProvider } from './contexts/AuthContext';
import { MetabaseProvider } from './components/MetabaseProvider';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Pods from './pages/Pods';
import Deployments from './pages/Deployments';
import Metrics from './pages/Metrics';
import Logs from './pages/Logs';
import Analytics from './pages/AnalyticsNew';

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <MetabaseProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/pods" element={<Pods />} />
                      <Route path="/deployments" element={<Deployments />} />
                      <Route path="/metrics" element={<Metrics />} />
                      <Route path="/logs" element={<Logs />} />
                      <Route path="/analytics" element={<Analytics />} />
                    </Routes>
                  </Layout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MetabaseProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
