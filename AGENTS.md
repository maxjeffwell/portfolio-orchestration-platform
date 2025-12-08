# Project Overview

## Purpose
A Kubernetes-based orchestration platform that manages and monitors portfolio applications as containerized workloads. This project demonstrates cloud-native development practices, container orchestration, and modern DevOps workflows.

## Goals
- Provide real-time monitoring and management of Kubernetes pods
- Visualize resource metrics (CPU, memory, network) for applications
- Centralized logging with search and filtering capabilities
- Deployment controls through an intuitive web dashboard
- Demonstrate DevOps and cloud-native architecture skills

## Target Audience
- Recruiters and hiring managers
- Technical interviewers
- Portfolio visitors
- DevOps engineers interested in Kubernetes orchestration

## Architecture Patterns
- **Microservices architecture**: Each application runs independently
- **Cloud-native design**: Built for containerized environments
- **Container orchestration with Kubernetes**: Automated deployment, scaling, and management
- **Real-time communication using WebSockets**: Live updates for pod status
- **Monitoring and observability with Prometheus**: Comprehensive metrics collection

## Design Decisions

### Isolation
Each portfolio application has a dedicated database instance to ensure complete isolation, independent scaling, and simplified management.

### Scalability
Horizontal pod autoscaling based on resource utilization enables automatic scaling to meet demand.

### Monitoring
Prometheus collects metrics from the cluster, while Grafana provides powerful visualization capabilities.

### Real-time Updates
Socket.io enables live pod status updates, providing instant feedback on cluster state changes.

### Development Environment
k3d provides a lightweight local Kubernetes cluster for rapid development and testing.

### Deployment Automation
An automated deployment script (deploy-all.sh) simplifies the setup process.

## Business Domain
- DevOps and Platform Engineering
- Container Orchestration
- Cloud Infrastructure Management
- Monitoring and Observability

## Use Cases
- Monitor health and status of all portfolio applications
- View real-time resource utilization metrics
- Aggregate and search application logs
- Deploy and scale applications through UI
- Restart or delete pods as needed
- Track cluster-wide metrics and performance

## Managed Applications

| Application | Type | Database |
|------------|------|----------|
| Bookmarked | Bookmark Management | PostgreSQL |
| FireBook | Social Network | None |
| EducationELLy | Language Learning | MongoDB |
| EducationELLy-GraphQL | Language Learning API | MongoDB |
| Code Talk | Code Collaboration | PostgreSQL, Redis |
| IntervalAI | Spaced Repetition Learning | MongoDB |

# Technology Stack

## Frontend

### Core Framework
- **React 19.2.0**: Modern UI framework with hooks and concurrent features
- **React Router DOM 7.9.6**: Client-side routing and navigation

### UI & Visualization
- **Material-UI (MUI) 7.3.5**: Comprehensive React component library
- **Recharts 3.4.1**: Composable charting library for data visualization

### Communication
- **Axios 1.13.2**: Promise-based HTTP client for API requests
- **Socket.io Client 4.8.1**: Real-time bidirectional event-based communication

### Build & Development
- **Vite 7.2.2**: Next-generation frontend build tool with HMR
- **ESLint 9.39.1**: JavaScript linting and code quality

## Backend

### Runtime & Framework
- **Node.js >=18.0.0**: JavaScript runtime with ES modules support
- **Express 4.19.2**: Fast, minimalist web framework

### Kubernetes Integration
- **@kubernetes/client-node 0.21.0**: Official Kubernetes API client for Node.js

### Real-time & Logging
- **Socket.io 4.7.5**: Real-time engine for bidirectional communication
- **Winston 3.13.0**: Universal logging library with multiple transports

### Security & Authentication
- **jsonwebtoken 9.0.2**: JWT implementation for authentication
- **bcryptjs 3.0.3**: Password hashing and encryption
- **cors 2.8.5**: Cross-origin resource sharing middleware

### Database Clients
- **pg 8.16.3**: PostgreSQL client for Node.js

### Development Tools
- **nodemon 3.1.0**: Auto-reload development server

