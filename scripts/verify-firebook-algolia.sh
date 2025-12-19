#!/bin/bash
# Verify FireBook Algolia configuration and deployment status

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 FireBook Algolia Configuration Verification${NC}\n"

# 1. Check GitHub Secrets
echo -e "${BLUE}1️⃣  Checking GitHub Secrets...${NC}"
cd /home/maxjeffwell/GitHub_Projects/bookmarks-capstone-api
if gh secret list | grep -q "VITE_ALGOLIA_APP_ID\|VITE_ALGOLIA_SEARCH_API_KEY\|VITE_ALGOLIA_INDEX_NAME"; then
    echo -e "${GREEN}✅ Algolia secrets configured in GitHub${NC}"
    echo "   Secrets found:"
    gh secret list | grep "VITE_ALGOLIA" | awk '{print "   - " $1 " (updated: " $2 ")"}'
else
    echo -e "${RED}❌ Algolia secrets missing in GitHub${NC}"
    exit 1
fi

# 2. Check recent Docker builds
echo -e "\n${BLUE}2️⃣  Checking Recent Docker Builds...${NC}"
LATEST_BUILD=$(gh run list --workflow="docker-build-push.yml" --limit 1 --json conclusion,createdAt,headSha --jq '.[0]')
BUILD_STATUS=$(echo "$LATEST_BUILD" | jq -r '.conclusion')
BUILD_TIME=$(echo "$LATEST_BUILD" | jq -r '.createdAt')
BUILD_SHA=$(echo "$LATEST_BUILD" | jq -r '.headSha' | cut -c1-7)

if [ "$BUILD_STATUS" == "success" ]; then
    echo -e "${GREEN}✅ Latest Docker build succeeded${NC}"
    echo "   Build time: $BUILD_TIME"
    echo "   Commit: $BUILD_SHA"
else
    echo -e "${RED}❌ Latest Docker build failed${NC}"
    exit 1
fi

# 3. Check local environment file
echo -e "\n${BLUE}3️⃣  Checking Local Environment Configuration...${NC}"
if [ -f ".env.local" ]; then
    echo -e "${GREEN}✅ .env.local found${NC}"
    if grep -q "VITE_ALGOLIA_APP_ID" .env.local && \
       grep -q "VITE_ALGOLIA_SEARCH_API_KEY" .env.local && \
       grep -q "VITE_ALGOLIA_INDEX_NAME" .env.local; then
        echo "   All required variables present:"
        grep "VITE_ALGOLIA" .env.local | sed 's/=.*/=[REDACTED]/' | awk '{print "   - " $0}'
    else
        echo -e "${YELLOW}⚠️  Some Algolia variables missing${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  .env.local not found (optional for local dev)${NC}"
fi

# 4. Test Algolia Index Connection
echo -e "\n${BLUE}4️⃣  Testing Algolia Index Connection...${NC}"
if [ -f ".env.local" ]; then
    source .env.local

    if [ -n "$VITE_ALGOLIA_APP_ID" ] && [ -n "$VITE_ALGOLIA_SEARCH_API_KEY" ]; then
        RESPONSE=$(curl -s -X POST \
          -H "X-Algolia-API-Key: $VITE_ALGOLIA_SEARCH_API_KEY" \
          -H "X-Algolia-Application-Id: $VITE_ALGOLIA_APP_ID" \
          --data '{"params":"query=&hitsPerPage=1"}' \
          "https://${VITE_ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${VITE_ALGOLIA_INDEX_NAME}/query")

        if echo "$RESPONSE" | grep -q "hits"; then
            HIT_COUNT=$(echo "$RESPONSE" | jq -r '.nbHits' 2>/dev/null || echo "unknown")
            echo -e "${GREEN}✅ Algolia index is accessible${NC}"
            echo "   Index: $VITE_ALGOLIA_INDEX_NAME"
            echo "   Records: $HIT_COUNT bookmarks"
        else
            echo -e "${RED}❌ Failed to connect to Algolia index${NC}"
            echo "   Response: $RESPONSE"
        fi
    else
        echo -e "${YELLOW}⚠️  Skipping connection test (credentials not in .env.local)${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Skipping connection test (.env.local not found)${NC}"
fi

