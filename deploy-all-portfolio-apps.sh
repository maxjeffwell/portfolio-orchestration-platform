#!/bin/bash

# Deploy All Portfolio Apps Script
# This script deploys all portfolio applications and their dependencies

echo "=================================================="
echo "Deploying Portfolio Applications"
echo "=================================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Change to script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR"

echo "Working directory: $SCRIPT_DIR"
echo ""

# Step 1: Deploy RBAC configuration
echo "1. Deploying RBAC configuration for portfolio-api..."
if [ -f "k8s/api-rbac.yaml" ]; then
    kubectl apply -f k8s/api-rbac.yaml
    echo -e "${GREEN}✓${NC} RBAC configuration applied"
else
    echo -e "${YELLOW}⚠${NC} k8s/api-rbac.yaml not found, skipping..."
fi
echo ""

# Step 2: Deploy portfolio-api
echo "2. Deploying portfolio-api..."
if [ -f "k8s/deployments/portfolio-api-deployment.yaml" ]; then
    kubectl apply -f k8s/deployments/portfolio-api-deployment.yaml
    echo -e "${GREEN}✓${NC} portfolio-api deployment applied"
else
    echo -e "${YELLOW}⚠${NC} portfolio-api deployment not found, skipping..."
fi

if [ -f "k8s/services/portfolio-api-service.yaml" ]; then
    kubectl apply -f k8s/services/portfolio-api-service.yaml
    echo -e "${GREEN}✓${NC} portfolio-api service applied"
fi
echo ""

# Step 3: Deploy portfolio applications
echo "3. Deploying portfolio applications..."
PORTFOLIO_APPS=("educationelly" "code-talk" "intervalai" "bookmarked" "firebook" "educationelly-graphql")

for app in "${PORTFOLIO_APPS[@]}"; do
    echo ""
    echo "   Deploying $app..."

    # Deploy deployment
    if [ -f "k8s/deployments/${app}-deployment.yaml" ]; then
        kubectl apply -f "k8s/deployments/${app}-deployment.yaml"
        echo -e "   ${GREEN}✓${NC} ${app} deployment applied"
    else
        echo -e "   ${YELLOW}⚠${NC} ${app}-deployment.yaml not found"
    fi

    # Deploy service
    if [ -f "k8s/services/${app}-service.yaml" ]; then
        kubectl apply -f "k8s/services/${app}-service.yaml"
        echo -e "   ${GREEN}✓${NC} ${app} service applied"
    fi
done
echo ""

# Step 4: Wait for deployments to be ready
echo "4. Waiting for deployments to be ready..."
echo "   (This may take a few minutes)"
echo ""

kubectl wait --for=condition=available --timeout=300s \
    deployment -l portfolio=true -n default 2>/dev/null && \
    echo -e "${GREEN}✓${NC} All portfolio deployments are ready!" || \
    echo -e "${YELLOW}⚠${NC} Some deployments may still be starting..."

echo ""

# Step 5: Show deployment status
echo "5. Current deployment status:"
echo ""
kubectl get deployments -n default -l portfolio=true -o wide
echo ""

# Step 6: Show services
echo "6. Services:"
echo ""
kubectl get services -n default | grep -E "portfolio-api|educationelly|code-talk|intervalai|bookmarked|firebook"
echo ""

echo "=================================================="
echo "Deployment Complete!"
echo "=================================================="
echo ""
echo "Next steps:"
echo "1. Wait 30 seconds for the dashboard to auto-update"
echo "2. Visit https://pop-portfolio.el-jefe.me"
echo "3. Check the Deployments page - your apps should now appear"
echo ""
echo "To check status: kubectl get deployments -n default -l portfolio=true"
echo "To view logs: kubectl logs -l app=portfolio-api -n default"
echo ""
