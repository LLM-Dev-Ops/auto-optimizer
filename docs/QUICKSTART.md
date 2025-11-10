# Quick Start Guide

Get started with LLM Auto Optimizer in 5 minutes.

## Prerequisites

- **Rust 1.75+** - [Install](https://rustup.rs/)
- **Docker & Docker Compose** - [Install](https://docs.docker.com/get-docker/)
- **PostgreSQL 15+** (optional, can use Docker)
- **Redis** (optional, can use Docker)

## 1. Clone and Build

```bash
git clone https://github.com/globalbusinessadvisors/llm-auto-optimizer.git
cd llm-auto-optimizer

# Build the project
cargo build --release
```

## 2. Start Dependencies

```bash
# Start PostgreSQL, Redis, and Kafka
docker-compose up -d

# Wait for services to be ready
sleep 10
```

## 3. Configure

```bash
# Copy example configuration
cp config.example.yaml config.yaml

# Edit configuration (optional)
# Set your database URL, Kafka brokers, etc.
```

## 4. Run the Service

```bash
# Start the optimizer service
cargo run --release --bin llm-optimizer-service

# Or use the pre-built binary
./target/release/llm-optimizer-service
```

## 5. Verify Installation

```bash
# Check health endpoint
curl http://localhost:8080/health

# Expected response:
# {"status":"healthy","version":"0.1.0"}
```

## Next Steps

- **User Guide**: Read the [User Guide](user-guide.md) for detailed usage
- **API Documentation**: View [API Reference](api-reference.md)
- **Configuration**: See [Configuration Reference](configuration-reference.md)
- **Examples**: Check [examples/](../examples/) directory

## Common Commands

```bash
# Run tests
cargo test --all

# Check logs
docker-compose logs -f optimizer

# Stop services
docker-compose down

# Clean build
cargo clean && cargo build --release
```

## Troubleshooting

### Port Already in Use

```bash
# Change port in config.yaml
server:
  port: 9090  # Use different port
```

### Database Connection Failed

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Verify connection string
export DATABASE_URL="postgresql://user:pass@localhost:5432/optimizer"
```

### Build Errors

```bash
# Update Rust toolchain
rustup update stable

# Clear cache and rebuild
cargo clean
cargo build --release
```

## Quick Example

```rust
use llm_auto_optimizer::{Optimizer, Config};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load configuration
    let config = Config::from_file("config.yaml")?;

    // Initialize optimizer
    let optimizer = Optimizer::new(config).await?;

    // Start optimization loop
    optimizer.run().await?;

    Ok(())
}
```

## Support

- **Issues**: [GitHub Issues](https://github.com/globalbusinessadvisors/llm-auto-optimizer/issues)
- **Discussions**: [GitHub Discussions](https://github.com/globalbusinessadvisors/llm-auto-optimizer/discussions)
- **Documentation**: [Full Documentation](README.md)