## Infrastructure

### Container Orchestration
- **Kubernetes (k3d)**: Lightweight Kubernetes distribution for local development
- **Docker**: Container runtime and image management

### Package Management
- **Helm 3+**: Kubernetes package manager for templated deployments

### Monitoring Stack
- **Prometheus**: Time-series database and metrics collection
- **Grafana**: Metrics visualization and dashboards
- **Node Exporter**: Hardware and OS-level metrics
- **Kube State Metrics**: Kubernetes object state metrics

## Databases

### Relational (PostgreSQL)
- **bookmarked**: Database for Bookmarked application
- **codetalk**: Database for Code Talk application

### Cache (Redis)
- Session store and caching for Code Talk application

### Document (MongoDB)
- **educationelly**: Database for EducationELLy application
- **educationelly_graphql**: Database for EducationELLy GraphQL API
- **intervalai**: Database for IntervalAI application

# Coding Standards

## Syntax Rules

### JavaScript
- Use ES2020+ features and ESNext syntax
- ECMAScript modules (type: "module" in package.json)
- Use async/await for asynchronous operations
- Avoid callbacks and promises chains in favor of async/await

## Style Guidelines

### React
- Follow React hooks best practices
- Use functional components over class components
- Implement React Refresh for hot module replacement
- Keep components focused and single-purpose

### Imports
- Use named imports for better tree-shaking
- Group imports logically (external, internal, relative)

## Naming Conventions

### Variables
- No unused variables except uppercase patterns (^[A-Z_])
- Use descriptive, meaningful names
- camelCase for variables and functions

### Components
- React components should be PascalCase
- Component files should match component names
- One component per file

## Architecture Principles

