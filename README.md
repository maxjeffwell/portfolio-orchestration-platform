# Portfolio Orchestration Platform

A Kubernetes-based orchestration platform that manages and monitors portfolio applications as containerized workloads. This project demonstrates cloud-native development practices, container orchestration, and modern DevOps workflows.

## Features

- **Real-time Pod Monitoring**: Live status tracking of all portfolio applications running as Kubernetes pods
- **Resource Metrics**: CPU, memory, and network usage visualization for each application
- **Log Aggregation**: Centralized logging with search and filtering capabilities
- **Deployment Controls**: Deploy, scale, restart, and manage applications through a web dashboard
- **Health Checks**: Automated health monitoring with liveness and readiness probes
- **Service Discovery**: Automatic service registration and DNS-based discovery
- **Load Balancing**: Intelligent traffic distribution across pod replicas
- **Auto-scaling**: Horizontal pod autoscaling based on resource utilization

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              React Dashboard (Frontend)              │
│         Real-time monitoring & management UI         │
└────────────────────┬────────────────────────────────┘
                     │
                     │ REST API
                     ▼
┌─────────────────────────────────────────────────────┐
│           Node.js API Server (Backend)              │
│      Kubernetes API client & business logic         │
└────────────────────┬────────────────────────────────┘
                     │
                     │ Kubernetes API
                     ▼
┌─────────────────────────────────────────────────────┐
│              Kubernetes Cluster                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │Bookmarked│  │ FireBook │  │Education-│  ...     │
│  │   Pod    │  │   Pod    │  │ ELLy Pod │          │
│  └──────────┘  └──────────┘  └──────────┘          │
└─────────────────────────────────────────────────────┘
                     │
                     │ Metrics
                     ▼
┌─────────────────────────────────────────────────────┐
│         Prometheus + Grafana (Monitoring)           │
│      Metrics collection & visualization             │
└─────────────────────────────────────────────────────┘
```

## Project Structure

```
portfolio-orchestration-platform/
├── dashboard/              # React frontend application
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── services/      # API clients
│   │   └── utils/         # Utility functions
│   └── package.json
├── api/                   # Node.js backend server
│   ├── src/
│   │   ├── controllers/  # Request handlers
│   │   ├── services/     # Business logic
│   │   └── routes/       # API routes
│   └── package.json
├── k8s/                   # Kubernetes manifests
│   ├── deployments/      # Deployment configurations
│   ├── services/         # Service definitions
│   ├── configmaps/       # Configuration data
│   └── secrets/          # Sensitive data
├── helm/                  # Helm charts
│   └── portfolio-platform/
│       ├── Chart.yaml
│       ├── values.yaml
│       └── templates/
├── monitoring/            # Monitoring configurations
│   ├── prometheus/       # Prometheus configs
│   └── grafana/          # Grafana dashboards
└── docs/                 # Documentation
    ├── SETUP.md          # Setup instructions
    ├── API.md            # API documentation
    └── DEPLOYMENT.md     # Deployment guide
```

## Technology Stack

### Frontend
- **React** - UI framework
- **Material-UI** - Component library
- **Recharts** - Data visualization
- **Axios** - HTTP client
- **Socket.io Client** - Real-time updates

### Backend
- **Node.js** - Runtime environment
- **Express** - Web framework
- **@kubernetes/client-node** - Kubernetes API client
- **Socket.io** - Real-time communication
- **Winston** - Logging

### Infrastructure
- **Kubernetes** - Container orchestration
- **Docker** - Containerization
- **Helm** - Package manager
- **Prometheus** - Metrics collection
- **Grafana** - Metrics visualization
- **K3s/Minikube** - Local development cluster

## Portfolio Applications

The platform manages the following portfolio applications: Bookmarked, FireBook, EducationELLy, EducationELLy-GraphQL, Code Talk, and IntervalAI.

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Docker Desktop or Docker Engine
- kubectl CLI
- Kubernetes cluster (K3s, Minikube, or cloud provider)
- Helm 3+

### Local Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/maxjeffwell/portfolio-orchestration-platform.git
   cd portfolio-orchestration-platform
   ```

2. **Start local Kubernetes cluster**
   ```bash
   # Using K3s
   curl -sfL https://get.k3s.io | sh -

   # Or using Minikube
   minikube start --driver=docker
   ```

3. **Install dependencies and start dashboard**
   ```bash
   cd dashboard
   npm install
   npm start
   ```

4. **Install dependencies and start API server**
   ```bash
   cd api
   npm install
   npm run dev
   ```

5. **Deploy portfolio applications to Kubernetes**
   ```bash
   kubectl apply -f k8s/deployments/
   kubectl apply -f k8s/services/
   ```

### Deployment to Production

See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed production deployment instructions.

## API Endpoints

### Pods
- `GET /api/pods` - List all pods
- `GET /api/pods/:name` - Get pod details
- `GET /api/pods/:name/logs` - Get pod logs
- `POST /api/pods/:name/restart` - Restart a pod
- `DELETE /api/pods/:name` - Delete a pod

### Deployments
- `GET /api/deployments` - List all deployments
- `GET /api/deployments/:name` - Get deployment details
- `POST /api/deployments/:name/scale` - Scale deployment
- `PATCH /api/deployments/:name` - Update deployment

### Metrics
- `GET /api/metrics/pods` - Get pod metrics
- `GET /api/metrics/nodes` - Get node metrics
- `GET /api/metrics/cluster` - Get cluster metrics

See [API.md](docs/API.md) for complete API documentation.

## Features Roadmap

- [x] Basic Kubernetes pod management
- [x] Real-time status monitoring
- [x] Log aggregation and viewing
- [ ] Resource metrics visualization
- [ ] Automated deployment workflows
- [ ] Multi-cluster support
- [ ] Role-based access control
- [ ] Integration with CI/CD pipelines
- [ ] Custom resource definitions
- [ ] Backup and disaster recovery

## Contributing

This is a personal portfolio project, but suggestions and feedback are welcome! Feel free to open an issue or submit a pull request.

## License

MIT License - See LICENSE file for details

## Author

**Jeff Maxwell**
- Portfolio: [el-jefe.me](https://el-jefe.me)
- GitHub: [@maxjeffwell](https://github.com/maxjeffwell)
- Email: jeff@el-jefe.me

## Acknowledgments

- Kubernetes community for excellent documentation
- React and Node.js ecosystems
- All open-source contributors who make projects like this possible
