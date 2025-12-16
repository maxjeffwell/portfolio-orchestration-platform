#!/bin/bash
# Update IntervalAI client with correct API configuration and redeploy

set -e

echo "🔄 Building and updating IntervalAI client..."

# Navigate to IntervalAI client directory
CLIENT_DIR="/home/maxjeffwell/GitHub_Projects/spaced-repetition-capstone/spaced-repetition-capstone-client"

if [ ! -d "$CLIENT_DIR" ]; then
    echo "❌ Error: Client directory not found at $CLIENT_DIR"
    exit 1
fi

cd "$CLIENT_DIR"

echo "📂 Working directory: $(pwd)"

echo "🏗️  Building Docker image with API_BASE_URL=/api..."
docker build \
    --build-arg REACT_APP_API_BASE_URL=/api \
    --target production \
    -t maxjeffwell/spaced-repetition-capstone-client:latest \
    .

echo "📤 Pushing to Docker Hub..."
docker push maxjeffwell/spaced-repetition-capstone-client:latest

echo "📦 Restarting IntervalAI client deployment..."
kubectl rollout restart deployment/intervalai-client -n default

echo "⏳ Waiting for deployment to complete..."
kubectl rollout status deployment/intervalai-client -n default --timeout=5m

echo "✅ Checking deployment status..."
kubectl get deployment intervalai-client -n default
kubectl get pods -l app=intervalai,component=client -n default

echo ""
echo "🎉 IntervalAI client updated successfully!"
echo "🌐 The app should now connect to the backend at /api"
echo "🔗 Visit: https://intervalai-k8s.el-jefe.me/"
echo ""
echo "To verify:"
echo "  1. Visit https://intervalai-k8s.el-jefe.me/"
echo "  2. Try to log in or register"
echo "  3. Check browser console for any errors"
echo "  4. Check pod logs: kubectl logs -l app=intervalai,component=client -n default"
