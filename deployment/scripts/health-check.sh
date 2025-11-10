#!/bin/bash
# Health check script for LLM Auto Optimizer
set -e

HOST="${HOST:-localhost}"
PORT="${PORT:-8080}"
TIMEOUT="${TIMEOUT:-10}"

# Check HTTP endpoint
if curl -f -s --max-time "$TIMEOUT" "http://$HOST:$PORT/health" > /dev/null; then
    echo "✓ HTTP health check passed"
    EXIT_CODE=0
else
    echo "✗ HTTP health check failed"
    EXIT_CODE=1
fi

# Check gRPC endpoint (if grpcurl is available)
if command -v grpcurl &> /dev/null; then
    if grpcurl -plaintext -max-time "$TIMEOUT" "$HOST:50051" list > /dev/null 2>&1; then
        echo "✓ gRPC health check passed"
    else
        echo "✗ gRPC health check failed"
        EXIT_CODE=1
    fi
fi

# Check PostgreSQL connection
if command -v pg_isready &> /dev/null; then
    if pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
        echo "✓ PostgreSQL connection OK"
    else
        echo "✗ PostgreSQL connection failed"
        EXIT_CODE=1
    fi
fi

# Check Redis connection
if command -v redis-cli &> /dev/null; then
    if redis-cli ping > /dev/null 2>&1; then
        echo "✓ Redis connection OK"
    else
        echo "✗ Redis connection failed"
        EXIT_CODE=1
    fi
fi

exit $EXIT_CODE
