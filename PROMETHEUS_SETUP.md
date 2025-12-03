# Prometheus Setup Complete! 🎉

This guide will help you deploy Prometheus to your Kubernetes cluster and integrate it with your Analytics dashboard.

## What Was Done

### 1. Kubernetes Manifests Created ✅

Created complete Prometheus deployment files in `k8s/monitoring/`:

- **prometheus-rbac.yaml** - Service account and permissions for Prometheus
- **prometheus-configmap.yaml** - Scraping configuration for all K8s resources
- **prometheus-deployment.yaml** - Prometheus server deployment
- **prometheus-service.yaml** - Internal service to expose Prometheus

### 2. Backend API Integration ✅

- **Created** `api/src/routes/prometheusRoutes.js` with endpoints:
  - `/api/prometheus/query` - Instant PromQL queries
  - `/api/prometheus/query_range` - Historical time-range queries
  - `/api/prometheus/targets` - View scrape targets
  - `/api/prometheus/labels` - View available metrics labels
  - `/api/prometheus/pod-metrics/:podName` - Pod-specific metrics
  - `/api/prometheus/cluster-metrics` - Cluster-wide metrics

- **Updated** `api/src/index.js` to include Prometheus routes
- **Added** `axios` dependency to `api/package.json`

### 3. Frontend Analytics Page Updated ✅

- **Modified** `dashboard/src/pages/Analytics.jsx` to:
  - Fetch real historical data from Prometheus
  - Display live charts with actual metrics
  - Gracefully fallback to simulated data if Prometheus isn't available
  - Auto-refresh metrics every 30 seconds

### 4. Removed Metabase ✅

- Removed `@metabase/embedding-sdk-react` dependency
- Deleted all Metabase components and routes
- Clean migration to free, open-source solution

## Quick Deployment Guide

### Step 1: Install Dependencies

```bash
# Install backend dependencies (includes axios for Prometheus)
cd api
npm install

# Dashboard dependencies are already installed
cd ../dashboard
npm install
```

### Step 2: Deploy Prometheus to Kubernetes

```bash
# From project root
kubectl apply -f k8s/monitoring/
```

### Step 3: Verify Deployment

```bash
# Check if Prometheus is running
kubectl get pods -l app=prometheus

# You should see:
# NAME                          READY   STATUS    RESTARTS   AGE
# prometheus-xxxxxxxxxx-xxxxx   1/1     Running   0          1m
```

### Step 4: Update API Environment (Optional)

If Prometheus is deployed to a different namespace or with a different service name, update your API's `.env`:

```bash
# api/.env
PROMETHEUS_URL=http://prometheus:9090  # Default value
```

### Step 5: Restart Your Services

```bash
# If running locally
cd api
npm run dev

cd ../dashboard
npm run dev

# If running in Kubernetes, restart the API pod:
kubectl rollout restart deployment api-service
```

### Step 6: View Your Analytics!

1. Navigate to http://localhost:3000/analytics (or your dashboard URL)
2. You should now see:
   - Real-time KPIs (Running Pods, CPU, Memory, Failed Pods)
   - Historical resource trends from Prometheus
   - Namespace distribution pie chart
   - Top pods by resource usage
   - GPU metrics (if available)

## Testing Prometheus

### Access Prometheus UI

```bash
kubectl port-forward svc/prometheus 9090:9090
```

Then visit http://localhost:9090

### Test Some Queries

Try these PromQL queries in the Prometheus UI:

1. **All pods**: `kube_pod_info`
2. **CPU usage**: `rate(container_cpu_usage_seconds_total[5m])`
3. **Memory usage**: `container_memory_usage_bytes`
4. **Pod count**: `count(kube_pod_info{phase="Running"})`

### Test API Endpoints

```bash
# Get instant query (requires authentication)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/prometheus/query?query=up"

# Get cluster metrics
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/prometheus/cluster-metrics?timeRange=1h"
```

## What Metrics Are Collected

Prometheus automatically scrapes:

- **Kubernetes API Server** - Cluster health and API metrics
- **Kubernetes Nodes** - Node-level resource usage
- **Kubernetes Pods** - Container metrics (CPU, memory, network)
- **Kubernetes Services** - Service endpoints and health
- **cAdvisor** - Detailed container metrics

