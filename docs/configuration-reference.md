# Configuration Reference

Complete reference for all configuration options.

## Configuration File

Configuration file: `config.yaml`

## Server Configuration

```yaml
server:
  host: 0.0.0.0              # Bind address (string)
  port: 8080                  # Port number (1-65535)
  timeout_ms: 30000           # Request timeout in milliseconds
  max_connections: 1000       # Maximum concurrent connections
  tls:
    enabled: false            # Enable TLS/SSL
    cert_path: /path/to/cert.pem
    key_path: /path/to/key.pem
```

## Database Configuration

```yaml
database:
  # PostgreSQL connection
  url: postgresql://user:pass@localhost:5432/optimizer
  max_connections: 20         # Connection pool size
  min_connections: 5          # Minimum pool size
  timeout_sec: 5              # Connection timeout
  idle_timeout_sec: 600       # Idle connection timeout
  max_lifetime_sec: 1800      # Max connection lifetime

  # Migrations
  auto_migrate: true          # Run migrations on startup
  migration_path: ./migrations
```

## Redis Configuration

```yaml
redis:
  # Single instance
  url: redis://localhost:6379

  # Or cluster mode
  cluster:
    enabled: true
    nodes:
      - redis1:6379
      - redis2:6379
      - redis3:6379

  # Connection settings
  max_connections: 10
  timeout_sec: 5
  retry_attempts: 3

  # Cache settings
  default_ttl_sec: 3600
  max_value_size_mb: 10
```

## Kafka Configuration

```yaml
kafka:
  brokers:
    - kafka1:9092
    - kafka2:9092

  # Consumer settings
  consumer:
    group_id: optimizer-group
    topics:
      - llm-feedback
      - llm-metrics
    auto_offset_reset: earliest  # or latest
    session_timeout_ms: 10000
    max_poll_records: 500

  # Producer settings
  producer:
    acks: all                     # all, 1, or 0
    compression_type: snappy      # none, gzip, snappy, lz4, zstd
    batch_size: 16384
    linger_ms: 10

  # Security (optional)
  security:
    protocol: SASL_SSL
    sasl_mechanism: PLAIN
    sasl_username: user
    sasl_password: ${KAFKA_PASSWORD}
```

## Optimization Configuration

```yaml
optimization:
  enabled: true
  interval_sec: 300             # Run every 5 minutes

  # Quality thresholds
  quality_threshold: 0.95       # Minimum quality score (0.0-1.0)
  enforce_quality: true          # Reject if below threshold

  # Strategies to enable
  strategies:
    - model_selection
    - prompt_optimization
    - cost_reduction
    - rate_limiting
    - batching

  # Model selection strategy
  model_selection:
    enabled: true
    models:
      - name: gpt-4
        cost_per_1k: 0.03
        latency_ms: 500
      - name: gpt-3.5-turbo
        cost_per_1k: 0.002
        latency_ms: 200
      - name: claude-3-opus
        cost_per_1k: 0.015
        latency_ms: 400
    selection_criteria:
      - cost: 0.4               # Weight for cost
      - latency: 0.3            # Weight for latency
      - quality: 0.3            # Weight for quality

  # Prompt optimization strategy
  prompt_optimization:
    enabled: true
    test_duration_sec: 3600     # A/B test duration
    significance_level: 0.05    # Statistical significance
    min_samples: 100            # Minimum samples per variant
    metrics:
      - user_satisfaction
      - response_quality
      - task_completion

  # Cost reduction strategy
  cost_reduction:
    enabled: true
    target_reduction: 0.40      # Target 40% reduction
    quality_threshold: 0.95     # Maintain 95% quality
    optimization_interval_sec: 600

  # Rate limiting strategy
  rate_limiting:
    enabled: true
    algorithm: token_bucket     # token_bucket or leaky_bucket
    default_rate: 100           # Requests per second
    burst_size: 200

  # Batching strategy
  batching:
    enabled: true
    max_batch_size: 10
    max_wait_ms: 100
    min_batch_size: 2
```

## Deployment Configuration

```yaml
deployment:
  # Canary deployment settings
  canary:
    enabled: true
    stages:
      - percentage: 10
        duration_sec: 300       # 5 minutes at 10%
      - percentage: 50
        duration_sec: 600       # 10 minutes at 50%
      - percentage: 100         # Full rollout

    # Health check thresholds
    health_check:
      enabled: true
      interval_sec: 30
      error_rate_threshold: 0.01      # 1% error rate
      latency_p95_threshold_ms: 1000  # 1 second p95
      quality_threshold: 0.95          # 95% quality

    # Automatic rollback
    auto_rollback:
      enabled: true
      consecutive_failures: 3   # Rollback after 3 failed checks
      rollback_timeout_sec: 300

  # Environment
  environment: production        # production, staging, development
  region: us-east-1

  # Resource limits
  resources:
    cpu_limit: 2.0              # CPU cores
    memory_limit_mb: 2048
    disk_limit_mb: 10240
```

## Observability Configuration

