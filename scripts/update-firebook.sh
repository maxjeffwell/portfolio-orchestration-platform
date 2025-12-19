#!/bin/bash
# Update FireBook deployment to pull latest Docker image with Algolia credentials

set -e

echo "🔄 Updating FireBook deployment with latest Docker image..."

# Force pull latest image by restarting the deployment
echo "📦 Restarting FireBook deployment to pull latest image..."
kubectl rollout restart deployment/firebook -n default

# Wait for rollout to complete
echo "⏳ Waiting for deployment to complete..."
kubectl rollout status deployment/firebook -n default --timeout=5m

# Check deployment status
echo "✅ Checking deployment status..."
kubectl get deployment firebook -n default
kubectl get pods -l app=firebook -n default

echo ""
echo "🎉 FireBook deployment updated successfully!"
echo "🔍 Algolia search should now be working with the new credentials."
echo ""
echo "To verify:"
echo "  1. Visit https://firebook-k8s.el-jefe.me/"
echo "  2. Try the search functionality"
echo "  3. Check pod logs: kubectl logs -l app=firebook -n default"
