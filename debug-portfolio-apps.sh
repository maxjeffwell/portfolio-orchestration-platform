#!/bin/bash

# Portfolio Apps Diagnostic Script
# This script checks why portfolio apps aren't showing up in pop!_portfolio

echo "=================================================="
echo "Portfolio Apps Diagnostic Report"
echo "=================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check 1: Verify kubectl is working
echo "1. Checking kubectl connection..."
if kubectl cluster-info &> /dev/null; then
    echo -e "${GREEN}✓${NC} kubectl is connected to cluster"
else
    echo -e "${RED}✗${NC} kubectl cannot connect to cluster"
    exit 1
fi
echo ""

# Check 2: Verify RBAC resources exist
echo "2. Checking RBAC configuration..."
echo ""
echo "   ServiceAccount:"
if kubectl get serviceaccount portfolio-api-sa -n default &> /dev/null; then
    echo -e "   ${GREEN}✓${NC} portfolio-api-sa exists"
else
    echo -e "   ${RED}✗${NC} portfolio-api-sa NOT FOUND"
    echo "   To fix: kubectl apply -f k8s/api-rbac.yaml"
fi

echo "   ClusterRole:"
if kubectl get clusterrole portfolio-manager &> /dev/null; then
    echo -e "   ${GREEN}✓${NC} portfolio-manager ClusterRole exists"
else
    echo -e "   ${RED}✗${NC} portfolio-manager ClusterRole NOT FOUND"
    echo "   To fix: kubectl apply -f k8s/api-rbac.yaml"
fi

echo "   ClusterRoleBinding:"
if kubectl get clusterrolebinding portfolio-manager-binding &> /dev/null; then
    echo -e "   ${GREEN}✓${NC} portfolio-manager-binding exists"
else
    echo -e "   ${RED}✗${NC} portfolio-manager-binding NOT FOUND"
    echo "   To fix: kubectl apply -f k8s/api-rbac.yaml"
fi
echo ""

