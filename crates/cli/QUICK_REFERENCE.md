# LLM Auto Optimizer CLI - Quick Reference

## Installation

```bash
cargo install --path crates/cli
llm-optimizer init
```

## Common Commands

### Service Management
```bash
llm-optimizer service start                    # Start service
llm-optimizer service stop                     # Stop service
llm-optimizer service status                   # Check status
llm-optimizer service logs -n 100 --follow     # Follow logs
```

### Optimization
```bash
# Create
llm-optimizer optimize create -s service1,service2 -S cost-performance-scoring
llm-optimizer optimize create --interactive    # Interactive mode

# List & View
llm-optimizer optimize list                    # All optimizations
llm-optimizer optimize list --status deployed  # Filter by status
llm-optimizer optimize get <id>                # Get details

# Deploy & Manage
llm-optimizer optimize deploy <id> --gradual --percentage 10
llm-optimizer optimize rollback <id> --reason "Performance issue"
llm-optimizer optimize cancel <id>
```

### Metrics
```bash
# Performance
llm-optimizer metrics performance
llm-optimizer metrics performance --service my-service

# Cost Analysis
llm-optimizer metrics cost
llm-optimizer metrics cost --from 2024-01-01 --to 2024-01-31

# Quality
llm-optimizer metrics quality

# Export
llm-optimizer metrics export --format csv --output metrics.csv
```

### Configuration
```bash
llm-optimizer config list                      # List all configs
llm-optimizer config get max_requests          # Get value
llm-optimizer config set max_requests '100'    # Set value
llm-optimizer config validate                  # Validate
llm-optimizer config export -o backup.yaml     # Backup
```

### Integrations
```bash
# Add integration
llm-optimizer integration add \
  --integration-type prometheus \
  --name "Production" \
  --config '{"url": "http://prometheus:9090"}'

llm-optimizer integration list                 # List all
llm-optimizer integration test <id>            # Test connection
llm-optimizer integration remove <id>          # Remove
```

### Admin
```bash
llm-optimizer admin stats                      # System stats
llm-optimizer admin health                     # Health check
llm-optimizer admin version                    # Version info
llm-optimizer admin cache --yes                # Flush cache
```

### Utilities
```bash
llm-optimizer init                             # Initialize config
llm-optimizer doctor                           # Diagnostics
llm-optimizer interactive                      # Interactive mode
llm-optimizer completions bash > ~/.bash_completion.d/llm-optimizer
```

## Global Flags

```bash
--api-url <URL>         # Override API URL
--api-key <KEY>         # Override API key
--output <FORMAT>       # table, json, yaml, csv
--verbose               # Verbose logging
--config <FILE>         # Config file path
--timeout <SECONDS>     # Request timeout
```

## Output Formats

```bash
# Table (default)
llm-optimizer optimize list

# JSON
llm-optimizer optimize list --output json

# YAML
llm-optimizer optimize list --output yaml

# CSV
llm-optimizer optimize list --output csv
```

## Environment Variables

```bash
export LLM_OPTIMIZER_API_URL=http://localhost:8080
export LLM_OPTIMIZER_API_KEY=your-api-key
```

## Configuration File

Location: `~/.config/llm-optimizer/config.yaml`

```yaml
api_url: http://localhost:8080
api_key: your-api-key
timeout: 30
output_format: table
verbose: false
```

## Common Workflows

### Create and Deploy Optimization
```bash
OPT_ID=$(llm-optimizer optimize create \
  -s production-service \
  -S cost-performance-scoring \
  --output json | jq -r '.id')

llm-optimizer optimize get $OPT_ID
llm-optimizer optimize deploy $OPT_ID --gradual --percentage 10
llm-optimizer metrics performance -s production-service
```

### Monitor Costs
```bash
llm-optimizer metrics cost --output json | jq '.total_cost'
llm-optimizer metrics cost --from $(date -d '1 month ago' +%Y-%m-%d)
llm-optimizer metrics export --format csv --output monthly-costs.csv
```

### Troubleshoot Issues
```bash
llm-optimizer doctor                           # Run diagnostics
llm-optimizer admin health                     # Check health
llm-optimizer service logs --follow            # View logs
llm-optimizer --verbose admin stats            # Verbose output
```

### Integration Setup
```bash
# Add Prometheus
llm-optimizer integration add \
  -t prometheus \
  -n "Production Metrics" \
  -c '{"url": "http://prometheus:9090"}'

# Test it
llm-optimizer integration test <id>

# Add Slack
llm-optimizer integration add \
  -t slack \
  -n "Ops Channel" \
  -c '{"webhook_url": "https://hooks.slack.com/..."}'
```

## Optimization Strategies

- `cost-performance-scoring` - Balanced (default)
- `quality-preserving` - Maintain quality, reduce cost
- `aggressive-cost-reduction` - Maximum savings
- `balanced` - Balanced approach

## Tips & Tricks

### Scripting with JSON
```bash
# Get optimization IDs
llm-optimizer optimize list --output json | jq -r '.[].id'

# Filter by cost savings
llm-optimizer optimize list --output json | \
  jq '.[] | select(.expected_impact.cost_reduction_pct > 10)'

# Count active optimizations
llm-optimizer optimize list --status deployed --output json | jq 'length'
```

### Shell Aliases
```bash
# Add to ~/.bashrc or ~/.zshrc
alias llo='llm-optimizer'
alias llo-create='llm-optimizer optimize create'
alias llo-list='llm-optimizer optimize list'
alias llo-stats='llm-optimizer admin stats'
```

### Watch Mode (with watch command)
```bash
# Monitor service status
watch -n 5 llm-optimizer service status

# Monitor metrics
watch -n 10 'llm-optimizer metrics performance | grep "Avg Latency"'
```

### CI/CD Integration
```bash
# In your pipeline
llm-optimizer doctor || exit 1
llm-optimizer optimize create --dry-run -s $SERVICE
llm-optimizer metrics export --format json > metrics.json
```

## Error Handling

### Connection Errors
```bash
# Check connectivity
curl http://localhost:8080/health

# Use verbose mode
llm-optimizer --verbose service status

# Increase timeout
llm-optimizer --timeout 60 optimize list
```

### Authentication Errors
```bash
# Set API key
export LLM_OPTIMIZER_API_KEY=your-key

# Or in config
llm-optimizer config set api_key '"your-key"'
```

### Configuration Errors
```bash
# Validate config
llm-optimizer config validate

# Reinitialize
llm-optimizer init --force
```

## Help

```bash
llm-optimizer --help                           # Main help
llm-optimizer optimize --help                  # Command help
llm-optimizer optimize create --help           # Subcommand help
```

## Resources

- Full Documentation: `crates/cli/README.md`
- Implementation Details: `crates/cli/IMPLEMENTATION_SUMMARY.md`
- GitHub: https://github.com/llm-devops/llm-auto-optimizer
