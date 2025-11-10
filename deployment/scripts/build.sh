#!/bin/bash
# Build script for LLM Auto Optimizer
# Supports multi-platform builds and optimizations

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
BUILD_TYPE="${BUILD_TYPE:-release}"
TARGET="${TARGET:-}"
FEATURES="${FEATURES:-}"
VERBOSE="${VERBOSE:-false}"
CROSS_COMPILE="${CROSS_COMPILE:-false}"
OUTPUT_DIR="${OUTPUT_DIR:-./target}"

# Project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Print banner
echo -e "${BLUE}==================================================================${NC}"
echo -e "${BLUE}  LLM Auto Optimizer - Build Script${NC}"
echo -e "${BLUE}==================================================================${NC}"
echo ""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --debug)
            BUILD_TYPE="debug"
            shift
            ;;
        --release)
            BUILD_TYPE="release"
            shift
            ;;
        --target)
            TARGET="$2"
            shift 2
            ;;
        --features)
            FEATURES="$2"
            shift 2
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --cross)
            CROSS_COMPILE=true
            shift
            ;;
        --output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --debug           Build in debug mode (default: release)"
            echo "  --release         Build in release mode"
            echo "  --target TARGET   Cross-compile for TARGET"
            echo "  --features FEAT   Build with specific features"
            echo "  --verbose         Verbose output"
            echo "  --cross           Use cross-compilation"
            echo "  --output DIR      Output directory"
            echo "  --help            Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0 --release"
            echo "  $0 --target x86_64-unknown-linux-musl"
            echo "  $0 --cross --target aarch64-unknown-linux-gnu"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

cd "$PROJECT_ROOT"

# Print build configuration
echo -e "${YELLOW}Build Configuration:${NC}"
echo -e "  Build Type:        ${GREEN}$BUILD_TYPE${NC}"
echo -e "  Target:            ${GREEN}${TARGET:-native}${NC}"
echo -e "  Features:          ${GREEN}${FEATURES:-default}${NC}"
echo -e "  Cross Compile:     ${GREEN}$CROSS_COMPILE${NC}"
echo -e "  Output Directory:  ${GREEN}$OUTPUT_DIR${NC}"
echo ""

# Check dependencies
echo -e "${YELLOW}Checking dependencies...${NC}"
if ! command -v cargo &> /dev/null; then
    echo -e "${RED}Error: cargo is not installed${NC}"
    echo -e "${YELLOW}Install Rust: https://rustup.rs/${NC}"
    exit 1
fi

if [ "$CROSS_COMPILE" = true ] && ! command -v cross &> /dev/null; then
    echo -e "${YELLOW}Installing cross...${NC}"
    cargo install cross --git https://github.com/cross-rs/cross
fi

echo -e "${GREEN}✓ All dependencies satisfied${NC}"
echo ""

# Build command
BUILD_CMD="cargo"
if [ "$CROSS_COMPILE" = true ]; then
    BUILD_CMD="cross"
fi

BUILD_ARGS=()

# Add build type
if [ "$BUILD_TYPE" = "release" ]; then
    BUILD_ARGS+=("build" "--release" "--locked")
else
    BUILD_ARGS+=("build")
fi

# Add target
if [ -n "$TARGET" ]; then
    BUILD_ARGS+=("--target" "$TARGET")
fi

# Add features
if [ -n "$FEATURES" ]; then
    BUILD_ARGS+=("--features" "$FEATURES")
fi

# Add workspace flag
BUILD_ARGS+=("--workspace")

# Add verbose flag
if [ "$VERBOSE" = true ]; then
    BUILD_ARGS+=("--verbose")
fi

# Run build
echo -e "${YELLOW}Building LLM Auto Optimizer...${NC}"
echo -e "${BLUE}Command: $BUILD_CMD ${BUILD_ARGS[*]}${NC}"
echo ""

if $BUILD_CMD "${BUILD_ARGS[@]}"; then
    echo ""
    echo -e "${GREEN}✓ Build successful!${NC}"
else
    echo ""
    echo -e "${RED}✗ Build failed!${NC}"
    exit 1
fi

# List built binaries
echo ""
echo -e "${YELLOW}Built binaries:${NC}"

TARGET_DIR="target"
if [ -n "$TARGET" ]; then
    TARGET_DIR="target/$TARGET"
fi

if [ "$BUILD_TYPE" = "release" ]; then
    TARGET_DIR="$TARGET_DIR/release"
else
    TARGET_DIR="$TARGET_DIR/debug"
fi

if [ -d "$TARGET_DIR" ]; then
    find "$TARGET_DIR" -maxdepth 1 -type f -executable ! -name "*.so" ! -name "*.d" | while read -r binary; do
        if [ -f "$binary" ]; then
            size=$(du -h "$binary" | cut -f1)
            echo -e "  ${GREEN}$(basename "$binary")${NC} ($size)"
        fi
    done
fi

# Copy binaries to output directory if specified
if [ "$OUTPUT_DIR" != "./target" ]; then
    echo ""
    echo -e "${YELLOW}Copying binaries to $OUTPUT_DIR...${NC}"
    mkdir -p "$OUTPUT_DIR"
    find "$TARGET_DIR" -maxdepth 1 -type f -executable ! -name "*.so" ! -name "*.d" -exec cp {} "$OUTPUT_DIR/" \;
    echo -e "${GREEN}✓ Binaries copied${NC}"
fi

# Run tests if requested
if [ "${RUN_TESTS:-false}" = true ]; then
    echo ""
    echo -e "${YELLOW}Running tests...${NC}"
    if cargo test --workspace; then
        echo -e "${GREEN}✓ All tests passed${NC}"
    else
        echo -e "${RED}✗ Tests failed${NC}"
        exit 1
    fi
fi

# Generate checksums
echo ""
echo -e "${YELLOW}Generating checksums...${NC}"
if [ -d "$OUTPUT_DIR" ]; then
    cd "$OUTPUT_DIR"
    find . -type f -executable ! -name "*.so" ! -name "*.d" -exec sha256sum {} \; > checksums.txt
    echo -e "${GREEN}✓ Checksums generated: $OUTPUT_DIR/checksums.txt${NC}"
    cd "$PROJECT_ROOT"
fi

echo ""
echo -e "${GREEN}==================================================================${NC}"
echo -e "${GREEN}  Build completed successfully!${NC}"
echo -e "${GREEN}==================================================================${NC}"
