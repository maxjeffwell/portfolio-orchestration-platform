# Portfolio Orchestration Platform - API

Node.js backend API server for managing Kubernetes portfolio applications.

## Features

- RESTful API for Kubernetes pod and deployment management
- Real-time WebSocket updates for pod status changes
- Health monitoring and logging
- CORS support for frontend integration
- ES6 modules for modern JavaScript

## Prerequisites

- Node.js 18+ and npm
- Access to a Kubernetes cluster
- kubectl configured with valid kubeconfig

## Installation

```bash
cd api
npm install
```

## Configuration

Create a `.env` file in the `api` directory:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
PORT=5000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
KUBECONFIG_PATH=  # Leave empty to use default ~/.kube/config
LOG_LEVEL=info
```

## Running the API

### Development mode (with hot reload):
```bash
npm run dev
```

### Production mode:
```bash
npm start
```

The API will start on `http://localhost:5000` (or your configured PORT).

## API Endpoints

### Health Check
- `GET /health` - Server and Kubernetes connection status

### Pods
- `GET /api/pods` - List all pods in namespace
- `GET /api/pods/portfolio` - List portfolio pods (labeled `portfolio=true`)
- `GET /api/pods/:name` - Get details for a specific pod
- `GET /api/pods/:name/logs?tail=100&container=name` - Get pod logs
- `DELETE /api/pods/:name` - Delete a pod

### Deployments
- `GET /api/deployments` - List all deployments in namespace
- `GET /api/deployments/portfolio` - List portfolio deployments
- `GET /api/deployments/:name` - Get details for a specific deployment
- `POST /api/deployments/:name/scale` - Scale deployment replicas
  ```json
  { "replicas": 3 }
  ```
- `POST /api/deployments/:name/restart` - Restart deployment (rolling restart)

### Query Parameters
All endpoints support optional `namespace` query parameter (defaults to `default`):
```
GET /api/pods?namespace=production
```

## WebSocket Events

### Client → Server
- `subscribe:pods` - Subscribe to pod status updates
- `subscribe:deployments` - Subscribe to deployment updates

### Server → Client
- `pods:update` - Real-time pod status updates (every 5 seconds)

## Example Usage

### Get all portfolio pods
```bash
curl http://localhost:5000/api/pods/portfolio
```

### Get pod logs
```bash
curl http://localhost:5000/api/pods/bookmarked-client-abc123/logs?tail=50
```

### Scale a deployment
```bash
curl -X POST http://localhost:5000/api/deployments/bookmarked-client/scale \
  -H "Content-Type: application/json" \
  -d '{"replicas": 3}'
```

### Restart a deployment
```bash
curl -X POST http://localhost:5000/api/deployments/intervalai-server/restart
```

## Project Structure

```
api/
├── src/
│   ├── config/
│   │   └── kubernetes.js      # Kubernetes client configuration
│   ├── controllers/
│   │   ├── podController.js   # Pod request handlers
│   │   └── deploymentController.js  # Deployment request handlers
│   ├── services/
│   │   ├── podService.js      # Pod business logic
│   │   └── deploymentService.js     # Deployment business logic
│   ├── routes/
│   │   ├── podRoutes.js       # Pod API routes
│   │   └── deploymentRoutes.js      # Deployment API routes
│   ├── utils/
│   │   └── logger.js          # Winston logger configuration
│   └── index.js               # Express server entry point
├── package.json
├── .env.example
└── README.md
```

## Logging

The API uses Winston for structured logging. Log levels:
- `error` - Error messages
- `warn` - Warning messages
- `info` - Informational messages (default)
- `debug` - Debug messages

Configure log level in `.env`:
```env
LOG_LEVEL=debug
```

## Error Handling

All API responses follow this format:

**Success:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "error": "Error message"
}
```

## Development

### Watch mode with nodemon:
```bash
npm run dev
```

Changes to files will automatically restart the server.

## Deployment

For production deployment, ensure:
1. Set `NODE_ENV=production`
2. Configure appropriate CORS origins
3. Set up proper kubeconfig access
4. Use a process manager like PM2 or systemd

## License

MIT