# Check 3: Verify portfolio-api is running
echo "3. Checking portfolio-api deployment..."
PORTFOLIO_API_STATUS=$(kubectl get deployment portfolio-api -n default -o jsonpath='{.status.conditions[?(@.type=="Available")].status}' 2>/dev/null)
if [ "$PORTFOLIO_API_STATUS" = "True" ]; then
    echo -e "${GREEN}✓${NC} portfolio-api deployment is running"
    PORTFOLIO_API_POD=$(kubectl get pods -n default -l app=portfolio-api -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
    echo "   Pod name: $PORTFOLIO_API_POD"
else
    echo -e "${RED}✗${NC} portfolio-api deployment is NOT running"
    echo "   To fix: kubectl apply -f k8s/deployments/portfolio-api-deployment.yaml"
fi
echo ""

# Check 4: Check for portfolio apps with label
echo "4. Checking for deployments with portfolio=true label..."
PORTFOLIO_APPS=$(kubectl get deployments -n default -l portfolio=true --no-headers 2>/dev/null | wc -l)
echo "   Found $PORTFOLIO_APPS deployments with portfolio=true label"
echo ""

if [ "$PORTFOLIO_APPS" -eq 0 ]; then
    echo -e "${RED}✗${NC} NO PORTFOLIO APPS FOUND!"
    echo "   This is the problem! Your portfolio apps are not deployed."
    echo ""
    echo "   Expected apps:"
    echo "   - educationelly-client, educationelly-server"
    echo "   - code-talk-client, code-talk-server"
    echo "   - intervalai-client, intervalai-server"
    echo "   - bookmarked-client, bookmarked-server"
    echo "   - firebook"
    echo "   - educationelly-graphql-client, educationelly-graphql-server"
    echo ""
    echo "   To deploy, run:"
    echo "   kubectl apply -f k8s/deployments/educationelly-deployment.yaml"
    echo "   kubectl apply -f k8s/deployments/code-talk-deployment.yaml"
    echo "   kubectl apply -f k8s/deployments/intervalai-deployment.yaml"
    echo "   kubectl apply -f k8s/deployments/bookmarked-deployment.yaml"
    echo "   kubectl apply -f k8s/deployments/firebook-deployment.yaml"
    echo "   kubectl apply -f k8s/deployments/educationelly-graphql-deployment.yaml"
else
    echo -e "${GREEN}✓${NC} Portfolio apps found:"
    kubectl get deployments -n default -l portfolio=true -o custom-columns=NAME:.metadata.name,READY:.status.readyReplicas,AVAILABLE:.status.availableReplicas,IMAGE:.spec.template.spec.containers[0].image
fi
echo ""

# Check 5: Verify all expected deployments
echo "5. Checking individual portfolio deployments..."
EXPECTED_APPS=("educationelly-client" "educationelly-server" "code-talk-client" "code-talk-server" "intervalai-client" "intervalai-server" "bookmarked-client" "bookmarked-server" "firebook" "educationelly-graphql-client" "educationelly-graphql-server")

for app in "${EXPECTED_APPS[@]}"; do
    if kubectl get deployment "$app" -n default &> /dev/null; then
        STATUS=$(kubectl get deployment "$app" -n default -o jsonpath='{.status.conditions[?(@.type=="Available")].status}')
        REPLICAS=$(kubectl get deployment "$app" -n default -o jsonpath='{.status.availableReplicas}')
        if [ "$STATUS" = "True" ] && [ "$REPLICAS" != "0" ]; then
            echo -e "   ${GREEN}✓${NC} $app (Ready: $REPLICAS)"
        else
            echo -e "   ${YELLOW}⚠${NC} $app (Exists but not ready)"
        fi
    else
        echo -e "   ${RED}✗${NC} $app (NOT DEPLOYED)"
    fi
done
echo ""

# Check 6: Check portfolio-api logs for errors
echo "6. Checking portfolio-api logs for errors..."
if [ -n "$PORTFOLIO_API_POD" ]; then
    echo "   Recent logs from $PORTFOLIO_API_POD:"
    echo "   ----------------------------------------"
    kubectl logs $PORTFOLIO_API_POD -n default --tail=20 | grep -i -E "error|fail|kubernetes|portfolio" || echo "   No errors found in recent logs"
    echo "   ----------------------------------------"
else
    echo -e "   ${RED}✗${NC} Cannot check logs - portfolio-api pod not found"
fi
echo ""

# Check 7: Test API endpoint directly
echo "7. Testing API endpoint..."
PORTFOLIO_API_SVC=$(kubectl get svc portfolio-api -n default -o jsonpath='{.spec.clusterIP}' 2>/dev/null)
if [ -n "$PORTFOLIO_API_SVC" ]; then
    echo "   Service IP: $PORTFOLIO_API_SVC"
    echo "   Testing /api/deployments/portfolio endpoint..."

    # Try to curl from within a pod
    kubectl run -n default test-curl --image=curlimages/curl:latest --rm -i --restart=Never -- \
        curl -s "http://$PORTFOLIO_API_SVC:5000/api/deployments/portfolio" 2>/dev/null | head -20
else
    echo -e "   ${RED}✗${NC} portfolio-api service not found"
fi
echo ""

# Summary
echo "=================================================="
echo "SUMMARY & RECOMMENDATIONS"
echo "=================================================="
echo ""

if [ "$PORTFOLIO_APPS" -eq 0 ]; then
    echo -e "${RED}PRIMARY ISSUE:${NC} No portfolio apps are deployed to the cluster!"
    echo ""
    echo "SOLUTION: Deploy your portfolio apps"
    echo "Run these commands in your portfolio-orchestration-platform directory:"
    echo ""
    echo "  cd ~/GitHub_Projects/portfolio-orchestration-platform"
    echo "  kubectl apply -f k8s/deployments/educationelly-deployment.yaml"
    echo "  kubectl apply -f k8s/deployments/code-talk-deployment.yaml"
    echo "  kubectl apply -f k8s/deployments/intervalai-deployment.yaml"
    echo "  kubectl apply -f k8s/deployments/bookmarked-deployment.yaml"
    echo "  kubectl apply -f k8s/deployments/firebook-deployment.yaml"
    echo "  kubectl apply -f k8s/deployments/educationelly-graphql-deployment.yaml"
    echo ""
    echo "Also apply their services:"
    echo "  kubectl apply -f k8s/services/"
    echo ""
elif [ "$PORTFOLIO_API_STATUS" != "True" ]; then
    echo -e "${YELLOW}ISSUE:${NC} Portfolio API is not running"
    echo "SOLUTION: kubectl apply -f k8s/deployments/portfolio-api-deployment.yaml"
    echo ""
else
    echo -e "${GREEN}All checks passed!${NC}"
    echo "If apps still don't show up, check the browser console for errors."
    echo "The dashboard should update within 30 seconds of deployment."
fi

echo ""
echo "=================================================="
