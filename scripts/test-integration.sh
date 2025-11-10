#!/usr/bin/env bash
# Run integration tests only

set -e

echo "Running integration tests..."

cargo test --test '*' integration -- --test-threads=4 --nocapture

echo "✓ Integration tests completed"