### Separation of Concerns
- **components/**: Reusable UI components
- **services/**: Business logic and API integration
- **utils/**: Helper functions and utilities
- **controllers/**: Request handlers (backend)

### API Design
- Follow RESTful API design principles
- Use proper HTTP methods (GET, POST, PUT, DELETE, PATCH)
- Return appropriate status codes
- Implement consistent error handling

### Kubernetes
- Follow Kubernetes manifest best practices
- Use labels and selectors consistently
- Implement resource limits and requests
- One application per container

### Databases
- Isolated database instances per application
- Use connection pooling
- Implement proper error handling for database operations

## Security Best Practices

### Authentication & Authorization
- Use JWT for authentication
- Hash passwords with bcryptjs before storage
- Implement token expiration and refresh

### CORS
- Enable CORS properly for API endpoints
- Whitelist allowed origins in production

### Secrets Management
- Store sensitive data in Kubernetes secrets
- Never commit secrets to version control
- Use environment variables for configuration

## Performance Guidelines

### Monitoring
- Instrument code with Prometheus metrics
- Track key performance indicators
- Monitor resource usage

### Logging
- Use Winston for structured logging
- Include contextual information in logs
- Use appropriate log levels (error, warn, info, debug)

### Real-time Communication
- Use Socket.io for real-time updates
- Implement connection pooling and reconnection logic
- Handle disconnections gracefully

### Caching
- Implement Redis caching where appropriate
- Cache frequently accessed data
- Set appropriate TTL values

# Project Structure

```
portfolio-orchestration-platform/
├── api/                         # Node.js backend server
│   ├── src/
│   │   ├── config/             # Configuration files
│   │   ├── controllers/        # Request handlers
│   │   ├── middleware/         # Express middleware
│   │   ├── routes/             # API route definitions
│   │   ├── services/           # Business logic layer
│   │   ├── utils/              # Utility functions
│   │   └── index.js            # Application entry point
│   ├── Dockerfile              # Container definition
│   ├── package.json            # Dependencies & scripts
│   └── README.md               # API documentation
├── dashboard/                   # React frontend application
│   ├── public/                 # Static assets
│   ├── src/
│   │   ├── assets/            # Images, fonts, etc.
│   │   ├── components/        # React components
│   │   ├── contexts/          # React context providers
│   │   ├── pages/             # Page components
│   │   ├── services/          # API client services
│   │   ├── utils/             # Utility functions
│   │   ├── App.jsx            # Root component
│   │   ├── main.jsx           # Application entry
│   │   └── theme.js           # MUI theme configuration
│   ├── Dockerfile             # Container definition
│   ├── nginx.conf             # Nginx configuration
│   ├── vite.config.js         # Vite build config
│   └── package.json           # Dependencies & scripts
├── k8s/                        # Kubernetes manifests
│   ├── configmaps/            # Configuration data
│   ├── databases/             # Database StatefulSets
│   │   ├── mongodb-educationelly.yaml
│   │   ├── mongodb-educationelly-graphql.yaml
│   │   ├── mongodb-intervalai.yaml
│   │   ├── postgresql-bookmarked.yaml
│   │   ├── postgresql-codetalk.yaml
│   │   └── redis.yaml
│   ├── deployments/           # Application deployments
│   │   ├── api-deployment.yaml
│   │   ├── bookmarked-deployment.yaml
│   │   ├── code-talk-deployment.yaml
│   │   ├── dashboard-deployment.yaml
│   │   ├── educationelly-deployment.yaml
│   │   ├── educationelly-graphql-deployment.yaml
│   │   ├── firebook-deployment.yaml
│   │   └── intervalai-deployment.yaml
│   ├── monitoring/            # Monitoring stack
│   │   ├── prometheus-configmap.yaml
│   │   ├── prometheus-deployment.yaml
│   │   ├── prometheus-service.yaml
│   │   ├── prometheus-rbac.yaml
│   │   ├── node-exporter-daemonset.yaml
│   │   ├── node-exporter-service.yaml
│   │   ├── kube-state-metrics-deployment.yaml
│   │   ├── kube-state-metrics-service.yaml
│   │   ├── kube-state-metrics-rbac.yaml
│   │   └── README.md
│   ├── secrets/               # Sensitive data
│   │   ├── api-secret.yaml
│   │   ├── bookmarked-secret.yaml
│   │   ├── code-talk-secret.yaml
│   │   ├── educationelly-secret.yaml
│   │   ├── educationelly-graphql-secret.yaml
│   │   └── intervalai-secret.yaml
│   ├── services/              # Service definitions
│   │   ├── api-service.yaml
│   │   ├── dashboard-service.yaml
│   │   └── [other-services].yaml
│   └── api-rbac.yaml          # RBAC configuration
├── monitoring/                 # Monitoring configurations
│   ├── grafana/               # Grafana dashboards
│   └── prometheus/            # Prometheus configs
│       └── metrics-server.yaml
├── helm/                       # Helm charts
├── docs/                       # Additional documentation
├── .artiforge/                 # Artiforge configuration
├── DATABASE-ARCHITECTURE.md    # Database design docs
├── DEPLOYMENT.md               # Deployment guide
├── PROMETHEUS_SETUP.md         # Monitoring setup guide
├── README.md                   # Project overview
├── deploy-all.sh              # Deployment script
└── .gitignore                 # Git ignore patterns
```

## Directory Descriptions

### `/api`
Backend Node.js server that provides REST API endpoints and WebSocket connections. Interacts with Kubernetes API to manage pods, deployments, and retrieve metrics.

### `/dashboard`
React-based frontend dashboard for visualizing and managing the Kubernetes cluster. Provides real-time monitoring, metrics visualization, and deployment controls.

### `/k8s`
Contains all Kubernetes manifests organized by resource type:
- **databases/**: StatefulSets for PostgreSQL, MongoDB, and Redis
- **deployments/**: Application deployment configurations
- **monitoring/**: Prometheus and metrics collection stack
- **secrets/**: Encrypted sensitive data (database credentials, API keys)
- **services/**: Service definitions for pod networking
- **configmaps/**: Non-sensitive configuration data

### `/monitoring`
Additional monitoring configurations and dashboards for Grafana and Prometheus.

### `/helm`
Helm charts for templated Kubernetes deployments (optional deployment method).

### `/docs`
Extended documentation including setup guides, API documentation, and deployment instructions.

# External Resources

## Official Documentation

### Kubernetes
- **Kubernetes Documentation**: https://kubernetes.io/docs/
- Comprehensive guide for container orchestration, deployment, and cluster management

### Frontend Technologies
- **React Documentation**: https://react.dev/
- Modern documentation for React 18+ with hooks and concurrent features
- **Material-UI Documentation**: https://mui.com/
- Complete component library and design system documentation

### Backend Technologies
- **Express.js Documentation**: https://expressjs.com/
- Fast, unopinionated web framework for Node.js
- **Socket.io Documentation**: https://socket.io/docs/
- Real-time bidirectional event-based communication

### Monitoring & Metrics
- **Prometheus Documentation**: https://prometheus.io/docs/
- Time-series database and monitoring system
- **PromQL Tutorial**: https://prometheus.io/docs/prometheus/latest/querying/basics/
- Query language for Prometheus metrics
- **Kubernetes Monitoring**: https://prometheus.io/docs/prometheus/latest/configuration/configuration/#kubernetes_sd_config
- Service discovery configuration for Kubernetes

## Key Libraries

### Kubernetes Integration
- **@kubernetes/client-node**: Official Kubernetes API client for Node.js
  - Purpose: Interact with Kubernetes API for pod management, deployment scaling, and metrics retrieval

### Real-time Communication
- **Socket.io**: Real-time bidirectional event-based communication
  - Purpose: Enable live updates between server and dashboard for pod status changes

### Logging
- **Winston**: Universal logging library for Node.js
  - Purpose: Structured logging with multiple transports and log levels

### Data Visualization
- **Recharts**: Composable charting library for React
  - Purpose: Create interactive charts for resource metrics visualization

### HTTP Client
- **Axios**: Promise-based HTTP client
  - Purpose: Make API requests from dashboard to backend server

### Security
- **bcryptjs**: Password hashing library
  - Purpose: Securely hash and verify passwords
- **jsonwebtoken**: JWT implementation
  - Purpose: Create and verify JSON Web Tokens for authentication

## Essential Tools

### Development
- **k3d**: Lightweight Kubernetes distribution running in Docker
  - Purpose: Local Kubernetes cluster for development and testing
- **kubectl**: Kubernetes command-line tool
  - Purpose: Interact with Kubernetes clusters from terminal
- **Docker**: Container runtime and image management
  - Purpose: Build, run, and manage containerized applications
- **Vite**: Next-generation frontend build tool
  - Purpose: Fast development server with Hot Module Replacement
- **nodemon**: Development server with auto-reload
  - Purpose: Automatically restart Node.js server on file changes

### Package Management
- **Helm**: Kubernetes package manager
  - Purpose: Template and deploy Kubernetes applications with charts

## Services & Endpoints

### Monitoring
- **Prometheus**: Metrics collection and storage
  - Endpoint: `http://prometheus:9090`
  - Purpose: Scrape and store time-series metrics from pods, nodes, and services

- **Grafana**: Metrics visualization
  - Purpose: Create dashboards and visualize Prometheus metrics

### Databases
- **PostgreSQL**: Relational database
  - Endpoint: `postgresql-*.default.svc.cluster.local:5432`
  - Purpose: Persistent storage for Bookmarked and Code Talk applications

- **Redis**: In-memory cache and session store
  - Endpoint: `redis.default.svc.cluster.local:6379`
  - Purpose: Caching and session management for Code Talk

- **MongoDB**: Document database
  - Endpoint: `mongodb-*.default.svc.cluster.local:27017`
  - Purpose: Flexible document storage for EducationELLy and IntervalAI

### Metrics Collection
- **Node Exporter**: Hardware and OS-level metrics
  - Purpose: Collect detailed node metrics for Prometheus

- **Kube State Metrics**: Kubernetes object state metrics
  - Purpose: Expose cluster-level metrics about Kubernetes objects

## APIs

### Kubernetes API
- **Purpose**: Cluster management and orchestration
- Provides programmatic access to cluster resources, enabling pod management, scaling, and monitoring

### Prometheus Query API
- **Purpose**: Metrics querying via PromQL
- Retrieve time-series data and perform aggregations for dashboard visualization

# Additional Context

## Author Information
- **Name**: Jeff Maxwell
- **Email**: jeff@el-jefe.me
- **Portfolio**: https://el-jefe.me
- **GitHub**: @maxjeffwell

## Development Environment
- **Primary OS**: Linux (Pop!_OS / Ubuntu-based)
- **Kubernetes Cluster**: k3d running on NAS (192.168.50.142)
- **Node.js Version**: 18+
- **Container Runtime**: Docker

## Key Features

### Real-time Pod Monitoring
Live status tracking of all portfolio applications with WebSocket updates. Instant notification of pod state changes, failures, and restarts.

### Resource Metrics Visualization
CPU, memory, and network usage displayed using Recharts. Historical trends and real-time updates help identify resource bottlenecks.

### Log Aggregation
Centralized logging with search and filtering capabilities. View logs from all pods in one place for easier debugging.

### Deployment Controls
Manage applications through an intuitive web dashboard. Deploy, scale, restart, and delete pods without using kubectl.

### Health Checks
Automated liveness and readiness probes ensure application availability. Kubernetes automatically restarts unhealthy pods.

### Service Discovery
Automatic registration and DNS-based discovery. Applications can communicate using service names instead of IP addresses.

### Load Balancing
Intelligent traffic distribution across pod replicas. Kubernetes Services provide stable endpoints and distribute load evenly.

### Auto-scaling
Horizontal pod autoscaling based on resource utilization metrics. Automatically scale applications up or down based on demand.

## Architecture Highlights

### Frontend → Backend Communication
- REST API for data retrieval and management operations
- WebSockets (Socket.io) for real-time pod status updates
- JWT authentication for secure API access

### Backend → Kubernetes Integration
- Uses @kubernetes/client-node to interact with cluster API
- Watches for pod events and broadcasts updates via WebSockets
- Retrieves metrics from Kubernetes metrics server

### Monitoring Pipeline
- Prometheus scrapes metrics from pods, nodes, and Kubernetes API
- Node Exporter provides detailed node-level metrics
- Kube State Metrics exposes cluster object state
- Analytics dashboard queries Prometheus for visualization

### Application Isolation
- Each portfolio application runs as a separate deployment
- Dedicated database instance per application ensures isolation
- StatefulSets used for databases to maintain data persistence
- Services provide stable networking endpoints

## Deployment Strategy

### Automated Deployment
The `deploy-all.sh` script orchestrates the entire deployment:

1. **Databases First**: Deploy PostgreSQL, MongoDB, and Redis StatefulSets
2. **Health Checks**: Wait for all databases to reach ready state
3. **Secrets**: Apply Kubernetes secrets for database credentials
4. **Services**: Create service endpoints for networking
5. **Applications**: Deploy portfolio applications and platform services
6. **Verification**: Check rollout status of all deployments

### Configuration Management
- **Secrets**: Kubernetes Secret objects for sensitive data (passwords, tokens)
- **ConfigMaps**: Non-sensitive configuration data
- **Environment Variables**: Runtime configuration passed to containers
- **Persistent Volumes**: StatefulSets use PVCs for data persistence

## Resource Allocation

### Database Resources (per instance)
- **Memory Limits**: 512Mi
- **CPU Limits**: 500m (0.5 cores)
- **Storage**: 2Gi per database PVC

### Total Database Footprint
- **Storage**: 11Gi across all database instances
- **Memory**: ~2.8Gi total memory limits
- **CPU**: ~2.75 cores total CPU limits

### Prometheus Resources
- **Memory Limit**: 4Gi (increased to prevent OOMKilled errors)
- **Storage**: Configurable retention period (default 30 days)
- **CPU**: Auto-scaled based on scrape targets

## Security Considerations

### Current Setup (Development)
- Hardcoded database passwords in Kubernetes secrets
- No TLS/SSL encryption for internal cluster communication
- Basic JWT authentication for API endpoints
- RBAC configured for Prometheus scraping permissions

### Production Recommendations
- **External Secret Management**: Use HashiCorp Vault or AWS Secrets Manager
- **TLS Everywhere**: Enable TLS for all database and service communications
- **Network Policies**: Implement pod-to-pod network restrictions
- **Least Privilege**: Use dedicated service accounts with minimal permissions
- **Audit Logging**: Enable Kubernetes audit logs for security monitoring
- **Regular Updates**: Keep all dependencies and base images up to date

## Recent Updates
- Centered dashboard header title for improved UI
- Renamed to "Pop!_Portfolio" branding
- Increased Prometheus memory limit from 1Gi to 4Gi to prevent OOM crashes
- Added Node Exporter deployment for enhanced node metrics
- Fixed Analytics metrics collection issues
- Improved Prometheus stability with better resource allocation

## Known Issues and Roadmap

### In Progress
- Resource metrics visualization enhancements
- Real-time alerting for pod failures

### Planned Features
- Automated deployment workflows with CI/CD integration
- Multi-cluster support for managing multiple environments
- Enhanced role-based access control (RBAC)
- GitOps integration with ArgoCD or Flux
- Custom resource definitions (CRDs) for portfolio apps
- Backup and disaster recovery automation

# Testing Instructions

## Prerequisites
Ensure the following are installed and configured:
- Node.js 18+
- npm or yarn
- Docker and Docker Compose
- kubectl CLI tool
- k3d or Minikube for local Kubernetes cluster

## Backend Testing

```bash
# Navigate to API directory
cd api

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Run in development mode
npm run dev

# Run tests (if configured)
npm test
```

## Frontend Testing

```bash
# Navigate to dashboard directory
cd dashboard

# Install dependencies
npm install

# Run development server
npm run dev

# Run linting
npm run lint

# Build for production
npm run build
```

## Kubernetes Cluster Testing

```bash
# Verify cluster connectivity
kubectl cluster-info

# Check all pods
kubectl get pods --all-namespaces

# Check services
kubectl get services

# Check deployments
kubectl get deployments

# View pod logs
kubectl logs <pod-name>

# Describe a pod for detailed info
kubectl describe pod <pod-name>
```

## End-to-End Testing

```bash
# Deploy all components
./deploy-all.sh

# Wait for all pods to be ready
kubectl wait --for=condition=ready pod --all --timeout=300s

# Port forward dashboard (if not using LoadBalancer)
kubectl port-forward service/dashboard 3000:3000

# Port forward API
kubectl port-forward service/api 5000:5000

# Access dashboard
open http://localhost:3000

# Test API health endpoint
curl http://localhost:5000/health
```

## Monitoring Stack Testing

```bash
# Port forward Prometheus
kubectl port-forward service/prometheus 9090:9090

# Access Prometheus UI
open http://localhost:9090

# Test Prometheus query
curl 'http://localhost:9090/api/v1/query?query=up'

# Check Prometheus targets
open http://localhost:9090/targets
```

# Build Steps

## Local Development Setup

### 1. Clone the Repository
```bash
git clone https://github.com/maxjeffwell/portfolio-orchestration-platform.git
cd portfolio-orchestration-platform
```

### 2. Start Local Kubernetes Cluster

#### Using k3d (Recommended)
```bash
k3d cluster create portfolio-cluster \
  --servers 1 \
  --agents 2 \
  --port "30080:80@loadbalancer" \
  --port "30443:443@loadbalancer"
```

#### Using Minikube
```bash
minikube start --driver=docker --cpus=4 --memory=8192
```

### 3. Build and Deploy Databases
```bash
# Apply database manifests
kubectl apply -f k8s/databases/

# Wait for databases to be ready
kubectl wait --for=condition=ready pod -l tier=database --timeout=300s
```

### 4. Deploy Secrets and ConfigMaps
```bash
# Apply secrets (update with your credentials first)
kubectl apply -f k8s/secrets/

# Apply configmaps (if any)
kubectl apply -f k8s/configmaps/
```

### 5. Deploy Monitoring Stack
```bash
# Deploy Prometheus and exporters
kubectl apply -f k8s/monitoring/

# Wait for Prometheus to be ready
kubectl wait --for=condition=ready pod -l app=prometheus --timeout=300s
```

### 6. Build Docker Images

#### Build API Image
```bash
cd api
docker build -t portfolio-api:latest .
cd ..
```

#### Build Dashboard Image
```bash
cd dashboard
docker build -t portfolio-dashboard:latest .
cd ..
```

### 7. Deploy Applications
```bash
# Deploy all portfolio applications
kubectl apply -f k8s/deployments/

# Deploy services
kubectl apply -f k8s/services/

# Wait for all deployments to be ready
kubectl wait --for=condition=available deployment --all --timeout=600s
```

### 8. Verify Deployment
```bash
# Check all pods
kubectl get pods

# Check services
kubectl get services

# Check deployments
kubectl get deployments
```

## Automated Deployment

For a complete automated setup, use the deployment script:

```bash
# Make script executable (first time only)
chmod +x deploy-all.sh

# Run deployment script
./deploy-all.sh
```

This script will:
1. Deploy all databases
2. Wait for database readiness
3. Apply secrets and configmaps
4. Deploy the monitoring stack
5. Deploy all applications
6. Verify successful deployment

## Accessing the Platform

### Dashboard
```bash
# Port forward to access locally
kubectl port-forward service/dashboard 3000:3000

# Open in browser
open http://localhost:3000
```

### API
```bash
# Port forward API service
kubectl port-forward service/api 5000:5000

# Test health endpoint
curl http://localhost:5000/health
```

### Prometheus
```bash
# Port forward Prometheus
kubectl port-forward service/prometheus 9090:9090

# Open Prometheus UI
open http://localhost:9090
```

## Production Build

### 1. Build Optimized Images
```bash
# Build API for production
cd api
docker build -t portfolio-api:v1.0.0 .

# Build Dashboard for production
cd dashboard
npm run build
docker build -t portfolio-dashboard:v1.0.0 .
```

### 2. Push to Container Registry
```bash
# Tag images for registry
docker tag portfolio-api:v1.0.0 your-registry/portfolio-api:v1.0.0
docker tag portfolio-dashboard:v1.0.0 your-registry/portfolio-dashboard:v1.0.0

# Push to registry
docker push your-registry/portfolio-api:v1.0.0
docker push your-registry/portfolio-dashboard:v1.0.0
```

### 3. Update Kubernetes Manifests
```bash
# Update image references in deployment files
# Edit k8s/deployments/*.yaml with production image tags
```

### 4. Deploy to Production Cluster
```bash
# Set context to production cluster
kubectl config use-context production

# Apply manifests
kubectl apply -f k8s/

# Monitor rollout
kubectl rollout status deployment/api
kubectl rollout status deployment/dashboard
```

## Troubleshooting

### Pods Not Starting
```bash
# Check pod events
kubectl describe pod <pod-name>

# View pod logs
kubectl logs <pod-name>

# Check resource availability
kubectl top nodes
kubectl top pods
```

### Database Connection Issues
```bash
# Test database connectivity
kubectl run -it --rm debug --image=busybox --restart=Never -- sh

# Inside the debug pod
nslookup postgresql-bookmarked.default.svc.cluster.local
nslookup mongodb-educationelly.default.svc.cluster.local
nslookup redis.default.svc.cluster.local
```

### Monitoring Not Working
```bash
# Check Prometheus pod
kubectl logs -l app=prometheus

# Verify Prometheus targets
kubectl port-forward service/prometheus 9090:9090
# Visit http://localhost:9090/targets

# Check RBAC permissions
kubectl get clusterrolebinding prometheus
```

---

**Documentation Last Updated**: December 2024

For the latest updates and more detailed guides, refer to the project README and documentation in the repository.
