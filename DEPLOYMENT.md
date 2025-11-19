# Portfolio Orchestration Platform - Deployment Guide

This guide explains how to deploy the Portfolio Orchestration Platform with internal databases on a k3d Kubernetes cluster.

## Architecture Overview

The platform consists of:

### Databases (Internal)
- **PostgreSQL** - Shared database service for:
  - Bookmarked app (database: `bookmarked`)
  - Code Talk app (database: `codetalk`)
- **Redis** - Cache/session store for:
  - Code Talk app
- **MongoDB** - Document database for:
  - EducationELLy app (database: `educationelly`)
  - EducationELLy GraphQL app (database: `educationelly_graphql`)
  - IntervalAI app (database: `intervalai`)

### Applications
Each application consists of client (frontend) and server (backend) components:
- **Bookmarked** - Bookmark management application
- **Code Talk** - Code collaboration platform
- **EducationELLy** - Language learning application
- **EducationELLy GraphQL** - GraphQL version of EducationELLy
- **IntervalAI** - Spaced repetition learning system
- **Firebook** - Social networking application (client-only)

## Prerequisites

1. k3d cluster running on your NAS (192.168.50.142)
2. kubectl configured with the k3d kubeconfig
3. SSH access to the NAS (port 54321)

## Initial Cluster Setup

If you need to create the k3d cluster, run these commands on your NAS:

```bash
ssh -p 54321 maxjeffwell@192.168.50.142

# Delete existing cluster if needed
sudo k3d cluster delete portfolio-cluster

# Create new cluster
sudo k3d cluster create portfolio-cluster \
  --servers 1 \
  --agents 0 \
  --api-port 6443 \
  --port "30080:80@loadbalancer" \
  --k3s-arg "--disable=traefik@server:0" \
  --k3s-arg "--flannel-backend=host-gw@server:0"

# Get kubeconfig
sudo k3d kubeconfig get portfolio-cluster
```

Copy the kubeconfig output to `~/.kube/k3d-portfolio.yaml` on your local machine, then update:
1. Change `server: https://0.0.0.0:6443` to `server: https://192.168.50.142:6443`
2. Add `insecure-skip-tls-verify: true` under the cluster section

## Deployment

### Automated Deployment

The easiest way to deploy everything is using the automated script:

```bash
cd /home/maxjeffwell/GitHub_Projects/portfolio-orchestration-platform
./deploy-all.sh
```

This script will:
1. Deploy all databases (PostgreSQL, Redis, MongoDB)
2. Wait for databases to be ready
3. Deploy application secrets
4. Deploy application services
5. Deploy all applications
6. Wait for all deployments to be ready

### Manual Deployment

If you prefer to deploy components manually:

#### 1. Deploy Databases

```bash
# Set kubeconfig
export KUBECONFIG=~/.kube/k3d-portfolio.yaml

# Deploy PostgreSQL
kubectl apply -f k8s/databases/postgresql.yaml
kubectl wait --for=jsonpath='{.status.readyReplicas}'=1 statefulset/postgresql

# Deploy Redis
kubectl apply -f k8s/databases/redis.yaml
kubectl wait --for=jsonpath='{.status.readyReplicas}'=1 statefulset/redis

# Deploy MongoDB
kubectl apply -f k8s/databases/mongodb.yaml
kubectl wait --for=jsonpath='{.status.readyReplicas}'=1 statefulset/mongodb
```

#### 2. Deploy Secrets

```bash
kubectl apply -f k8s/secrets/bookmarked-secret.yaml
kubectl apply -f k8s/secrets/code-talk-secret.yaml
kubectl apply -f k8s/secrets/educationelly-secret.yaml
kubectl apply -f k8s/secrets/educationelly-graphql-secret.yaml
kubectl apply -f k8s/secrets/intervalai-secret.yaml
```

#### 3. Deploy Services

```bash
kubectl apply -f k8s/services/
```

#### 4. Deploy Applications

```bash
kubectl apply -f k8s/deployments/bookmarked-deployment.yaml
kubectl apply -f k8s/deployments/code-talk-deployment.yaml
kubectl apply -f k8s/deployments/educationelly-deployment.yaml
kubectl apply -f k8s/deployments/educationelly-graphql-deployment.yaml
kubectl apply -f k8s/deployments/intervalai-deployment.yaml
kubectl apply -f k8s/deployments/firebook-deployment.yaml
```

