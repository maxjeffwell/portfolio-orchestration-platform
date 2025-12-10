#!/bin/bash

# Deploy Portfolio API with all required resources
# Run this on your server to deploy/fix the portfolio-api

set -e

echo "Deploying Portfolio API..."

# 1. Create the secret
echo "Creating portfolio-api-secrets..."
kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: portfolio-api-secrets
  namespace: default
type: Opaque
stringData:
  auth-database-url: "postgres://neondb_owner:npg_GeqU0vPo3TaF@ep-flat-resonance-addiekdb-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require"
  jwt-secret: "ef3e3baf0e5632f0159ffd0543f1b4a737484188399fae5acd8ec674bc7fcf9b6146765af53cd5c6864c85a43f9537b845ecfbc6f71f281f59886cb46a71141a"
  admin-username: "admin"
  admin-password: "admin123"
EOF

# 2. Apply RBAC (ServiceAccount, ClusterRole, ClusterRoleBinding)
echo "Applying RBAC for Kubernetes API access..."
kubectl apply -f k8s/api-rbac.yaml

# 3. Apply the service
echo "Applying portfolio-api service..."
kubectl apply -f k8s/services/portfolio-api-service.yaml

# 4. Apply the deployment
echo "Applying portfolio-api deployment..."
kubectl apply -f k8s/deployments/portfolio-api-deployment.yaml

# 4b. Apply the API ingress (with priority 200)
echo "Applying portfolio-api ingress..."
kubectl apply -f k8s/ingress/portfolio-api-ingress.yaml

# 5. Restart the deployment to pick up any changes
echo "Restarting portfolio-api deployment..."
kubectl rollout restart deployment/portfolio-api

# 6. Wait for rollout
echo "Waiting for rollout to complete..."
kubectl rollout status deployment/portfolio-api --timeout=120s

# 7. Show status
echo ""
echo "=== Portfolio API Status ==="
kubectl get pods -l app=portfolio-api
echo ""
echo "=== Recent Logs ==="
kubectl logs -l app=portfolio-api --tail=20

echo ""
echo "Done! Try logging in at https://pop-portfolio.el-jefe.me/portfolio/login"
echo "Username: admin"
echo "Password: admin123"
