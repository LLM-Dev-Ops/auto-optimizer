#!/usr/bin/env bash
# Run deployment tests

set -e

echo "======================================"
echo "Deployment Tests"
echo "======================================"

# Test Docker build
echo "Testing Docker build..."
docker build -t llm-auto-optimizer:test -f Dockerfile .
echo "✓ Docker build successful"

# Test Docker run
echo "Testing Docker run..."
CONTAINER_ID=$(docker run -d llm-auto-optimizer:test)
sleep 5
docker logs $CONTAINER_ID
docker stop $CONTAINER_ID
docker rm $CONTAINER_ID
echo "✓ Docker run successful"

# Test Docker Compose
echo "Testing Docker Compose..."
docker-compose config
echo "✓ Docker Compose configuration valid"

echo ""
echo "✓ All deployment tests passed"