## Adding Custom Metrics

To expose custom metrics from your applications:

### 1. Add Prometheus Client Library

For Node.js apps:
```bash
npm install prom-client
```

### 2. Expose /metrics Endpoint

```javascript
import promClient from 'prom-client';

// Create metrics
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

// Expose endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

### 3. Annotate Your Pod/Service

Add these annotations to your Kubernetes manifests:

```yaml
metadata:
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "5000"      # Your app port
    prometheus.io/path: "/metrics"  # Metrics endpoint
```

Prometheus will automatically discover and scrape your metrics!

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Your Kubernetes Cluster                  │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │  Your Pods   │    │  Prometheus  │    │   API Server │ │
│  │              │◄───┤              │◄───┤              │ │
│  │  /metrics    │    │  Scrapes &   │    │  Queries     │ │
│  └──────────────┘    │  Stores      │    │  Prometheus  │ │
│                      └──────────────┘    └──────────────┘ │
│                                                ▲             │
└────────────────────────────────────────────────┼────────────┘
                                                 │
                                          HTTP Requests
                                                 │
                                    ┌────────────┴─────────────┐
                                    │   Analytics Dashboard    │
                                    │                          │
                                    │   Beautiful Charts       │
                                    │   Real-time Data         │
                                    │   Historical Trends      │
                                    └──────────────────────────┘
```

## Troubleshooting

### Problem: Analytics page shows simulated data

**Solution**: Check if Prometheus is running and accessible

```bash
# Check Prometheus pod
kubectl get pods -l app=prometheus

# Check Prometheus logs
kubectl logs -l app=prometheus

# Verify API can reach Prometheus
kubectl exec -it deployment/api-service -- curl http://prometheus:9090/-/healthy
```

### Problem: "No data points" in charts

**Solution**: Prometheus needs time to collect data. Wait 1-2 minutes after deployment.

### Problem: High memory usage

**Solution**: Adjust Prometheus retention or increase resource limits

```yaml
# In prometheus-deployment.yaml
args:
  - '--storage.tsdb.retention.time=7d'  # Reduce from 30d

resources:
  limits:
    memory: 2Gi  # Increase from 1Gi
```

### Problem: Missing metrics

**Solution**: Ensure your pods have the right labels

```bash
# Check if pods are being scraped
kubectl port-forward svc/prometheus 9090:9090
# Visit http://localhost:9090/targets
```

## Cost Breakdown

Everything is **100% FREE**:

- ✅ Prometheus: Open source (Apache 2.0)
- ✅ Recharts: Open source (MIT)
- ✅ Kubernetes: Open source
- ✅ No external services required
- ✅ No API keys needed
- ✅ No monthly fees

## Next Steps (Optional)

### 1. Deploy Grafana

For even more advanced dashboards and alerting:

```bash
# Coming soon: Grafana deployment manifests
```

### 2. Set Up Alerting

Configure Prometheus Alertmanager for notifications:

```yaml
# Coming soon: Alertmanager configuration
```

### 3. Add More Exporters

- Node Exporter (detailed node metrics)
- GPU Exporter (NVIDIA GPU metrics)
- Custom application exporters

### 4. Long-term Storage

Replace `emptyDir` with persistent storage:

```bash
# Create PersistentVolumeClaim for Prometheus data
kubectl apply -f prometheus-pvc.yaml
```

## Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [PromQL Tutorial](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Kubernetes Monitoring Guide](https://prometheus.io/docs/prometheus/latest/configuration/configuration/#kubernetes_sd_config)
- [Recharts Documentation](https://recharts.org/)

## Support

If you encounter issues:

1. Check logs: `kubectl logs -l app=prometheus`
2. View detailed README: `k8s/monitoring/README.md`
3. Test Prometheus UI: `kubectl port-forward svc/prometheus 9090:9090`
4. Verify API routes: Check Network tab in browser DevTools

---

**Congratulations!** 🎉 You now have a fully functional, free, open-source monitoring solution with beautiful visualizations!
