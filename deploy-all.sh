#!/bin/bash

# Portfolio Orchestration Platform Deployment Script
# This script deploys all databases and applications to the k3d cluster

set -e

KUBECONFIG=${KUBECONFIG:-~/.kube/k3d-portfolio.yaml}
export KUBECONFIG

echo "====================================="
echo "Portfolio Platform Deployment"
echo "====================================="
echo ""

# Function to wait for deployment to be ready
wait_for_deployment() {
  local deployment=$1
  local namespace=${2:-default}
  echo "Waiting for $deployment to be ready..."
  kubectl wait --for=condition=available --timeout=300s deployment/$deployment -n $namespace
}

# Function to wait for statefulset to be ready
wait_for_statefulset() {
  local statefulset=$1
  local namespace=${2:-default}
  echo "Waiting for $statefulset to be ready..."
  kubectl wait --for=jsonpath='{.status.readyReplicas}'=1 --timeout=300s statefulset/$statefulset -n $namespace
}

echo "Step 1: Deploying Databases"
echo "-----------------------------"

# Deploy PostgreSQL for Bookmarked
echo "Deploying PostgreSQL for Bookmarked..."
kubectl apply -f k8s/databases/postgresql-bookmarked.yaml
sleep 5
wait_for_statefulset postgresql-bookmarked

# Deploy PostgreSQL for Code Talk
echo "Deploying PostgreSQL for Code Talk..."
kubectl apply -f k8s/databases/postgresql-codetalk.yaml
sleep 5
wait_for_statefulset postgresql-codetalk

# Deploy Redis
echo "Deploying Redis..."
kubectl apply -f k8s/databases/redis.yaml
sleep 5
wait_for_statefulset redis

# Deploy MongoDB for EducationELLy
echo "Deploying MongoDB for EducationELLy..."
kubectl apply -f k8s/databases/mongodb-educationelly.yaml
sleep 5
wait_for_statefulset mongodb-educationelly

# Deploy MongoDB for EducationELLy GraphQL
echo "Deploying MongoDB for EducationELLy GraphQL..."
kubectl apply -f k8s/databases/mongodb-educationelly-graphql.yaml
sleep 5
wait_for_statefulset mongodb-educationelly-graphql

# Deploy MongoDB for IntervalAI
echo "Deploying MongoDB for IntervalAI..."
kubectl apply -f k8s/databases/mongodb-intervalai.yaml
sleep 5
wait_for_statefulset mongodb-intervalai

echo ""
echo "Step 2: Deploying Application Secrets"
echo "--------------------------------------"

kubectl apply -f k8s/secrets/bookmarked-secret.yaml
kubectl apply -f k8s/secrets/code-talk-secret.yaml
kubectl apply -f k8s/secrets/educationelly-secret.yaml
kubectl apply -f k8s/secrets/educationelly-graphql-secret.yaml
kubectl apply -f k8s/secrets/intervalai-secret.yaml

echo ""
echo "Step 3: Deploying Application Services"
echo "---------------------------------------"

kubectl apply -f k8s/services/

echo ""
echo "Step 4: Deploying Applications"
echo "-------------------------------"

# Deploy Bookmarked
echo "Deploying Bookmarked..."
kubectl apply -f k8s/deployments/bookmarked-deployment.yaml

# Deploy Code Talk
echo "Deploying Code Talk..."
kubectl apply -f k8s/deployments/code-talk-deployment.yaml

# Deploy EducationELLy
echo "Deploying EducationELLy..."
kubectl apply -f k8s/deployments/educationelly-deployment.yaml

# Deploy EducationELLy GraphQL
echo "Deploying EducationELLy GraphQL..."
kubectl apply -f k8s/deployments/educationelly-graphql-deployment.yaml

# Deploy IntervalAI
echo "Deploying IntervalAI..."
kubectl apply -f k8s/deployments/intervalai-deployment.yaml

# Deploy Firebook
echo "Deploying Firebook..."
kubectl apply -f k8s/deployments/firebook-deployment.yaml

echo ""
echo "Step 5: Waiting for Application Deployments"
echo "--------------------------------------------"

# Wait for client deployments
wait_for_deployment bookmarked-client
wait_for_deployment code-talk-client
wait_for_deployment educationelly-client
wait_for_deployment educationelly-graphql-client
wait_for_deployment intervalai-client
wait_for_deployment firebook

# Wait for server deployments
wait_for_deployment bookmarked-server
wait_for_deployment code-talk-server
wait_for_deployment educationelly-server
wait_for_deployment educationelly-graphql-server
wait_for_deployment intervalai-server

echo ""
echo "====================================="
echo "Deployment Complete!"
echo "====================================="
echo ""
echo "To check pod status, run:"
echo "  kubectl get pods"
echo ""
echo "To check services, run:"
echo "  kubectl get services"
echo ""
echo "To view logs for a specific pod, run:"
echo "  kubectl logs <pod-name>"
echo ""
