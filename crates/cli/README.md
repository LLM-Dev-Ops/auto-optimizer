# LLM Auto Optimizer CLI

Production-grade command-line interface for managing LLM Auto Optimizer.

## Features

- **Service Management**: Start, stop, restart, and monitor the optimizer service
- **Optimization Operations**: Create, deploy, and manage LLM optimizations
- **Configuration Management**: Manage system configuration with validation
- **Metrics & Analytics**: Query performance, cost, and quality metrics
- **Integration Management**: Add and manage external integrations
- **Admin Operations**: System statistics, cache management, and health checks
- **Multiple Output Formats**: Table, JSON, YAML, and CSV output
- **Interactive Mode**: User-friendly interactive interface
- **Shell Completions**: Auto-completion for bash, zsh, and fish
- **Beautiful Terminal UI**: Colored output, progress bars, and spinners

## Installation

### From Source

```bash
cargo install --path crates/cli
```

### From Crates.io (when published)

```bash
cargo install llm-optimizer-cli
```

## Quick Start

### 1. Initialize Configuration

```bash
llm-optimizer init --api-url http://localhost:8080
```

This creates a configuration file at `~/.config/llm-optimizer/config.yaml`.

### 2. Check System Health

```bash
llm-optimizer doctor
```

### 3. Create an Optimization

```bash
llm-optimizer optimize create \
  --services my-llm-service \
  --strategy cost-performance-scoring
```

### 4. View Metrics

```bash
llm-optimizer metrics performance
```

## Configuration

### Configuration File

The CLI looks for configuration in the following locations:
- `~/.config/llm-optimizer/config.yaml` (Linux/macOS)
- `%APPDATA%\llm-optimizer\config.yaml` (Windows)
- Path specified by `--config` flag

Example configuration:

```yaml
api_url: http://localhost:8080
grpc_endpoint: http://localhost:50051
api_key: your-api-key-here
timeout: 30
output_format: table
verbose: false
```

### Environment Variables

- `LLM_OPTIMIZER_API_URL`: API base URL
- `LLM_OPTIMIZER_API_KEY`: API authentication key

### CLI Flags

Global flags available for all commands:

- `--api-url <URL>`: Override API URL
- `--api-key <KEY>`: Override API key
- `--output <FORMAT>`: Set output format (table, json, yaml, csv)
- `--verbose`: Enable verbose logging
- `--config <FILE>`: Specify configuration file
- `--timeout <SECONDS>`: Request timeout

## Commands

### Service Management

Manage the LLM Auto Optimizer service.

#### Start Service

```bash
llm-optimizer service start
```

#### Stop Service

```bash
llm-optimizer service stop
```

#### Restart Service

```bash
llm-optimizer service restart
```

#### Get Service Status

```bash
llm-optimizer service status
```

#### View Logs

```bash
# Show last 100 lines
llm-optimizer service logs

# Show last N lines
llm-optimizer service logs -n 50

# Follow logs (stream)
llm-optimizer service logs --follow
```

### Optimization Operations

Create and manage LLM optimizations.

#### Create Optimization

```bash
# Basic creation
llm-optimizer optimize create \
  --services service1,service2 \
  --strategy cost-performance-scoring

# With dry run
llm-optimizer optimize create \
  --services my-service \
  --strategy aggressive-cost-reduction \
  --dry-run

# Interactive mode
llm-optimizer optimize create --interactive
```

Available strategies:
- `cost-performance-scoring`: Balanced cost and performance
- `quality-preserving`: Minimize cost while maintaining quality
- `aggressive-cost-reduction`: Maximum cost reduction
- `balanced`: Default balanced approach

#### List Optimizations

```bash
# List all
llm-optimizer optimize list

# Filter by status
llm-optimizer optimize list --status deployed

# Filter by strategy
llm-optimizer optimize list --strategy cost-performance-scoring

# Filter by service
llm-optimizer optimize list --service my-service

# Date range
llm-optimizer optimize list --from 2024-01-01 --to 2024-01-31

# JSON output
llm-optimizer optimize list --output json
```

#### Get Optimization Details

```bash
llm-optimizer optimize get <optimization-id>
```

#### Deploy Optimization

```bash
# Standard deployment
llm-optimizer optimize deploy <optimization-id>

# Gradual rollout (10%)
llm-optimizer optimize deploy <optimization-id> --gradual --percentage 10

# Skip confirmation
llm-optimizer optimize deploy <optimization-id> --yes
```

#### Rollback Optimization

```bash
# With interactive reason prompt
llm-optimizer optimize rollback <optimization-id>

# With reason provided
llm-optimizer optimize rollback <optimization-id> \
  --reason "Performance regression detected"

# Skip confirmation
llm-optimizer optimize rollback <optimization-id> --yes
```

