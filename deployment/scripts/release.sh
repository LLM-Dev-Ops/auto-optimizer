#!/bin/bash
# Release script for LLM Auto Optimizer
# Creates release artifacts for multiple platforms

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
VERSION="${VERSION:-$(git describe --tags --always)}"
RELEASE_DIR="${RELEASE_DIR:-./releases/$VERSION}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Supported platforms
PLATFORMS=(
    "x86_64-unknown-linux-gnu"
    "x86_64-unknown-linux-musl"
    "aarch64-unknown-linux-gnu"
    "x86_64-apple-darwin"
    "aarch64-apple-darwin"
    "x86_64-pc-windows-gnu"
)

echo -e "${BLUE}==================================================================${NC}"
echo -e "${BLUE}  LLM Auto Optimizer - Release Script${NC}"
echo -e "${BLUE}==================================================================${NC}"
echo ""

# Parse arguments
SKIP_BUILD=false
SKIP_PACKAGE=false
SKIP_DOCKER=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --version)
            VERSION="$2"
            shift 2
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-package)
            SKIP_PACKAGE=true
            shift
            ;;
        --skip-docker)
            SKIP_DOCKER=true
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --version VERSION   Set release version"
            echo "  --skip-build        Skip building binaries"
            echo "  --skip-package      Skip creating packages"
            echo "  --skip-docker       Skip building Docker images"
            echo "  --help              Show this help"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

cd "$PROJECT_ROOT"

echo -e "${YELLOW}Release Configuration:${NC}"
echo -e "  Version:        ${GREEN}$VERSION${NC}"
echo -e "  Release Dir:    ${GREEN}$RELEASE_DIR${NC}"
echo -e "  Skip Build:     ${GREEN}$SKIP_BUILD${NC}"
echo -e "  Skip Package:   ${GREEN}$SKIP_PACKAGE${NC}"
echo -e "  Skip Docker:    ${GREEN}$SKIP_DOCKER${NC}"
echo ""

# Create release directory
mkdir -p "$RELEASE_DIR"

# Build for all platforms
if [ "$SKIP_BUILD" = false ]; then
    echo -e "${YELLOW}Building for all platforms...${NC}"
    for platform in "${PLATFORMS[@]}"; do
        echo ""
        echo -e "${BLUE}Building for $platform...${NC}"

        if ./deployment/scripts/build.sh \
            --release \
            --target "$platform" \
            --cross \
            --output "$RELEASE_DIR/$platform"; then
            echo -e "${GREEN}✓ Built for $platform${NC}"
        else
            echo -e "${RED}✗ Failed to build for $platform${NC}"
            # Continue with other platforms
        fi
    done
    echo ""
    echo -e "${GREEN}✓ All platforms built${NC}"
fi

