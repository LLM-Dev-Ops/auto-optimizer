# Publishing Scripts

This directory contains scripts for publishing LLM Auto Optimizer packages to crates.io and npm.

## Quick Start

### 1. Prepare Crates

Add descriptions and metadata to all Cargo.toml files:

```bash
./scripts/prepare-crates-publish.sh
```

### 2. Dry-Run Test (Recommended)

Test publishing without actually publishing:

```bash
# Test Rust crates
DRY_RUN=true ./scripts/publish-crates.sh

# Test npm packages
DRY_RUN=true ./scripts/publish-npm.sh
```

### 3. Publish for Real

Once dry-run succeeds, publish to registries:

```bash
# Publish Rust crates
DRY_RUN=false ./scripts/publish-crates.sh

# Publish npm packages
DRY_RUN=false ./scripts/publish-npm.sh
```

## Available Scripts

### prepare-crates-publish.sh

Adds required metadata (descriptions, keywords, etc.) to all Cargo.toml files.

**Usage:**
```bash
./scripts/prepare-crates-publish.sh
```

**What it does:**
- Adds description to each crate
- Ensures all required fields are present
- Validates Cargo.toml syntax

### publish-crates.sh

Publishes all Rust crates to crates.io in dependency order.

**Usage:**
```bash
# Dry run (default)
DRY_RUN=true ./scripts/publish-crates.sh

# Publish for real
DRY_RUN=false ./scripts/publish-crates.sh
```

**Features:**
- Builds all crates first
- Runs all tests
- Publishes in dependency order
- Waits between publishes for indexing
- Color-coded output
- Summary report

**Publishing order:**
1. types
2. config
3. collector
4. storage
5. processor
6. analyzer
7. decision
8. actuator
9. integrations
10. api
11. api-rest
12. api-grpc
13. api-tests
14. cli
15. llm-optimizer

### publish-npm.sh

Publishes all npm packages to npm registry.

**Usage:**
```bash
# Dry run (default)
DRY_RUN=true ./scripts/publish-npm.sh

# Publish for real
DRY_RUN=false ./scripts/publish-npm.sh
```

**Features:**
- Installs dependencies
- Runs builds and tests
- Validates before publishing
- Color-coded output
- Summary report

**Packages:**
- `@llm-auto-optimizer/core` - Core library
- `@llm-auto-optimizer/github-integration` - GitHub integration

## Prerequisites

### For crates.io

1. Create account at https://crates.io/
2. Generate API token at https://crates.io/settings/tokens
3. Login: `cargo login <your-token>`

Or set environment variable:
```bash
export CARGO_REGISTRY_TOKEN=<your-token>
```

### For npm

1. Create account at https://www.npmjs.com/
2. Create organization: `llm-auto-optimizer`
3. Login: `npm login`

Or set environment variable:
```bash
export NPM_TOKEN=<your-token>
npm config set //registry.npmjs.org/:_authToken=$NPM_TOKEN
```

## Environment Variables

- `DRY_RUN` - Set to `false` to actually publish (default: `true`)
- `CARGO_REGISTRY_TOKEN` - crates.io authentication token
- `NPM_TOKEN` - npm authentication token

## Troubleshooting

### Build fails

```bash
# Check specific crate
cd crates/types
cargo build

# Check all crates
cargo build --workspace
```

### Tests fail

```bash
# Run all tests
cargo test --workspace

# Run specific crate tests
cd crates/types
cargo test
```

### Publishing fails

1. Check you're logged in: `cargo login` or `npm whoami`
2. Check version isn't already published
3. Check all dependencies are available
4. Wait a minute and try again (crates.io indexing)

## CI/CD Integration

These scripts can be used in GitHub Actions or other CI/CD systems.

**Example GitHub Actions:**

```yaml
- name: Publish to crates.io
  env:
    CARGO_REGISTRY_TOKEN: ${{ secrets.CARGO_REGISTRY_TOKEN }}
  run: DRY_RUN=false ./scripts/publish-crates.sh

- name: Publish to npm
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
  run: DRY_RUN=false ./scripts/publish-npm.sh
```

## See Also

- [PUBLISHING.md](../PUBLISHING.md) - Complete publishing guide
- [CHANGELOG.md](../CHANGELOG.md) - Version history
- [README.md](../README.md) - Project documentation
