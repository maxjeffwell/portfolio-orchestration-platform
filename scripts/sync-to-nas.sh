#!/bin/bash
# Sync NAS configuration files to the NAS via SSH

set -e

# NAS connection details (customize these)
NAS_HOST="${NAS_HOST:-192.168.50.142}"
NAS_USER="${NAS_USER:-root}"
NAS_DOCKER_DIR="/ssd/docker"

echo "🔄 Syncing IntervalAI configuration to NAS..."

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
NAS_CONFIG_DIR="$PROJECT_ROOT/nas-configs"

echo "📂 Source: $NAS_CONFIG_DIR"
echo "🎯 Target: $NAS_USER@$NAS_HOST:$NAS_DOCKER_DIR"
echo ""

# Copy the stack file
echo "📋 Copying intervalai-stack.yml..."
scp "$NAS_CONFIG_DIR/intervalai-stack.yml" "$NAS_USER@$NAS_HOST:$NAS_DOCKER_DIR/"

echo ""
echo "⚠️  Manual step required:"
echo "You need to manually update the nginx config on the NAS."
echo ""
echo "On your NAS, edit: $NAS_DOCKER_DIR/nginx/nginx.conf"
echo "Replace the spaced-repetition server block with the content from:"
echo "  $NAS_CONFIG_DIR/nginx-intervalai.conf"
echo ""
echo "Or copy the nginx config snippet:"
cat "$NAS_CONFIG_DIR/nginx-intervalai.conf"
echo ""
echo "Then run on the NAS:"
echo "  cd $NAS_DOCKER_DIR"
echo "  docker-compose -f spaced-repetition-stack-cors-fixed.yml down"
echo "  docker-compose -f intervalai-stack.yml up -d"
echo "  docker restart shared-nginx-proxy"
echo ""
echo "✅ Stack file synced successfully!"
