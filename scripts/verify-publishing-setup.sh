#!/bin/bash
set -e

# Script to verify publishing setup is complete and correct

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  LLM Auto Optimizer - Publishing Setup Verification${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""

ERRORS=0
WARNINGS=0

# Check if Rust is installed
echo -e "${BLUE}Checking Rust installation...${NC}"
if command -v cargo &> /dev/null; then
    CARGO_VERSION=$(cargo --version)
    RUSTC_VERSION=$(rustc --version)
    echo -e "${GREEN}✓ Rust installed: $RUSTC_VERSION${NC}"
    echo -e "${GREEN}✓ Cargo installed: $CARGO_VERSION${NC}"
else
    echo -e "${RED}❌ Rust/Cargo not found${NC}"
    echo -e "${YELLOW}   Install from: https://rustup.rs/${NC}"
    ((ERRORS++))
fi
echo ""

# Check if Node.js is installed
echo -e "${BLUE}Checking Node.js installation...${NC}"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✓ Node.js installed: $NODE_VERSION${NC}"
    echo -e "${GREEN}✓ npm installed: $NPM_VERSION${NC}"
else
    echo -e "${RED}❌ Node.js/npm not found${NC}"
    echo -e "${YELLOW}   Install from: https://nodejs.org/${NC}"
    ((ERRORS++))
fi
echo ""

# Check workspace Cargo.toml
echo -e "${BLUE}Checking workspace Cargo.toml...${NC}"
if [ -f "Cargo.toml" ]; then
    if grep -q "version = " Cargo.toml && \
       grep -q "repository = " Cargo.toml && \
       grep -q "license = " Cargo.toml && \
       grep -q "authors = " Cargo.toml; then
        echo -e "${GREEN}✓ Workspace metadata present${NC}"
    else
        echo -e "${RED}❌ Missing workspace metadata${NC}"
        ((ERRORS++))
    fi
else
    echo -e "${RED}❌ Cargo.toml not found${NC}"
    ((ERRORS++))
fi
echo ""

# Check each crate has description
echo -e "${BLUE}Checking crate metadata...${NC}"
MISSING_DESC=0
for crate_dir in crates/*; do
    if [ -d "$crate_dir" ] && [ -f "$crate_dir/Cargo.toml" ]; then
        crate_name=$(basename "$crate_dir")
        if grep -q "description = " "$crate_dir/Cargo.toml"; then
            echo -e "  ${GREEN}✓${NC} $crate_name"
        else
            echo -e "  ${RED}❌${NC} $crate_name (missing description)"
            ((MISSING_DESC++))
        fi
    fi
done

if [ $MISSING_DESC -eq 0 ]; then
    echo -e "${GREEN}✓ All crates have descriptions${NC}"
else
    echo -e "${RED}❌ $MISSING_DESC crates missing descriptions${NC}"
    echo -e "${YELLOW}   Run: ./scripts/prepare-crates-publish.sh${NC}"
    ((ERRORS++))
fi
echo ""

# Check npm packages
echo -e "${BLUE}Checking npm packages...${NC}"
NPM_ISSUES=0

if [ -f "package.json" ]; then
    if grep -q '"name"' package.json && \
       grep -q '"version"' package.json && \
       grep -q '"repository"' package.json; then
        echo -e "  ${GREEN}✓${NC} Root package.json"
    else
        echo -e "  ${RED}❌${NC} Root package.json (missing metadata)"
        ((NPM_ISSUES++))
    fi
else
    echo -e "  ${RED}❌${NC} Root package.json not found"
    ((NPM_ISSUES++))
fi

for integration_dir in src/integrations/*/; do
    if [ -f "$integration_dir/package.json" ]; then
        integration_name=$(basename "$integration_dir")
        if grep -q '"name"' "$integration_dir/package.json" && \
           grep -q '"version"' "$integration_dir/package.json" && \
           grep -q '"publishConfig"' "$integration_dir/package.json"; then
            echo -e "  ${GREEN}✓${NC} $integration_name"
        else
            echo -e "  ${YELLOW}⚠${NC}  $integration_name (missing publishConfig)"
            ((WARNINGS++))
        fi
    fi
done

if [ $NPM_ISSUES -eq 0 ]; then
    echo -e "${GREEN}✓ npm packages configured${NC}"
else
    echo -e "${RED}❌ $NPM_ISSUES npm package issues${NC}"
    ((ERRORS++))
fi
echo ""

# Check authentication
echo -e "${BLUE}Checking authentication...${NC}"

# Check cargo login
if [ -f "$HOME/.cargo/credentials.toml" ] || [ -n "$CARGO_REGISTRY_TOKEN" ]; then
    echo -e "${GREEN}✓ Cargo credentials found${NC}"
else
    echo -e "${YELLOW}⚠ No cargo credentials${NC}"
    echo -e "${YELLOW}   Run: cargo login <token>${NC}"
    echo -e "${YELLOW}   Or set: CARGO_REGISTRY_TOKEN${NC}"
    ((WARNINGS++))
fi

# Check npm login
if npm whoami &> /dev/null || [ -n "$NPM_TOKEN" ]; then
    if npm whoami &> /dev/null; then
        NPM_USER=$(npm whoami)
        echo -e "${GREEN}✓ Logged in to npm as: $NPM_USER${NC}"
    else
        echo -e "${GREEN}✓ NPM_TOKEN is set${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Not logged in to npm${NC}"
    echo -e "${YELLOW}   Run: npm login${NC}"
    echo -e "${YELLOW}   Or set: NPM_TOKEN${NC}"
    ((WARNINGS++))
fi
echo ""

# Check publishing scripts
echo -e "${BLUE}Checking publishing scripts...${NC}"
if [ -f "scripts/publish-crates.sh" ] && [ -x "scripts/publish-crates.sh" ]; then
    echo -e "${GREEN}✓ publish-crates.sh (executable)${NC}"
else
    echo -e "${RED}❌ publish-crates.sh missing or not executable${NC}"
    ((ERRORS++))
fi

if [ -f "scripts/publish-npm.sh" ] && [ -x "scripts/publish-npm.sh" ]; then
    echo -e "${GREEN}✓ publish-npm.sh (executable)${NC}"
else
    echo -e "${RED}❌ publish-npm.sh missing or not executable${NC}"
    ((ERRORS++))
fi

if [ -f "scripts/prepare-crates-publish.sh" ] && [ -x "scripts/prepare-crates-publish.sh" ]; then
    echo -e "${GREEN}✓ prepare-crates-publish.sh (executable)${NC}"
else
    echo -e "${RED}❌ prepare-crates-publish.sh missing or not executable${NC}"
    ((ERRORS++))
fi
echo ""

# Check documentation
echo -e "${BLUE}Checking documentation...${NC}"
if [ -f "PUBLISHING.md" ]; then
    echo -e "${GREEN}✓ PUBLISHING.md exists${NC}"
else
    echo -e "${YELLOW}⚠ PUBLISHING.md not found${NC}"
    ((WARNINGS++))
fi

if [ -f "CHANGELOG.md" ]; then
    echo -e "${GREEN}✓ CHANGELOG.md exists${NC}"
else
    echo -e "${YELLOW}⚠ CHANGELOG.md not found${NC}"
    ((WARNINGS++))
fi
echo ""

# Summary
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Summary${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed!${NC}"
    echo -e "${GREEN}   Ready to publish packages${NC}"
    echo ""
    echo -e "Next steps:"
    echo -e "  1. DRY_RUN=true ./scripts/publish-crates.sh"
    echo -e "  2. DRY_RUN=true ./scripts/publish-npm.sh"
    echo -e "  3. DRY_RUN=false ./scripts/publish-crates.sh"
    echo -e "  4. DRY_RUN=false ./scripts/publish-npm.sh"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ $WARNINGS warnings${NC}"
    echo -e "${YELLOW}   You can proceed but should address warnings${NC}"
    exit 0
else
    echo -e "${RED}❌ $ERRORS errors, $WARNINGS warnings${NC}"
    echo -e "${RED}   Fix errors before publishing${NC}"
    exit 1
fi
