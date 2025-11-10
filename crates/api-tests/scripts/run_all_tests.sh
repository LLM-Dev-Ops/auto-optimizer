#!/bin/bash
# Run all API tests
# Comprehensive test execution script

set -e

echo "====================================="
echo "Running Complete API Test Suite"
echo "====================================="
echo ""

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ $1 PASSED${NC}"
    else
        echo -e "${RED}✗ $1 FAILED${NC}"
        exit 1
    fi
}

# 1. Unit tests
echo "1. Running unit tests..."
cargo test --lib
print_status "Unit tests"

# 2. REST API tests
echo ""
echo "2. Running REST API tests..."
cargo test --test rest_api
print_status "REST API tests"

# 3. gRPC API tests
echo ""
echo "3. Running gRPC API tests..."
cargo test --test grpc_api
print_status "gRPC API tests"

# 4. Gateway tests
echo ""
echo "4. Running API Gateway tests..."
cargo test --test gateway
print_status "Gateway tests"

# 5. Security tests
echo ""
echo "5. Running security tests..."
cargo test --test security
print_status "Security tests"

# 6. Integration tests
echo ""
echo "6. Running integration tests..."
cargo test --test integration
print_status "Integration tests"

# 7. Performance benchmarks
echo ""
echo "7. Running performance benchmarks..."
cargo bench --bench latency_bench --no-run
cargo bench --bench load_test --no-run
cargo bench --bench streaming_bench --no-run
print_status "Performance benchmarks"

# 8. Code coverage (if tarpaulin is installed)
if command -v cargo-tarpaulin &> /dev/null; then
    echo ""
    echo "8. Generating code coverage report..."
    cargo tarpaulin --out Html --output-dir coverage
    print_status "Code coverage"
else
    echo -e "${YELLOW}⚠ cargo-tarpaulin not installed, skipping coverage${NC}"
fi

# 9. Security scan
echo ""
echo "9. Running security scan..."
bash scripts/security_scan.sh
print_status "Security scan"

# 10. Load tests (optional, requires running server)
if [ "$RUN_LOAD_TESTS" = "true" ]; then
    echo ""
    echo "10. Running load tests..."
    bash scripts/load_test.sh
    print_status "Load tests"
else
    echo -e "${YELLOW}⚠ Skipping load tests (set RUN_LOAD_TESTS=true to enable)${NC}"
fi

echo ""
echo "====================================="
echo -e "${GREEN}All tests completed successfully!${NC}"
echo "====================================="
echo ""
echo "Summary:"
echo "  ✓ Unit tests"
echo "  ✓ REST API tests"
echo "  ✓ gRPC API tests"
echo "  ✓ Gateway tests"
echo "  ✓ Security tests"
echo "  ✓ Integration tests"
echo "  ✓ Performance benchmarks"
if command -v cargo-tarpaulin &> /dev/null; then
    echo "  ✓ Code coverage"
fi
echo ""
echo "Test reports available in:"
echo "  - target/criterion/ (benchmarks)"
if command -v cargo-tarpaulin &> /dev/null; then
    echo "  - coverage/ (coverage report)"
fi