```yaml
observability:
  # Logging
  logging:
    level: info                 # trace, debug, info, warn, error
    format: json                # json or text
    output: stdout              # stdout, stderr, or file path

  # Metrics
  metrics:
    enabled: true
    endpoint: /metrics
    export_interval_sec: 15

    # Prometheus
    prometheus:
      enabled: true
      push_gateway: http://prometheus:9091
      job_name: llm-optimizer

  # Tracing
  tracing:
    enabled: true
    sample_rate: 0.1            # Sample 10% of traces

    # OpenTelemetry
    otlp:
      endpoint: http://otel-collector:4317
      protocol: grpc            # grpc or http

    # Jaeger (alternative)
    jaeger:
      enabled: false
      agent_host: jaeger
      agent_port: 6831

  # Health checks
  health:
    enabled: true
    endpoints:
      liveness: /health/live
      readiness: /health/ready
    check_interval_sec: 10
```

## Security Configuration

```yaml
security:
  # Authentication
  auth:
    enabled: true
    method: jwt                 # jwt or api_key

    # JWT settings
    jwt:
      secret: ${JWT_SECRET}     # From environment variable
      expiry_sec: 3600          # 1 hour
      algorithm: HS256          # HS256, HS384, HS512, RS256, etc.

    # API key settings
    api_key:
      header: X-API-Key
      keys_file: /path/to/keys.yaml

  # Authorization (RBAC)
  authorization:
    enabled: true
    default_role: user
    roles:
      admin:
        permissions: ["*"]
      user:
        permissions: ["read:optimize", "write:optimize"]
      viewer:
        permissions: ["read:*"]

  # Rate limiting
  rate_limiting:
    enabled: true
    per_ip: 100                 # Requests per minute per IP
    per_user: 1000              # Requests per hour per user
    burst: 200

  # CORS
  cors:
    enabled: true
    allowed_origins:
      - https://app.example.com
      - http://localhost:3000
    allowed_methods:
      - GET
      - POST
      - PUT
      - DELETE
    allowed_headers:
      - Authorization
      - Content-Type
    max_age_sec: 3600
```

## Integration Configuration

```yaml
integrations:
  # GitHub
  github:
    enabled: false
    token: ${GITHUB_TOKEN}
    org: your-org
    repo: your-repo

  # Slack
  slack:
    enabled: false
    webhook_url: ${SLACK_WEBHOOK_URL}
    channel: #llm-optimizer

  # Jira
  jira:
    enabled: false
    url: https://your-org.atlassian.net
    username: ${JIRA_USERNAME}
    api_token: ${JIRA_API_TOKEN}
    project_key: LLM

  # PagerDuty
  pagerduty:
    enabled: false
    integration_key: ${PAGERDUTY_KEY}

  # Custom webhooks
  webhooks:
    - name: cost_alerts
      url: https://your-service.com/webhook
      events:
        - cost_threshold_exceeded
        - optimization_failed
      secret: ${WEBHOOK_SECRET}
      retry:
        max_attempts: 5
        backoff_multiplier: 2
```

## Feature Flags

```yaml
features:
  # Experimental features
  experimental:
    ml_models: false            # Enable ML-based optimization
    advanced_caching: false     # Enable advanced caching
    distributed_tracing: true

  # Beta features
  beta:
    web_dashboard: false
    api_v2: false

  # Debug features (development only)
  debug:
    verbose_logging: false
    profile_performance: false
    mock_external_services: false
```

## Environment Variables

All configuration can be overridden with environment variables:

```bash
# Server
export SERVER_HOST=0.0.0.0
export SERVER_PORT=8080

# Database
export DATABASE_URL=postgresql://...
export DATABASE_MAX_CONNECTIONS=20

# Redis
export REDIS_URL=redis://...

# Kafka
export KAFKA_BROKERS=kafka1:9092,kafka2:9092

# Secrets
export JWT_SECRET=your-secret
export GITHUB_TOKEN=ghp_...
export SLACK_WEBHOOK_URL=https://...

# Feature flags
export FEATURES_EXPERIMENTAL_ML_MODELS=true

# Logging
export RUST_LOG=debug
export LOG_FORMAT=json
```

## Configuration Validation

Validate configuration before starting:

```bash
llm-optimizer config validate config.yaml
```

Export merged configuration (with env overrides):

```bash
llm-optimizer config export
```

## Best Practices

1. **Never commit secrets** - Use environment variables
2. **Use production values** - Adjust for production workloads
3. **Enable monitoring** - Always enable metrics and logging
4. **Set resource limits** - Prevent resource exhaustion
5. **Regular backups** - Backup configuration regularly
6. **Test changes** - Validate before applying to production
7. **Document customizations** - Keep notes on why settings changed

## Examples

### Development Configuration

```yaml
server:
  port: 8080
database:
  url: postgresql://localhost/optimizer_dev
  auto_migrate: true
optimization:
  enabled: true
  interval_sec: 60
observability:
  logging:
    level: debug
    format: text
features:
  debug:
    verbose_logging: true
```

### Production Configuration

```yaml
server:
  port: 8080
  tls:
    enabled: true
    cert_path: /etc/ssl/cert.pem
    key_path: /etc/ssl/key.pem
database:
  url: ${DATABASE_URL}
  max_connections: 50
redis:
  cluster:
    enabled: true
    nodes: ${REDIS_NODES}
optimization:
  enabled: true
  interval_sec: 300
deployment:
  canary:
    enabled: true
    auto_rollback:
      enabled: true
observability:
  logging:
    level: info
    format: json
security:
  auth:
    enabled: true
  rate_limiting:
    enabled: true
```
