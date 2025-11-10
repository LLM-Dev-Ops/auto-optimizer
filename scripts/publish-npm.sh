#!/bin/bash
set -e

# Script to publish npm packages to npm registry

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

DRY_RUN=${DRY_RUN:-true}

echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  LLM Auto Optimizer - npm Publishing Script${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""

# Check if we're in dry-run mode
if [ "$DRY_RUN" = "true" ]; then
    echo -e "${YELLOW}🔍 Running in DRY-RUN mode (no actual publishing)${NC}"
    echo -e "${YELLOW}   To publish for real, run: DRY_RUN=false $0${NC}"
else
    echo -e "${RED}⚠️  LIVE MODE - Will publish to npm!${NC}"
    echo -e "${YELLOW}   Press Ctrl+C within 5 seconds to cancel...${NC}"
    sleep 5
fi
echo ""

# Check npm login
if [ "$DRY_RUN" = "false" ]; then
    if ! npm whoami &> /dev/null; then
        echo -e "${RED}❌ Not logged in to npm. Run 'npm login' first.${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Logged in to npm as: $(npm whoami)${NC}"
    echo ""
fi

# Packages to publish
PACKAGES=(
    ".:@llm-auto-optimizer/core"
    "src/integrations/github:@llm-auto-optimizer/github-integration"
)

PUBLISHED_COUNT=0
SKIPPED_COUNT=0
FAILED_COUNT=0

for package_info in "${PACKAGES[@]}"; do
    IFS=':' read -r package_path package_name <<< "$package_info"

    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Processing: ${package_name}${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    if [ ! -f "$package_path/package.json" ]; then
        echo -e "${RED}❌ package.json not found in $package_path${NC}"
        ((FAILED_COUNT++))
        continue
    fi

    cd "$package_path"

    # Get version
    VERSION=$(node -p "require('./package.json').version")
    echo -e "  Version: ${YELLOW}$VERSION${NC}"

    # Install dependencies
    echo -e "  Installing dependencies..."
    if [ -f "package-lock.json" ]; then
        npm ci
    else
        npm install
    fi

    # Build if build script exists
    if grep -q '"build"' package.json; then
        echo -e "  Building package..."
        if ! npm run build; then
            echo -e "${RED}❌ Build failed for $package_name${NC}"
            cd - > /dev/null
            ((FAILED_COUNT++))
            continue
        fi
    fi

    # Run tests if test script exists
    if grep -q '"test"' package.json; then
        echo -e "  Running tests..."
        if ! npm test; then
            echo -e "${RED}❌ Tests failed for $package_name${NC}"
            cd - > /dev/null
            ((FAILED_COUNT++))
            continue
        fi
    fi

    # Publish
    if [ "$DRY_RUN" = "true" ]; then
        echo -e "  Running publish dry-run..."
        if npm publish --dry-run; then
            echo -e "${GREEN}✓ Dry-run successful (not published)${NC}"
            ((SKIPPED_COUNT++))
        else
            echo -e "${RED}❌ Dry-run failed for $package_name${NC}"
            ((FAILED_COUNT++))
        fi
    else
        echo -e "  Publishing to npm..."
        if npm publish; then
            echo -e "${GREEN}✓ Successfully published $package_name@$VERSION${NC}"
            ((PUBLISHED_COUNT++))
        else
            echo -e "${RED}❌ Failed to publish $package_name${NC}"
            ((FAILED_COUNT++))
        fi
    fi

    cd - > /dev/null
    echo ""
done

# Summary
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Publishing Summary${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"

if [ "$DRY_RUN" = "true" ]; then
    echo -e "${GREEN}✓ Validated: $SKIPPED_COUNT packages${NC}"
else
    echo -e "${GREEN}✓ Published: $PUBLISHED_COUNT packages${NC}"
fi

if [ $FAILED_COUNT -gt 0 ]; then
    echo -e "${RED}❌ Failed: $FAILED_COUNT packages${NC}"
    exit 1
fi

echo ""
if [ "$DRY_RUN" = "true" ]; then
    echo -e "${GREEN}🎉 All packages validated successfully!${NC}"
    echo -e "${YELLOW}   Run 'DRY_RUN=false $0' to publish for real${NC}"
else
    echo -e "${GREEN}🎉 All packages published successfully!${NC}"
    echo -e "${GREEN}   View at: https://www.npmjs.com/org/llm-auto-optimizer${NC}"
fi