## Database Connection Details

### PostgreSQL
- **Service:** `postgresql.default.svc.cluster.local:5432`
- **Databases:**
  - `bookmarked` (user: `bookmarked_user`, password: `bookmarked123`)
  - `codetalk` (user: `codetalk_user`, password: `codetalk123`)

### Redis
- **Service:** `redis.default.svc.cluster.local:6379`
- **Password:** `redis123`

### MongoDB
- **Service:** `mongodb.default.svc.cluster.local:27017`
- **Databases:**
  - `educationelly` (user: `educationelly_user`, password: `educationelly123`)
  - `educationelly_graphql` (user: `educationgql_user`, password: `educationgql123`)
  - `intervalai` (user: `intervalai_user`, password: `intervalai123`)

## Verification

### Check Pod Status

```bash
kubectl get pods
```

All pods should show `Running` status with `1/1` or `2/2` ready containers.

### Check Services

```bash
kubectl get services
```

### View Logs

```bash
# View logs for a specific pod
kubectl logs <pod-name>

# Follow logs in real-time
kubectl logs -f <pod-name>

# View logs for a specific container in a pod
kubectl logs <pod-name> -c <container-name>
```

### Access Applications

Applications are exposed through the k3d loadbalancer on port 30080:

```bash
# List all services
kubectl get services

# Port forward to access a specific service
kubectl port-forward service/<service-name> <local-port>:<service-port>
```

## Troubleshooting

### Pods Not Starting

Check pod events and logs:

```bash
kubectl describe pod <pod-name>
kubectl logs <pod-name>
```

### Database Connection Issues

Verify database pods are running and services are accessible:

```bash
# Check database pods
kubectl get pods -l tier=database

# Test database connectivity from a pod
kubectl run -it --rm debug --image=busybox --restart=Never -- sh
# Then inside the pod:
nslookup postgresql.default.svc.cluster.local
nslookup redis.default.svc.cluster.local
nslookup mongodb.default.svc.cluster.local
```

### Resetting Everything

To completely reset and redeploy:

```bash
# Delete all deployments
kubectl delete -f k8s/deployments/

# Delete all services
kubectl delete -f k8s/services/

# Delete all secrets
kubectl delete -f k8s/secrets/

# Delete all databases
kubectl delete -f k8s/databases/

# Wait a moment, then redeploy
./deploy-all.sh
```

## Database Persistence

All databases use PersistentVolumeClaims (PVCs) to store data:
- `postgresql-pvc` - 5Gi
- `redis-pvc` - 1Gi
- `mongodb-pvc` - 5Gi

Data persists even if pods are deleted and recreated.

## Security Notes

The current configuration uses:
- Basic authentication for databases
- Hardcoded passwords in secrets (for development)
- No TLS/SSL for internal cluster communication

For production, consider:
- Using stronger passwords
- Storing secrets in a secure vault (e.g., HashiCorp Vault)
- Enabling TLS for database connections
- Implementing network policies
- Using RBAC for access control

## Monitoring

To monitor resource usage:

```bash
# Check node resources
kubectl top nodes

# Check pod resources
kubectl top pods

# Check events
kubectl get events --sort-by=.metadata.creationTimestamp
```

## Updating Applications

To update an application image:

```bash
# Update the deployment
kubectl set image deployment/<deployment-name> <container-name>=<new-image>

# Or edit the deployment YAML and reapply
kubectl apply -f k8s/deployments/<deployment-file>.yaml

# Check rollout status
kubectl rollout status deployment/<deployment-name>
```

## Backup and Restore

### PostgreSQL Backup

```bash
kubectl exec -it postgresql-0 -- pg_dump -U postgres <database-name> > backup.sql
```

### MongoDB Backup

```bash
kubectl exec -it mongodb-0 -- mongodump --db=<database-name> --out=/data/backup
kubectl cp mongodb-0:/data/backup ./backup
```

### Redis Backup

```bash
kubectl exec -it redis-0 -- redis-cli --pass redis123 SAVE
kubectl cp redis-0:/data/dump.rdb ./redis-backup.rdb
```
