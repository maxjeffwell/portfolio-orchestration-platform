import { Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import theme from './theme';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Pods from './pages/Pods';
import Deployments from './pages/Deployments';
import Metrics from './pages/Metrics';
import Logs from './pages/Logs';

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/pods" element={<Pods />} />
          <Route path="/deployments" element={<Deployments />} />
          <Route path="/metrics" element={<Metrics />} />
          <Route path="/logs" element={<Logs />} />
        </Routes>
      </Layout>
    </ThemeProvider>
  );
}

export default App;
