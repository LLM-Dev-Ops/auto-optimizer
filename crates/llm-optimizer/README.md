# LLM Auto Optimizer - Main Service Binary

Production-ready main service binary with enterprise-grade quality for the LLM Auto Optimizer system.

## Overview

The `llm-optimizer` binary is a single executable that orchestrates all components of the LLM Auto Optimizer system, including:

- **Collector Service**: Feedback collection with OpenTelemetry and Kafka
- **Processor Service**: Stream processing, analysis, and decision-making
- **REST API Service**: HTTP/1.1 and HTTP/2 REST endpoints
- **gRPC API Service**: gRPC endpoints with streaming support
- **Storage Service**: Multi-backend storage (PostgreSQL, Redis, Sled)
- **Integration Services**: External service integrations (Jira, Slack, GitHub, Anthropic)

## Features

### Enterprise-Grade Quality

- **Service Orchestration**: Automatic dependency resolution and ordered startup
- **Health Monitoring**: Continuous health checks with automatic recovery
- **Graceful Shutdown**: Clean shutdown of all services with configurable timeout
- **Signal Handling**: SIGTERM/SIGINT for shutdown, SIGHUP for config reload
- **Configuration Hot Reload**: Update configuration without service restart
- **Metrics Export**: Prometheus-compatible metrics on `/metrics` endpoint
- **Structured Logging**: JSON and pretty logging with configurable levels
- **Resource Monitoring**: CPU and memory usage tracking

### Service Management

- **Dependency Resolution**: Topological sorting ensures services start in correct order
- **Automatic Restart**: Failed services restart with exponential backoff
- **Circuit Breaker**: Prevents cascading failures
- **Health Checks**: Configurable health check intervals and thresholds
- **Graceful Degradation**: System continues operating even with some services degraded

## Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      LLM Auto Optimizer                          │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  REST API    │  │   gRPC API   │  │ Integrations │          │
│  │  Port 8080   │  │  Port 50051  │  │   Service    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                   │
│         └──────────────────┼──────────────────┘                  │
│                            │                                      │
│                   ┌────────▼────────┐                            │
│                   │   Processor     │                            │
│                   │   Service       │                            │
│                   └────────┬────────┘                            │
│                            │                                      │
│         ┌──────────────────┼──────────────────┐                 │
│         │                  │                  │                  │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐         │
│  │  Collector   │  │   Storage    │  │  Integrations│         │
│  │   Service    │  │   Service    │  │   Service    │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                   │
│  ┌──────────────────────────────────────────────────────┐      │
│  │            Service Manager & Orchestrator             │      │
│  │  - Dependency Resolution   - Health Monitoring        │      │
│  │  - Lifecycle Management    - Auto Recovery            │      │
│  │  - Signal Handling         - Metrics Aggregation      │      │
│  └──────────────────────────────────────────────────────┘      │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Service Dependencies

```
Storage Service (no dependencies)
    ↓
Collector Service (no dependencies)
    ↓
Integrations Service (no dependencies)
    ↓
Processor Service (depends on: collector, storage)
    ↓
REST API (depends on: processor, storage)
    ↓
gRPC API (depends on: processor, storage)
```

### Component Breakdown

#### 1. Service Manager

The Service Manager orchestrates all services with:

- **Dependency Resolution**: Uses topological sort (Kahn's algorithm) to determine startup order
- **Lifecycle Management**: Start, stop, restart services with proper error handling
- **Health Monitoring**: Periodic health checks with configurable intervals
- **Auto Recovery**: Automatic restart with exponential backoff on failure

#### 2. Health Monitor

Tracks health of all services:

- **Health Checks**: Periodic checks with configurable intervals
- **Failure Tracking**: Consecutive failures and total failure counts
- **Recovery Logic**: Automatic recovery attempts with backoff
- **Health API**: REST endpoint for health status queries

#### 3. Metrics Aggregator

Prometheus-compatible metrics:

- **Service Metrics**: Status, health, uptime per service
- **Request Metrics**: Total requests, duration histograms
- **Resource Metrics**: CPU usage, memory usage
- **Connection Metrics**: Active connections per service

#### 4. Signal Handler

Unix signal handling:

- **SIGTERM/SIGINT**: Graceful shutdown
- **SIGHUP**: Configuration reload
- **Graceful Shutdown**: Configurable timeout for clean shutdown

## Installation

### From Source

```bash
# Clone the repository
git clone https://github.com/llm-devops/llm-auto-optimizer
cd llm-auto-optimizer

# Build the binary
cargo build --release -p llm-optimizer

# The binary will be at: target/release/llm-optimizer
```

### Using Cargo

```bash
cargo install --path crates/llm-optimizer
```

## Configuration

### Configuration File

Create a configuration file (TOML or YAML):

```toml
# config.toml
[service]
name = "llm-optimizer"
environment = "production"
host = "0.0.0.0"

[collector]
enabled = true
kafka_brokers = ["localhost:9092"]
kafka_topic = "llm-feedback"

[processor]
enabled = true
worker_threads = 4

[rest_api]
enabled = true
port = 8080

[grpc_api]
enabled = true
port = 50051

[storage]
postgres_url = "postgres://localhost:5432/llm_optimizer"
redis_url = "redis://localhost:6379"
sled_path = "./data/sled"

[observability]
log_level = "info"
json_logging = true
metrics_port = 9090
```

See `config.toml.example` for all available options.

### Environment Variables

Override configuration using environment variables with `LLM_OPTIMIZER_` prefix:

```bash
export LLM_OPTIMIZER__SERVICE__NAME="my-optimizer"
export LLM_OPTIMIZER__REST_API__PORT="8888"
export LLM_OPTIMIZER__OBSERVABILITY__LOG_LEVEL="debug"
```

Note: Use double underscores (`__`) to separate nested keys.

## Usage

### Basic Usage

```bash
# Start with default configuration
llm-optimizer

# Start with custom configuration file
llm-optimizer --config config.toml

# Override log level
llm-optimizer --config config.toml --log-level debug

# Enable JSON logging
llm-optimizer --config config.toml --json-logs
```

### Validation

```bash
# Validate configuration without starting
llm-optimizer --config config.toml --validate-config

# Print default configuration
llm-optimizer --print-default-config > default-config.toml
```

### Command Line Options

```
Options:
  -c, --config <FILE>      Path to configuration file
  -l, --log-level <LEVEL>  Override log level (trace, debug, info, warn, error)
      --json-logs          Enable JSON logging
      --validate-config    Validate configuration and exit
      --print-default-config Print default configuration and exit
  -h, --help              Print help
  -V, --version           Print version
```

## Service Endpoints

### REST API

- **Base URL**: `http://localhost:8080`
- **Health Check**: `GET /health`
- **Metrics**: `GET /metrics` (internal)
- **API Documentation**: `GET /docs` (OpenAPI/Swagger)

### gRPC API

- **Address**: `localhost:50051`
- **Protocol**: gRPC with Protocol Buffers
- **Services**: Optimization, Config, Metrics, Integrations, Health, Admin

### Metrics

- **Prometheus Metrics**: `http://localhost:9090/metrics`

## Startup Sequence

```
1. Parse command line arguments
2. Load and validate configuration
3. Initialize observability (logging, tracing)
4. Create shared state (config, metrics, health monitor)
5. Initialize signal handler
6. Create service manager
7. Register all services (in dependency order):
   a. Storage Service
   b. Collector Service
   c. Integrations Service
   d. Processor Service
   e. REST API Service
   f. gRPC API Service
8. Start all services (in dependency order)
9. Start resource monitoring
10. Start metrics HTTP server
11. Start health monitoring
12. Enter main event loop (wait for signals)
```

## Shutdown Sequence

```
1. Receive shutdown signal (SIGTERM, SIGINT, or Ctrl+C)
2. Log shutdown initiation
3. Stop all services (in reverse dependency order):
   a. gRPC API Service
   b. REST API Service
   c. Processor Service
   d. Integrations Service
   e. Collector Service
   f. Storage Service
4. Wait for graceful shutdown (with timeout)
5. Generate final health report
6. Exit cleanly
```

## Signal Handling

### SIGTERM / SIGINT (Graceful Shutdown)

```bash
# Send SIGTERM
kill -TERM <pid>

# Or use Ctrl+C
```

The service will:
1. Stop accepting new requests
2. Complete in-flight requests
3. Shutdown all services gracefully
4. Exit with status 0

### SIGHUP (Configuration Reload)

```bash
# Send SIGHUP
kill -HUP <pid>
```

The service will:
1. Reload configuration from file
2. Validate new configuration
3. Apply changes without restart (where possible)
4. Log reload status

## Health Monitoring

### Health Check Endpoint

```bash
curl http://localhost:8080/health
```

Response:

```json
{
  "status": "healthy",
  "uptime_secs": 3600,
  "services": {
    "storage": {
      "state": "Running",
      "healthy": true,
      "consecutive_failures": 0,
      "message": null,
      "metadata": {}
    },
    "processor": {
      "state": "Running",
      "healthy": true,
      "consecutive_failures": 0,
      "message": null,
      "metadata": {
        "events_processed": "1000",
        "windows_triggered": "50"
      }
    }
  }
}
```

### Health Status Values

- **healthy**: All services operational
- **degraded**: Some services experiencing issues but system operational
- **unhealthy**: Critical services failed

## Metrics

### Prometheus Metrics

```bash
curl http://localhost:9090/metrics
```

Available metrics:

- `service_status{service="..."}` - Service status (1=running, 0=stopped)
- `service_health{service="..."}` - Service health (1=healthy, 0=unhealthy)
- `service_uptime_seconds{service="..."}` - Service uptime
- `requests_total{operation="...",status="..."}` - Total requests
- `request_duration_seconds{operation="...",status="..."}` - Request duration histogram
- `active_connections{service="..."}` - Active connections
- `memory_usage_bytes` - Memory usage
- `cpu_usage_percent` - CPU usage

## Auto Recovery

The service manager automatically attempts to recover failed services:

1. **Detection**: Health check fails for a service
2. **Threshold**: Service marked unhealthy after N consecutive failures (default: 3)
3. **Recovery**: Automatic restart with exponential backoff
4. **Retry Limit**: Maximum recovery attempts (default: 3)
5. **Backoff**: Base delay of 1s, max delay of 60s

### Recovery Configuration

```toml
# In ServiceManagerConfig
health_check_interval = "30s"
max_restart_attempts = 3
restart_backoff_base = "1s"
restart_backoff_max = "60s"
```

## Production Deployment

### Systemd Service

Create `/etc/systemd/system/llm-optimizer.service`:

```ini
[Unit]
Description=LLM Auto Optimizer
After=network.target

[Service]
Type=simple
User=llm-optimizer
Group=llm-optimizer
WorkingDirectory=/opt/llm-optimizer
ExecStart=/usr/local/bin/llm-optimizer --config /etc/llm-optimizer/config.toml
Restart=always
RestartSec=10s
StandardOutput=journal
StandardError=journal

# Resource limits
LimitNOFILE=65536
LimitNPROC=32768

[Install]
WantedBy=multi-user.target
```

Start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable llm-optimizer
sudo systemctl start llm-optimizer
sudo systemctl status llm-optimizer
```

### Docker

```dockerfile
FROM rust:1.75 as builder
WORKDIR /app
COPY . .
RUN cargo build --release -p llm-optimizer

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/llm-optimizer /usr/local/bin/
COPY --from=builder /app/crates/llm-optimizer/config.toml.example /etc/llm-optimizer/config.toml
EXPOSE 8080 50051 9090
CMD ["llm-optimizer", "--config", "/etc/llm-optimizer/config.toml"]
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: llm-optimizer
spec:
  replicas: 3
  selector:
    matchLabels:
      app: llm-optimizer
  template:
    metadata:
      labels:
        app: llm-optimizer
    spec:
      containers:
      - name: llm-optimizer
        image: llm-optimizer:latest
        ports:
        - containerPort: 8080
          name: rest
        - containerPort: 50051
          name: grpc
        - containerPort: 9090
          name: metrics
        env:
        - name: LLM_OPTIMIZER__OBSERVABILITY__LOG_LEVEL
          value: "info"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
```

## Monitoring

### Prometheus Integration

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'llm-optimizer'
    static_configs:
      - targets: ['localhost:9090']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

### Grafana Dashboard

Import the included Grafana dashboard for monitoring:

- Service health and status
- Request rates and latencies
- Resource usage (CPU, memory)
- Error rates
- Active connections

## Troubleshooting

### Service Won't Start

Check logs:
```bash
# Systemd
sudo journalctl -u llm-optimizer -f

# Docker
docker logs -f llm-optimizer
```

Common issues:
- Configuration validation errors
- Port already in use
- Database connection failures
- Missing dependencies

### High Memory Usage

Monitor memory metrics:
```bash
curl http://localhost:9090/metrics | grep memory_usage_bytes
```

Adjust configuration:
- Reduce buffer sizes
- Decrease worker threads
- Enable memory limits

### Service Keeps Restarting

Check health status:
```bash
curl http://localhost:8080/health
```

Common causes:
- Database connectivity issues
- Kafka broker unavailable
- Configuration errors
- Resource exhaustion

## Development

### Building

```bash
cargo build -p llm-optimizer
```

### Testing

```bash
cargo test -p llm-optimizer
```

### Running Locally

```bash
# With default configuration
cargo run -p llm-optimizer

# With custom configuration
cargo run -p llm-optimizer -- --config dev-config.toml --log-level debug
```

## Contributing

See the main repository [CONTRIBUTING.md](../../CONTRIBUTING.md) for contribution guidelines.

## License

Apache License 2.0 - See [LICENSE](../../LICENSE) for details.