# 5. Check Firebase Extension Status
echo -e "\n${BLUE}5️⃣  Checking Firebase Extension Configuration...${NC}"
if [ -f "extensions/firestore-algolia-search.env" ]; then
    echo -e "${GREEN}✅ Firebase Extension config found${NC}"
    echo "   Configuration:"
    grep -v "^#" extensions/firestore-algolia-search.env | grep "=" | sed 's/=projects.*/=[SECRET]/' | awk '{print "   - " $0}'
else
    echo -e "${YELLOW}⚠️  Firebase Extension config not found${NC}"
fi

# 6. Verify Docker Image (if Docker is available)
echo -e "\n${BLUE}6️⃣  Checking Docker Image...${NC}"
if command -v docker &> /dev/null; then
    if docker pull maxjeffwell/firebook:latest &> /dev/null; then
        echo -e "${GREEN}✅ Successfully pulled latest Docker image${NC}"
        IMAGE_ID=$(docker images maxjeffwell/firebook:latest --format "{{.ID}}")
        IMAGE_SIZE=$(docker images maxjeffwell/firebook:latest --format "{{.Size}}")
        IMAGE_DATE=$(docker images maxjeffwell/firebook:latest --format "{{.CreatedAt}}")
        echo "   Image ID: $IMAGE_ID"
        echo "   Size: $IMAGE_SIZE"
        echo "   Created: $IMAGE_DATE"

        # Try to inspect the image for build args (limited info available)
        echo "   Build info: $(docker inspect maxjeffwell/firebook:latest --format='{{.Created}}' 2>/dev/null || echo 'N/A')"
    else
        echo -e "${YELLOW}⚠️  Could not pull Docker image (authentication may be required)${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Docker not available, skipping image check${NC}"
fi

# 7. Check Kubernetes Deployment (if kubectl is configured)
echo -e "\n${BLUE}7️⃣  Checking Kubernetes Deployment...${NC}"
if command -v kubectl &> /dev/null; then
    if kubectl get deployment firebook -n default &> /dev/null; then
        echo -e "${GREEN}✅ FireBook deployment found${NC}"

        DESIRED=$(kubectl get deployment firebook -n default -o jsonpath='{.spec.replicas}')
        READY=$(kubectl get deployment firebook -n default -o jsonpath='{.status.readyReplicas}')
        IMAGE=$(kubectl get deployment firebook -n default -o jsonpath='{.spec.template.spec.containers[0].image}')
        PULL_POLICY=$(kubectl get deployment firebook -n default -o jsonpath='{.spec.template.spec.containers[0].imagePullPolicy}')

        echo "   Replicas: $READY/$DESIRED ready"
        echo "   Image: $IMAGE"
        echo "   Pull Policy: $PULL_POLICY"

        if [ "$PULL_POLICY" != "Always" ]; then
            echo -e "   ${YELLOW}⚠️  Consider setting imagePullPolicy: Always to ensure latest image is used${NC}"
        fi

        if [ "$READY" == "$DESIRED" ]; then
            echo -e "   ${GREEN}✅ All replicas are ready${NC}"
        else
            echo -e "   ${YELLOW}⚠️  Not all replicas are ready${NC}"
        fi

        # Check pod status
        echo ""
        echo "   Pod Status:"
        kubectl get pods -l app=firebook -n default --no-headers | awk '{print "   - " $1 " (" $3 ")"}'

    else
        echo -e "${YELLOW}⚠️  Could not connect to Kubernetes or deployment not found${NC}"
        echo "   This is normal if running on a different machine than the VPS"
    fi
else
    echo -e "${YELLOW}⚠️  kubectl not configured, skipping deployment check${NC}"
    echo "   Run this script on your VPS for deployment verification"
fi

# Summary
echo -e "\n${BLUE}📋 Summary${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo -e "\n${BLUE}Next Steps:${NC}"
echo "1. If all checks pass locally, run this on your VPS:"
echo -e "   ${YELLOW}ssh your-vps${NC}"
echo -e "   ${YELLOW}cd /path/to/portfolio-orchestration-platform${NC}"
echo -e "   ${YELLOW}./scripts/verify-firebook-algolia.sh${NC}"
echo ""
echo "2. If Kubernetes deployment needs updating:"
echo -e "   ${YELLOW}./scripts/update-firebook.sh${NC}"
echo ""
echo "3. Verify the fix:"
echo -e "   ${YELLOW}Visit https://firebook-k8s.el-jefe.me/${NC}"
echo "   Check browser console for: ✅ Algolia search initialized"

echo ""