# Create release packages
if [ "$SKIP_PACKAGE" = false ]; then
    echo ""
    echo -e "${YELLOW}Creating release packages...${NC}"

    for platform in "${PLATFORMS[@]}"; do
        if [ -d "$RELEASE_DIR/$platform" ]; then
            echo -e "${BLUE}Packaging $platform...${NC}"

            # Create package directory
            PKG_DIR="$RELEASE_DIR/llm-optimizer-$VERSION-$platform"
            mkdir -p "$PKG_DIR/bin"
            mkdir -p "$PKG_DIR/config"
            mkdir -p "$PKG_DIR/docs"

            # Copy binaries
            cp -r "$RELEASE_DIR/$platform"/* "$PKG_DIR/bin/" 2>/dev/null || true

            # Copy configuration
            cp config.example.yaml "$PKG_DIR/config/"

            # Copy documentation
            cp README.md "$PKG_DIR/"
            cp LICENSE "$PKG_DIR/"
            cp CONTRIBUTING.md "$PKG_DIR/" 2>/dev/null || true

            # Copy deployment files
            cp -r deployment/systemd "$PKG_DIR/systemd" 2>/dev/null || true

            # Create install script
            cat > "$PKG_DIR/install.sh" <<'EOF'
#!/bin/bash
set -e
INSTALL_DIR="${INSTALL_DIR:-/opt/llm-optimizer}"
echo "Installing LLM Auto Optimizer to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cp -r bin/* "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR"/*
echo "Installation complete!"
echo "Configure: $INSTALL_DIR/config/"
EOF
            chmod +x "$PKG_DIR/install.sh"

            # Create archive
            if [[ "$platform" == *"windows"* ]]; then
                (cd "$RELEASE_DIR" && zip -r "llm-optimizer-$VERSION-$platform.zip" "llm-optimizer-$VERSION-$platform")
                echo -e "${GREEN}✓ Created llm-optimizer-$VERSION-$platform.zip${NC}"
            else
                (cd "$RELEASE_DIR" && tar czf "llm-optimizer-$VERSION-$platform.tar.gz" "llm-optimizer-$VERSION-$platform")
                echo -e "${GREEN}✓ Created llm-optimizer-$VERSION-$platform.tar.gz${NC}"
            fi

            # Cleanup
            rm -rf "$PKG_DIR"
        fi
    done

    echo ""
    echo -e "${GREEN}✓ All packages created${NC}"
fi

# Build Docker images
if [ "$SKIP_DOCKER" = false ]; then
    echo ""
    echo -e "${YELLOW}Building Docker images...${NC}"

    # Build service image
    echo -e "${BLUE}Building service image...${NC}"
    docker build -f deployment/docker/Dockerfile.service -t "llm-auto-optimizer:$VERSION" .
    docker tag "llm-auto-optimizer:$VERSION" "llm-auto-optimizer:latest"
    echo -e "${GREEN}✓ Built service image${NC}"

    # Build CLI image
    echo -e "${BLUE}Building CLI image...${NC}"
    docker build -f deployment/docker/Dockerfile.cli -t "llm-auto-optimizer-cli:$VERSION" .
    docker tag "llm-auto-optimizer-cli:$VERSION" "llm-auto-optimizer-cli:latest"
    echo -e "${GREEN}✓ Built CLI image${NC}"

    echo ""
    echo -e "${GREEN}✓ Docker images built${NC}"
fi

# Generate checksums
echo ""
echo -e "${YELLOW}Generating checksums...${NC}"
(cd "$RELEASE_DIR" && sha256sum *.tar.gz *.zip 2>/dev/null > checksums.txt || true)
echo -e "${GREEN}✓ Checksums generated${NC}"

# Generate release notes
echo ""
echo -e "${YELLOW}Generating release notes...${NC}"
cat > "$RELEASE_DIR/RELEASE_NOTES.md" <<EOF
# LLM Auto Optimizer $VERSION

Release Date: $(date +%Y-%m-%d)

## Downloads

### Linux (x86_64)
- GNU libc: \`llm-optimizer-$VERSION-x86_64-unknown-linux-gnu.tar.gz\`
- musl libc: \`llm-optimizer-$VERSION-x86_64-unknown-linux-musl.tar.gz\`

### Linux (ARM64)
- \`llm-optimizer-$VERSION-aarch64-unknown-linux-gnu.tar.gz\`

### macOS
- Intel: \`llm-optimizer-$VERSION-x86_64-apple-darwin.tar.gz\`
- Apple Silicon: \`llm-optimizer-$VERSION-aarch64-apple-darwin.tar.gz\`

### Windows
- \`llm-optimizer-$VERSION-x86_64-pc-windows-gnu.zip\`

### Docker Images
\`\`\`bash
docker pull llm-auto-optimizer:$VERSION
docker pull llm-auto-optimizer-cli:$VERSION
\`\`\`

## Installation

### Binary Installation
\`\`\`bash
# Download and extract
tar xzf llm-optimizer-$VERSION-<platform>.tar.gz
cd llm-optimizer-$VERSION-<platform>

# Install
sudo ./install.sh
\`\`\`

### Docker Installation
\`\`\`bash
docker run -d \\
  -p 8080:8080 \\
  -v ./config.yaml:/app/config/config.yaml \\
  llm-auto-optimizer:$VERSION
\`\`\`

### Kubernetes Installation
\`\`\`bash
helm install llm-optimizer ./deployment/helm \\
  --namespace llm-optimizer \\
  --create-namespace
\`\`\`

## Verification

Verify the checksums:
\`\`\`bash
sha256sum -c checksums.txt
\`\`\`

## Changes

$(git log --pretty=format:"- %s (%h)" --no-merges $(git describe --tags --abbrev=0 HEAD^)..HEAD)

## Documentation

- [Installation Guide](https://github.com/globalbusinessadvisors/llm-auto-optimizer/blob/main/docs/DEPLOYMENT_GUIDE.md)
- [Configuration Reference](https://github.com/globalbusinessadvisors/llm-auto-optimizer/blob/main/config.example.yaml)
- [API Documentation](https://github.com/globalbusinessadvisors/llm-auto-optimizer/tree/main/docs)

## Support

- Issues: https://github.com/globalbusinessadvisors/llm-auto-optimizer/issues
- Discussions: https://github.com/globalbusinessadvisors/llm-auto-optimizer/discussions
EOF

echo -e "${GREEN}✓ Release notes generated${NC}"

# Summary
echo ""
echo -e "${GREEN}==================================================================${NC}"
echo -e "${GREEN}  Release $VERSION created successfully!${NC}"
echo -e "${GREEN}==================================================================${NC}"
echo ""
echo -e "${YELLOW}Release artifacts:${NC}"
echo -e "  Location: ${GREEN}$RELEASE_DIR${NC}"
echo ""
echo -e "${YELLOW}Contents:${NC}"
ls -lh "$RELEASE_DIR"/*.tar.gz "$RELEASE_DIR"/*.zip 2>/dev/null || true
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Test the release artifacts"
echo -e "  2. Create a Git tag: ${GREEN}git tag -a v$VERSION -m 'Release $VERSION'${NC}"
echo -e "  3. Push the tag: ${GREEN}git push origin v$VERSION${NC}"
echo -e "  4. Create GitHub release with artifacts from: ${GREEN}$RELEASE_DIR${NC}"
echo -e "  5. Push Docker images to registry"
echo ""
