#!/usr/bin/env bash
# Run end-to-end tests

set -e

echo "Running end-to-end tests..."

# Start dependencies if needed
if [ "$START_DEPS" = "true" ]; then
    echo "Starting dependencies..."
    docker-compose up -d postgres redis kafka
    sleep 5
fi

cargo test --test '*' e2e -- --test-threads=1 --nocapture

# Cleanup
if [ "$START_DEPS" = "true" ]; then
    echo "Stopping dependencies..."
    docker-compose down
fi

echo "✓ End-to-end tests completed"
