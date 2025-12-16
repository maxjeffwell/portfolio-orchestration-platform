#!/bin/bash
# Update Dashboard deployment with latest changes

set -e

echo "🔄 Building and updating Portfolio Dashboard..."

# Navigate to dashboard directory
cd "$(dirname "$0")/../dashboard"

echo "🏗️  Building Docker image..."
docker build -t maxjeffwell/portfolio-dashboard:latest .

echo "📤 Pushing to Docker Hub..."
docker push maxjeffwell/portfolio-dashboard:latest

echo "📦 Restarting dashboard deployment to pull latest image..."
kubectl rollout restart deployment/pop-portfolio-dashboard -n default

echo "⏳ Waiting for deployment to complete..."
kubectl rollout status deployment/pop-portfolio-dashboard -n default --timeout=5m

echo "✅ Checking deployment status..."
kubectl get deployment pop-portfolio-dashboard -n default
kubectl get pods -l app=pop-portfolio-dashboard -n default

echo ""
echo "🎉 Dashboard deployment updated successfully!"
echo "🌐 The IntervalAI link should now point to https://intervalai-k8s.el-jefe.me/"
echo ""
echo "To verify:"
echo "  1. Visit your dashboard"
echo "  2. Check the Deployments page"
echo "  3. Click the IntervalAI 'Open' button"
echo "  4. Check pod logs: kubectl logs -l app=pop-portfolio-dashboard -n default"