#### Cancel Optimization

```bash
llm-optimizer optimize cancel <optimization-id>
```

### Configuration Management

Manage system configuration.

#### Get Configuration Value

```bash
llm-optimizer config get max_optimization_requests
```

#### Set Configuration Value

```bash
llm-optimizer config set max_optimization_requests '{"value": 100}'
```

#### List All Configurations

```bash
llm-optimizer config list
```

#### Validate Configuration

```bash
llm-optimizer config validate
```

#### Export Configuration

```bash
# Print to stdout
llm-optimizer config export

# Save to file
llm-optimizer config export --output config-backup.yaml
```

#### Import Configuration

```bash
llm-optimizer config import config.yaml
```

### Metrics & Analytics

Query metrics and view analytics.

#### Query Metrics

```bash
llm-optimizer metrics query \
  --metrics latency,cost,quality \
  --from 2024-01-01 \
  --to 2024-01-31 \
  --aggregation avg
```

#### Performance Metrics

```bash
# All services
llm-optimizer metrics performance

# Specific service
llm-optimizer metrics performance --service my-service

# Date range
llm-optimizer metrics performance --from 2024-01-01 --to 2024-01-31
```

Output includes:
- Average latency
- P50, P95, P99 latencies
- Throughput (requests/second)
- Error rate

#### Cost Analysis

```bash
llm-optimizer metrics cost

# With filters
llm-optimizer metrics cost --service my-service --from 2024-01-01
```

Output includes:
- Total cost
- Cost per request
- Cost breakdown by category

#### Quality Metrics

```bash
llm-optimizer metrics quality

# With filters
llm-optimizer metrics quality --service my-service
```

Output includes:
- Average quality score
- Quality distribution
- Total requests

#### Export Metrics

```bash
# Export as CSV
llm-optimizer metrics export --format csv --output metrics.csv

# Export as JSON
llm-optimizer metrics export --format json --output metrics.json

# Date range
llm-optimizer metrics export --format csv --from 2024-01-01 --to 2024-01-31
```

### Integration Management

Manage external integrations.

#### Add Integration

```bash
llm-optimizer integration add \
  --integration-type prometheus \
  --name "Production Prometheus" \
  --config '{"url": "http://prometheus:9090", "scrape_interval": "15s"}'
```

Supported integration types:
- `prometheus`: Prometheus monitoring
- `datadog`: Datadog monitoring
- `grafana`: Grafana dashboards
- `slack`: Slack notifications
- `pagerduty`: PagerDuty alerting
- `webhook`: Custom webhooks

#### List Integrations

```bash
llm-optimizer integration list
```

#### Test Integration

```bash
llm-optimizer integration test <integration-id>
```

#### Remove Integration

```bash
# With confirmation
llm-optimizer integration remove <integration-id>

# Skip confirmation
llm-optimizer integration remove <integration-id> --yes
```

### Admin Operations

Administrative operations and system management.

#### System Statistics

```bash
llm-optimizer admin stats
```

Shows:
- System uptime
- Total and active optimizations
- Cost savings
- Memory and CPU usage

#### Flush Cache

```bash
# With confirmation
llm-optimizer admin cache

# Skip confirmation
llm-optimizer admin cache --yes
```

#### Detailed Health Check

```bash
llm-optimizer admin health
```

Shows health status of all system components.

#### Version Information

```bash
llm-optimizer admin version
```

Shows:
- Version number
- Build date
- Git commit hash
- Rust version

### Utility Commands

Utility and helper commands.

#### Initialize Configuration

```bash
# Basic initialization
llm-optimizer init

# With API URL
llm-optimizer init --api-url http://production.example.com:8080

# With API key
llm-optimizer init --api-key your-api-key

# Force overwrite
llm-optimizer init --force
```

#### Generate Shell Completions

```bash
# Bash
llm-optimizer completions bash > ~/.local/share/bash-completion/completions/llm-optimizer

# Zsh
llm-optimizer completions zsh > ~/.zfunc/_llm-optimizer

# Fish
llm-optimizer completions fish > ~/.config/fish/completions/llm-optimizer.fish
```

#### System Diagnostics

```bash
llm-optimizer doctor
```

Checks:
- Configuration file existence
- API connectivity
- Service status
- Component health

#### Interactive Mode

```bash
llm-optimizer interactive
```

Launches an interactive menu-driven interface.

## Output Formats

The CLI supports multiple output formats:

### Table (Default)

```bash
llm-optimizer optimize list
```

