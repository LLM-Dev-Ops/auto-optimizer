#!/usr/bin/env bash
# Test all components with coverage

set -e

echo "======================================"
echo "LLM Auto Optimizer - Full Test Suite"
echo "======================================"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Run unit tests
echo -e "${BLUE}Running unit tests...${NC}"
cargo test --all --lib
echo -e "${GREEN}✓ Unit tests passed${NC}"
echo ""

# Run integration tests
echo -e "${BLUE}Running integration tests...${NC}"
cargo test --test '*' integration
echo -e "${GREEN}✓ Integration tests passed${NC}"
echo ""

# Run E2E tests
echo -e "${BLUE}Running end-to-end tests...${NC}"
cargo test --test '*' e2e
echo -e "${GREEN}✓ E2E tests passed${NC}"
echo ""

# Run CLI tests
echo -e "${BLUE}Running CLI tests...${NC}"
cargo test --test '*' cli
echo -e "${GREEN}✓ CLI tests passed${NC}"
echo ""

# Run documentation tests
echo -e "${BLUE}Running documentation tests...${NC}"
cargo test --doc
echo -e "${GREEN}✓ Documentation tests passed${NC}"
echo ""

# Generate coverage report
echo -e "${BLUE}Generating coverage report...${NC}"
if command -v cargo-tarpaulin &> /dev/null; then
    cargo tarpaulin --out Html --output-dir coverage --exclude-files 'tests/*' --timeout 300
    echo -e "${GREEN}✓ Coverage report generated in coverage/index.html${NC}"
else
    echo -e "${RED}⚠ cargo-tarpaulin not installed. Install with: cargo install cargo-tarpaulin${NC}"
fi
echo ""

echo -e "${GREEN}======================================"
echo "All tests passed successfully!"
echo "======================================${NC}"
