#!/bin/bash
# Build IntervalAI client with correct API configuration
# Run this LOCAL script where the source code is located

set -e

echo "🔄 Building IntervalAI client with correct API URL..."

# Navigate to IntervalAI client directory
# Accept path as argument, or try to find it
if [ -n "$1" ]; then
    CLIENT_DIR="$1"
elif [ -d "/home/maxjeffwell/GitHub_Projects/spaced-repetition-capstone/spaced-repetition-capstone-client" ]; then
    CLIENT_DIR="/home/maxjeffwell/GitHub_Projects/spaced-repetition-capstone/spaced-repetition-capstone-client"
elif [ -d "$HOME/projects/spaced-repetition-capstone/spaced-repetition-capstone-client" ]; then
    CLIENT_DIR="$HOME/projects/spaced-repetition-capstone/spaced-repetition-capstone-client"
elif [ -d "$HOME/GitHub_Projects/spaced-repetition-capstone/spaced-repetition-capstone-client" ]; then
    CLIENT_DIR="$HOME/GitHub_Projects/spaced-repetition-capstone/spaced-repetition-capstone-client"
else
    echo "❌ Error: IntervalAI client directory not found"
    echo ""
    echo "Usage: $0 [path-to-client-directory]"
    echo ""
    echo "Example:"
    echo "  $0 ~/GitHub_Projects/spaced-repetition-capstone/spaced-repetition-capstone-client"
    exit 1
fi

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

echo ""
echo "✅ Build complete and pushed to Docker Hub!"
echo ""
echo "Next step: Run this on your server to deploy:"
echo "  ./scripts/deploy-intervalai-client.sh"
