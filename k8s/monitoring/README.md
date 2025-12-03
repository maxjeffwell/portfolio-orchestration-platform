# Prometheus Monitoring Setup

This directory contains the Kubernetes manifests for deploying Prometheus to your cluster for monitoring your portfolio applications.

## What's Included

- **prometheus-rbac.yaml**: Service account and RBAC permissions for Prometheus
- **prometheus-configmap.yaml**: Prometheus configuration with scrape configs for Kubernetes
- **prometheus-deployment.yaml**: Prometheus deployment with persistent storage
- **prometheus-service.yaml**: ClusterIP service to expose Prometheus

## Features

- Automatic discovery and scraping of Kubernetes resources (pods, services, nodes)
- Container metrics via cAdvisor
- 30-day metric retention
- Configured to scrape your portfolio applications with the `portfolio: "true"` label

## Quick Start

### 1. Deploy Prometheus

Deploy all monitoring components at once:

```bash
kubectl apply -f k8s/monitoring/
```

Or deploy individually in this order:

```bash
kubectl apply -f k8s/monitoring/prometheus-rbac.yaml
kubectl apply -f k8s/monitoring/prometheus-configmap.yaml
kubectl apply -f k8s/monitoring/prometheus-deployment.yaml
kubectl apply -f k8s/monitoring/prometheus-service.yaml
```

### 2. Verify Deployment

Check if Prometheus is running:

```bash
kubectl get pods -l app=prometheus
```

You should see output like:
```
NAME                          READY   STATUS    RESTARTS   AGE
prometheus-xxxxxxxxxx-xxxxx   1/1     Running   0          30s
```

Check the service:

```bash
kubectl get svc prometheus
```

### 3. Access Prometheus UI (Optional)

To access the Prometheus web UI for debugging:

```bash
kubectl port-forward svc/prometheus 9090:9090
```

Then open http://localhost:9090 in your browser.

### 4. View Metrics in Your Dashboard

Once Prometheus is running, your Analytics page at `/analytics` will automatically start displaying:
- Historical resource trends
- Cluster-wide metrics
- Per-pod CPU and memory usage
- Custom PromQL queries

## Monitoring Your Applications

To ensure Prometheus scrapes metrics from your applications, add these annotations to your pods/services:

```yaml
metadata:
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "8080"      # Your metrics port
    prometheus.io/path: "/metrics"  # Your metrics endpoint
```

## Useful PromQL Queries

Here are some queries you can run in the Prometheus UI or via the API:

### CPU Usage
```promql
# CPU usage by pod
rate(container_cpu_usage_seconds_total{pod!=""}[5m])

# Total CPU usage
sum(rate(container_cpu_usage_seconds_total[5m]))
```

### Memory Usage
```promql
# Memory usage by pod
container_memory_usage_bytes{pod!=""}

# Total memory usage
sum(container_memory_usage_bytes)
```

### Pod Count
```promql
# Running pods by namespace
count(kube_pod_info{phase="Running"}) by (namespace)
```

### Network
```promql
# Network receive bytes
rate(container_network_receive_bytes_total[5m])

# Network transmit bytes
rate(container_network_transmit_bytes_total[5m])
```

## API Integration

Your backend API now includes these Prometheus endpoints:

- `GET /api/prometheus/query?query=<promql>` - Instant query
- `GET /api/prometheus/query_range?query=<promql>&start=<time>&end=<time>` - Range query
- `GET /api/prometheus/targets` - View scrape targets
- `GET /api/prometheus/labels` - View available labels
- `GET /api/prometheus/pod-metrics/:podName` - Get specific pod metrics
- `GET /api/prometheus/cluster-metrics` - Get cluster-wide metrics

## Troubleshooting

### Prometheus pod not starting

Check the logs:
```bash
kubectl logs -l app=prometheus
```

### No metrics appearing

1. Check if targets are being discovered:
   ```bash
   kubectl port-forward svc/prometheus 9090:9090
   # Visit http://localhost:9090/targets
   ```

2. Verify RBAC permissions:
   ```bash
   kubectl get clusterrolebinding prometheus
   ```

3. Check Prometheus config:
   ```bash
   kubectl get configmap prometheus-config -o yaml
   ```

### High memory usage

Prometheus is configured with:
- Requests: 512Mi
- Limits: 1Gi

If you need more, edit `prometheus-deployment.yaml` and increase the resource limits.

## Scaling Considerations

### Storage

Currently using `emptyDir` for simplicity. For production:

1. Create a PersistentVolumeClaim:
   ```yaml
   apiVersion: v1
   kind: PersistentVolumeClaim
   metadata:
     name: prometheus-storage
   spec:
     accessModes: [ReadWriteOnce]
     resources:
       requests:
         storage: 50Gi
   ```

2. Update the deployment to use the PVC instead of emptyDir

### Retention

Default retention is 30 days. To change:

Edit `prometheus-deployment.yaml` and modify:
```yaml
args:
  - '--storage.tsdb.retention.time=90d'  # Change to desired retention
```

## Optional: Deploy Grafana

For advanced visualization and alerting, you can also deploy Grafana:

```bash
# Coming soon: Grafana deployment manifests
```

## Cleanup

To remove Prometheus from your cluster:

```bash
kubectl delete -f k8s/monitoring/
```

## Learn More

- [Prometheus Documentation](https://prometheus.io/docs/)
- [PromQL Guide](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Kubernetes Monitoring Best Practices](https://prometheus.io/docs/prometheus/latest/configuration/configuration/#kubernetes_sd_config)
