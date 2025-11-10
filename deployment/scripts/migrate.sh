#!/bin/bash
# Database migration script for LLM Auto Optimizer
set -e

CONFIG_FILE="${CONFIG_FILE:-/etc/llm-optimizer/config.yaml}"
BIN_DIR="${BIN_DIR:-/opt/llm-optimizer/bin}"

echo "Running database migrations..."

if [ -f "$BIN_DIR/llm-optimizer-service" ]; then
    "$BIN_DIR/llm-optimizer-service" migrate --config "$CONFIG_FILE"
    echo "Migrations completed successfully!"
else
    echo "Error: Service binary not found at $BIN_DIR/llm-optimizer-service"
    exit 1
fi
