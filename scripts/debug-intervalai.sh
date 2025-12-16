#!/bin/bash
# Debug IntervalAI deployment and connectivity

echo "🔍 IntervalAI Debug Report"
echo "=========================="
echo ""

echo "📦 Checking Deployments..."
kubectl get deployment intervalai-client intervalai-server -n default
echo ""

echo "🎯 Checking Pods..."
kubectl get pods -l app=intervalai -n default
echo ""

echo "🌐 Checking Services..."
kubectl get svc intervalai-client intervalai-server -n default
echo ""

echo "🚪 Checking Ingress..."
kubectl get ingress intervalai-ingress -n default
kubectl describe ingress intervalai-ingress -n default | grep -A 20 "Rules:"
echo ""

echo "📋 Client Pod Logs (last 20 lines)..."
kubectl logs -l app=intervalai,component=client -n default --tail=20
echo ""

echo "📋 Server Pod Logs (last 30 lines)..."
kubectl logs -l app=intervalai,component=server -n default --tail=30
echo ""

echo "🔗 Testing Internal Connectivity..."
echo "Testing if client can reach server..."
CLIENT_POD=$(kubectl get pod -l app=intervalai,component=client -n default -o jsonpath='{.items[0].metadata.name}')
if [ -n "$CLIENT_POD" ]; then
    echo "Client pod: $CLIENT_POD"
    kubectl exec -n default $CLIENT_POD -- wget -O- http://intervalai-server:8080 --timeout=5 2>&1 | head -10
fi
echo ""

echo "✅ Debug report complete!"
