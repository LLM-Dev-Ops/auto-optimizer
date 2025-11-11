# Publishing Guide

This document describes how to publish LLM Auto Optimizer packages to crates.io (Rust) and npm (TypeScript/JavaScript).

## Table of Contents

- [Prerequisites](#prerequisites)
- [Publishing Rust Crates](#publishing-rust-crates)
- [Publishing npm Packages](#publishing-npm-packages)
- [Version Management](#version-management)
- [CI/CD Publishing](#cicd-publishing)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### For Rust Crates (crates.io)

1. **Create an account** at [crates.io](https://crates.io/)
2. **Generate an API token**:
   - Go to https://crates.io/settings/tokens
   - Click "New Token"
   - Give it a name (e.g., "llm-auto-optimizer-publish")
   - Copy the token

3. **Login with cargo**:
   ```bash
   cargo login <your-token>
   ```

4. **Or set environment variable** (for CI/CD):
   ```bash
   export CARGO_REGISTRY_TOKEN=<your-token>
   ```

### For npm Packages

1. **Create an account** at [npmjs.com](https://www.npmjs.com/)
2. **Create an organization**:
   - Go to https://www.npmjs.com/org/create
   - Create org: `llm-auto-optimizer`

3. **Login with npm**:
   ```bash
   npm login
   ```

4. **Or set auth token** (for CI/CD):
   ```bash
   npm config set //registry.npmjs.org/:_authToken=$NPM_TOKEN
   ```

## Publishing Rust Crates

### Dry Run (Recommended First)

Always do a dry run first to catch any issues:

```bash
# Validate all crates without publishing
DRY_RUN=true ./scripts/publish-crates.sh
```

This will:
- Build all crates
- Run all tests
- Validate each crate can be published
- Check metadata and dependencies

### Publishing for Real

Once dry run succeeds, publish to crates.io:

```bash
# Publish all crates to crates.io
DRY_RUN=false ./scripts/publish-crates.sh
```

The script publishes crates in dependency order:
1. `llm-optimizer-types` - Core types
2. `llm-optimizer-config` - Configuration
3. `llm-optimizer-collector` - Data collection
4. `llm-optimizer-storage` - Storage layer
5. `llm-optimizer-processor` - Data processing
6. `llm-optimizer-analyzer` - Analysis
7. `llm-optimizer-decision` - Decision engine
8. `llm-optimizer-actuator` - Action execution
9. `llm-optimizer-integrations` - External integrations
10. `llm-optimizer-api` - Core API types
11. `llm-optimizer-api-rest` - REST API
12. `llm-optimizer-api-grpc` - gRPC API
13. `llm-optimizer-api-tests` - API tests
14. `llm-optimizer-cli` - CLI tool
15. `llm-optimizer` - Main binary

### Manual Publishing

To publish a single crate manually:

```bash
cd crates/types
cargo publish --dry-run  # Test first
cargo publish            # Publish for real
```

### Publishing Checklist

Before publishing:
- [ ] All tests pass: `cargo test --workspace`
- [ ] Code is formatted: `cargo fmt --all`
- [ ] No clippy warnings: `cargo clippy --workspace -- -D warnings`
- [ ] Documentation builds: `cargo doc --workspace --no-deps`
- [ ] CHANGELOG.md is updated
- [ ] Version numbers are bumped appropriately

## Publishing npm Packages

### Dry Run (Recommended First)

```bash
# Validate all packages without publishing
DRY_RUN=true ./scripts/publish-npm.sh
```

### Publishing for Real

```bash
# Publish all packages to npm
DRY_RUN=false ./scripts/publish-npm.sh
```

Current npm packages:
- `@llm-auto-optimizer/core` - Core library
- `@llm-auto-optimizer/github-integration` - GitHub integration

### Manual Publishing

To publish a single package manually:

```bash
cd src/integrations/github
npm install
npm run build
npm test
npm publish --dry-run  # Test first
npm publish            # Publish for real
```

### Publishing Checklist

Before publishing:
- [ ] All tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] Type checking passes: `npm run type-check`
- [ ] Linting passes: `npm run lint`
- [ ] CHANGELOG.md is updated
- [ ] Version numbers are bumped appropriately

## Version Management

### Semantic Versioning

We follow [Semantic Versioning](https://semver.org/) (SemVer):

- **MAJOR** (1.0.0): Breaking changes
- **MINOR** (0.1.0): New features, backward compatible
- **PATCH** (0.0.1): Bug fixes, backward compatible

### Bumping Versions

#### Rust Crates

Update version in `Cargo.toml`:
```toml
[workspace.package]
version = "0.2.0"  # Bump this
```

All crates inherit the workspace version.

#### npm Packages

Update version in each `package.json`:
```bash
# In package directory
npm version patch  # 0.1.0 -> 0.1.1
npm version minor  # 0.1.1 -> 0.2.0
npm version major  # 0.2.0 -> 1.0.0
```

### Pre-release Versions

For alpha/beta releases:

**Rust:**
```toml
version = "0.2.0-alpha.1"
```

**npm:**
```bash
npm version prerelease --preid=alpha
npm publish --tag alpha
```

## CI/CD Publishing

### GitHub Actions

Create `.github/workflows/publish.yml`:

```yaml
name: Publish

on:
  push:
    tags:
      - 'v*'

jobs:
  publish-crates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
      - name: Publish to crates.io
        env:
          CARGO_REGISTRY_TOKEN: ${{ secrets.CARGO_REGISTRY_TOKEN }}
        run: DRY_RUN=false ./scripts/publish-crates.sh

  publish-npm:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      - name: Publish to npm
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: DRY_RUN=false ./scripts/publish-npm.sh
```

### Required Secrets

Add these secrets to your GitHub repository:
- `CARGO_REGISTRY_TOKEN` - crates.io API token
- `NPM_TOKEN` - npm authentication token

### Triggering a Release

```bash
# Tag a new version
git tag -a v0.2.0 -m "Release v0.2.0"
git push origin v0.2.0

# GitHub Actions will automatically publish
```

## Troubleshooting

### Crates.io Issues

**Error: crate already exists**
- The version is already published
- Bump the version number and try again

**Error: failed to verify package tarball**
- Run `cargo package --list` to see what will be included
- Check `.gitignore` isn't excluding required files
- Add files to `Cargo.toml`: `include = ["src/**/*", "README.md"]`

**Error: dependency not found**
- Ensure dependencies are published first
- Wait 1-2 minutes for crates.io to index new crates
- The publish script handles this with `sleep` between publishes

**Error: documentation failed to build**
- Run `cargo doc` locally to see the error
- Fix any broken documentation links
- Ensure all doc tests pass: `cargo test --doc`

### npm Issues

**Error: package already exists**
- The version is already published
- Bump the version: `npm version patch`

**Error: 401 Unauthorized**
- Not logged in: `npm login`
- Wrong scope permissions: Check organization membership
- Token expired: Generate a new token

**Error: 403 Forbidden**
- Package name taken: Use scoped package `@llm-auto-optimizer/package-name`
- Organization access: Must be added to `@llm-auto-optimizer` org
- Wrong registry: Check `publishConfig.registry` in package.json

**Error: no such file or directory 'dist/'**
- Build the package first: `npm run build`
- Check `files` field in package.json includes dist
- Ensure build outputs to the right directory

### General Issues

**Tests failing**
- Run tests locally: `cargo test` or `npm test`
- Fix all failing tests before publishing
- Ensure CI is green before tagging a release

**Build failing**
- Run build locally: `cargo build` or `npm run build`
- Check for missing dependencies
- Ensure all feature flags are correct

**Version conflicts**
- Check all internal dependencies use correct versions
- Update workspace dependencies in root `Cargo.toml`
- For npm, ensure peer dependencies match

## Best Practices

1. **Always dry-run first** - Catch issues before publishing
2. **Test locally** - Run all tests and builds before publishing
3. **Update changelog** - Document what changed in each version
4. **Use CI/CD** - Automate publishing for consistency
5. **Tag releases** - Use git tags to mark release points
6. **Communicate** - Announce breaking changes clearly
7. **Monitor** - Check crates.io/npm for successful publishing
8. **Wait between publishes** - Allow time for indexing

## Resources

- [crates.io Publishing Guide](https://doc.rust-lang.org/cargo/reference/publishing.html)
- [npm Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [Semantic Versioning](https://semver.org/)
- [Cargo Book](https://doc.rust-lang.org/cargo/)
- [npm Documentation](https://docs.npmjs.com/)