Beautiful ASCII tables with colored output.

### JSON

```bash
llm-optimizer optimize list --output json
```

Pretty-printed JSON for programmatic processing.

### YAML

```bash
llm-optimizer optimize list --output yaml
```

YAML format for configuration files.

### CSV

```bash
llm-optimizer metrics export --format csv
```

CSV format for spreadsheet applications.

## Examples

### Example 1: Create and Deploy Optimization

```bash
# Create optimization
OPT_ID=$(llm-optimizer optimize create \
  --services production-gpt4 \
  --strategy cost-performance-scoring \
  --output json | jq -r '.id')

# Wait for analysis
sleep 5

# Review details
llm-optimizer optimize get $OPT_ID

# Deploy with gradual rollout
llm-optimizer optimize deploy $OPT_ID --gradual --percentage 10

# Monitor performance
llm-optimizer metrics performance --service production-gpt4
```

### Example 2: Cost Analysis Pipeline

```bash
# Export last month's metrics
llm-optimizer metrics export \
  --format csv \
  --from $(date -d '1 month ago' +%Y-%m-%d) \
  --to $(date +%Y-%m-%d) \
  --output monthly-metrics.csv

# Get cost breakdown
llm-optimizer metrics cost --output json > cost-analysis.json

# View summary
llm-optimizer admin stats
```

### Example 3: Integration Setup

```bash
# Add Prometheus integration
llm-optimizer integration add \
  --integration-type prometheus \
  --name "Production Metrics" \
  --config '{"url": "http://prometheus:9090"}'

# Test connection
llm-optimizer integration test <integration-id>

# Add Slack notifications
llm-optimizer integration add \
  --integration-type slack \
  --name "Ops Channel" \
  --config '{"webhook_url": "https://hooks.slack.com/..."}'
```

### Example 4: Monitoring Workflow

```bash
#!/bin/bash
# monitoring-check.sh

# Check system health
llm-optimizer admin health

# Get performance metrics
llm-optimizer metrics performance | grep "Error Rate"

# List active optimizations
ACTIVE=$(llm-optimizer optimize list --status deployed --output json | jq 'length')
echo "Active optimizations: $ACTIVE"

# Check for issues
if [ $ACTIVE -eq 0 ]; then
  echo "Warning: No active optimizations"
fi
```

## Advanced Usage

### Scripting with JSON Output

```bash
# Get all optimizations with cost savings > $100
llm-optimizer optimize list --output json | \
  jq '.[] | select(.actual_impact.cost_reduction_pct > 10)'

# Find underperforming optimizations
llm-optimizer optimize list --output json | \
  jq '.[] | select(.actual_impact.quality_delta_pct < -5)'
```

### CI/CD Integration

```bash
# .gitlab-ci.yml
optimize:
  script:
    - llm-optimizer optimize create --services $SERVICE_NAME --dry-run
    - llm-optimizer admin health || exit 1
    - llm-optimizer metrics cost --output json > cost-report.json
  artifacts:
    reports:
      metrics: cost-report.json
```

### Custom Alerting

```bash
#!/bin/bash
# alert-on-errors.sh

ERROR_RATE=$(llm-optimizer metrics performance --output json | \
  jq -r '.error_rate')

if (( $(echo "$ERROR_RATE > 0.05" | bc -l) )); then
  llm-optimizer optimize rollback $OPTIMIZATION_ID \
    --reason "Error rate exceeded 5%" \
    --yes
fi
```

## Troubleshooting

### Connection Issues

```bash
# Check API connectivity
curl http://localhost:8080/health

# Verify configuration
llm-optimizer doctor

# Test with verbose logging
llm-optimizer --verbose admin health
```

### Authentication Errors

```bash
# Set API key
export LLM_OPTIMIZER_API_KEY=your-key

# Or update config
llm-optimizer config set api_key '"your-key"'
```

### Performance Issues

```bash
# Increase timeout
llm-optimizer --timeout 60 optimize list

# Check system resources
llm-optimizer admin stats
```

## Development

### Building from Source

```bash
# Build debug version
cargo build

# Build release version
cargo build --release

# Run tests
cargo test

# Install locally
cargo install --path .
```

### Running Tests

```bash
# Unit tests
cargo test --lib

# Integration tests
cargo test --test '*'

# With output
cargo test -- --nocapture
```

## Support

- **Documentation**: https://docs.llmdevops.dev
- **GitHub Issues**: https://github.com/llm-devops/llm-auto-optimizer/issues
- **Discussions**: https://github.com/llm-devops/llm-auto-optimizer/discussions

## License

Licensed under the Apache License, Version 2.0. See LICENSE file for details.

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.
