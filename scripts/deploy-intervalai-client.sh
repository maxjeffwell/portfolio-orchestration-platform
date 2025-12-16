#!/bin/bash
# Deploy IntervalAI client by pulling latest image and restarting
# Run this REMOTE script on your VPS server

set -e

echo "🔄 Deploying latest IntervalAI client..."

echo "📦 Restarting IntervalAI client deployment to pull latest image..."
kubectl rollout restart deployment/intervalai-client -n default

echo "⏳ Waiting for deployment to complete..."
kubectl rollout status deployment/intervalai-client -n default --timeout=5m

echo "✅ Checking deployment status..."
kubectl get deployment intervalai-client -n default
kubectl get pods -l app=intervalai,component=client -n default

echo ""
echo "🎉 IntervalAI client deployed successfully!"
echo "🌐 The app should now connect to the backend at /api"
echo "🔗 Visit: https://intervalai-k8s.el-jefe.me/"
echo ""
echo "To verify:"
echo "  1. Visit https://intervalai-k8s.el-jefe.me/"
echo "  2. Try to log in or register"
echo "  3. Check browser console for any errors"
echo "  4. Check pod logs: kubectl logs -l app=intervalai,component=client -n default"
