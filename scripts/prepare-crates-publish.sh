#!/bin/bash
set -e

# Script to prepare all crates for publishing to crates.io
# This adds required metadata to each Cargo.toml

CRATES=(
    "types:Core types and data structures for LLM Auto Optimizer"
    "config:Configuration management with hot-reload support"
    "collector:Metrics and data collection from LLM systems"
    "processor:Data processing and transformation pipeline"
    "analyzer:Statistical analysis and anomaly detection"
    "decision:Intelligent decision-making engine"
    "actuator:Action execution and system orchestration"
    "storage:Multi-backend storage layer with PostgreSQL, Redis, and Sled"
    "integrations:External service integrations (GitHub, Slack, Jira, Anthropic)"
    "api:Core API types and utilities"
    "api-rest:Production-ready REST API with OpenAPI documentation"
    "api-grpc:High-performance gRPC API with streaming support"
    "api-tests:Comprehensive API testing suite"
    "cli:Beautiful CLI tool with 40+ commands"
    "llm-optimizer:Main service binary with health monitoring and orchestration"
)

echo "Preparing crates for publishing..."

for crate_info in "${CRATES[@]}"; do
    IFS=':' read -r crate_name description <<< "$crate_info"
    toml_file="crates/$crate_name/Cargo.toml"

    if [ ! -f "$toml_file" ]; then
        echo "⚠️  Warning: $toml_file not found"
        continue
    fi

    echo "📦 Processing $crate_name..."

    # Check if description already exists
    if ! grep -q "^description = " "$toml_file"; then
        # Add description after rust-version line
        if grep -q "rust-version.workspace" "$toml_file"; then
            sed -i "/rust-version.workspace/a description = \"$description\"" "$toml_file"
        else
            # Add after repository line
            sed -i "/repository.workspace/a description = \"$description\"" "$toml_file"
        fi
        echo "  ✓ Added description"
    else
        echo "  ℹ Description already exists"
    fi
done

echo ""
echo "✅ All crates prepared for publishing!"
echo ""
echo "Next steps:"
echo "1. cargo build --workspace --all-targets"
echo "2. cargo test --workspace"
echo "3. cargo publish -p llm-optimizer-types --dry-run"
echo "4. Review and publish in dependency order"
