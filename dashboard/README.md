# Portfolio Orchestration Dashboard

A modern React dashboard for monitoring and managing Kubernetes pods and deployments in the Portfolio Orchestration Platform.

## Features

- **Real-time Monitoring**: Live updates of pod and deployment status using Socket.io
- **Pod Management**: View, restart, and delete pods with detailed status information
- **Deployment Control**: Scale deployments and view replica status
- **Metrics Visualization**: Interactive charts showing CPU and memory usage across pods
- **Log Viewer**: Stream and view pod logs in real-time
- **Material-UI Design**: Modern, responsive dark theme interface

## Tech Stack

- **React 19** - UI framework
- **Vite** - Build tool and dev server
- **Material-UI v7** - Component library
- **Recharts** - Data visualization
- **Axios** - HTTP client
- **Socket.io Client** - Real-time updates
- **React Router** - Client-side routing

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- Backend API server running (see `/api` directory)

### Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
```

### Development

```bash
# Start development server
npm run dev
```

The dashboard will be available at `http://localhost:3000`

### Production Build

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

## Docker

### Build Docker Image

```bash
docker build -t maxjeffwell/portfolio-dashboard:latest .
```

### Run with Docker

```bash
docker run -p 80:80 maxjeffwell/portfolio-dashboard:latest
```

## Kubernetes Deployment

Deploy to your Kubernetes cluster:

```bash
# Deploy dashboard
kubectl apply -f ../k8s/deployments/dashboard-deployment.yaml

# Create service
kubectl apply -f ../k8s/services/dashboard-service.yaml

# Check status
kubectl get pods -l app=dashboard
kubectl get svc dashboard-service
```

Access the dashboard through the LoadBalancer IP or use port-forwarding:

```bash
kubectl port-forward svc/dashboard-service 8080:80
```

Then open `http://localhost:8080` in your browser.

## Project Structure

```
dashboard/
├── src/
│   ├── components/        # React components
│   │   └── Layout.jsx     # Main layout with navigation
│   ├── pages/             # Page components
│   │   ├── Dashboard.jsx  # Overview dashboard
│   │   ├── Pods.jsx       # Pod management
│   │   ├── Deployments.jsx # Deployment management
│   │   ├── Metrics.jsx    # Metrics visualization
│   │   └── Logs.jsx       # Log viewer
│   ├── services/          # API clients
│   │   ├── api.js         # Axios configuration
│   │   ├── podService.js  # Pod API calls
│   │   ├── deploymentService.js # Deployment API calls
│   │   ├── metricsService.js # Metrics API calls
│   │   └── socketService.js # Socket.io client
│   ├── theme.js           # Material-UI theme
│   ├── App.jsx            # Main app component
│   └── main.jsx           # Entry point
├── Dockerfile             # Multi-stage Docker build
├── nginx.conf             # Nginx configuration
├── vite.config.js         # Vite configuration
└── package.json           # Dependencies
```

## Environment Variables

Create a `.env` file based on `.env.example`:

```env
VITE_API_URL=http://localhost:5000
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Features Overview

### Dashboard Page
- Quick stats overview
- Total pods, running, failed, and pending counts
- Deployment statistics
- Real-time updates

### Pods Page
- List all pods with status
- View pod logs
- Restart pods
- Delete pods
- Real-time status updates

### Deployments Page
- List all deployments
- Scale deployments
- View replica status
- Restart deployments

### Metrics Page
- CPU usage charts
- Memory usage visualization
- Cluster overview statistics

### Logs Page
- Select any pod
- View real-time logs
- Search and filter logs

## API Integration

The dashboard communicates with the backend API server at `/api`. The following endpoints are used:

- `GET /api/pods` - Get all pods
- `GET /api/pods/:name` - Get pod details
- `GET /api/pods/:name/logs` - Get pod logs
- `POST /api/pods/:name/restart` - Restart pod
- `DELETE /api/pods/:name` - Delete pod
- `GET /api/deployments` - Get all deployments
- `POST /api/deployments/:name/scale` - Scale deployment
- `GET /api/metrics/pods` - Get pod metrics
- `GET /api/metrics/cluster` - Get cluster metrics

WebSocket events:
- `pod-update` - Pod status changed
- `deployment-update` - Deployment changed

## Contributing

This is part of the Portfolio Orchestration Platform. See the main README for contribution guidelines.

## License

MIT
