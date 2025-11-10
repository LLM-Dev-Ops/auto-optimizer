# LLM Auto Optimizer REST API

Production-ready REST API implementation for the LLM Auto Optimizer with enterprise-grade features.

## Features

### Core REST API
- ✅ RESTful endpoint design following best practices
- ✅ HTTP/1.1 and HTTP/2 support
- ✅ JSON request/response with schema validation
- ✅ OpenAPI 3.0 specification with auto-generated documentation
- ✅ Content negotiation (JSON, MessagePack support)
- ✅ CORS support with configurable origins
- ✅ Compression (gzip, brotli)
- ✅ ETags for caching (via tower-http)

### Middleware Stack
- ✅ **Authentication**: JWT bearer tokens and API key support
- ✅ **Authorization**: Role-Based Access Control (RBAC)
- ✅ **Rate Limiting**: Per-user and per-endpoint rate limiting
- ✅ **Request ID**: Automatic request ID generation and tracking
- ✅ **Logging**: Structured logging with tracing
- ✅ **Tracing**: Distributed tracing support
- ✅ **Error Handling**: Comprehensive error handling with detailed responses
- ✅ **CORS**: Configurable CORS policies
- ✅ **Compression**: Response compression
- ✅ **Timeout**: Request timeout handling

### API Endpoints

#### Health & Monitoring
- `GET /health` - Comprehensive health check
- `GET /health/live` - Liveness probe (Kubernetes)
- `GET /health/ready` - Readiness probe (Kubernetes)

#### Optimization Management
- `POST /api/v1/optimize` - Create optimization
- `GET /api/v1/optimize` - List optimizations
- `GET /api/v1/optimize/:id` - Get optimization details
- `POST /api/v1/optimize/:id/deploy` - Deploy optimization
- `POST /api/v1/optimize/:id/rollback` - Rollback optimization

#### Configuration Management
- `GET /api/v1/config/:key` - Get configuration
- `PUT /api/v1/config/:key` - Update configuration
- `POST /api/v1/config/batch` - Batch update configurations

#### Metrics & Analytics
- `POST /api/v1/metrics/query` - Query metrics
- `GET /api/v1/metrics/performance` - Get performance metrics
- `GET /api/v1/metrics/cost` - Get cost metrics
- `GET /api/v1/metrics/quality` - Get quality metrics

#### Integration Management
- `POST /api/v1/integrations` - Create integration
- `GET /api/v1/integrations` - List integrations
- `GET /api/v1/integrations/:id` - Get integration details
- `PUT /api/v1/integrations/:id` - Update integration
- `DELETE /api/v1/integrations/:id` - Delete integration
- `POST /api/v1/integrations/:id/test` - Test integration

#### Admin Operations
- `GET /api/v1/admin/stats` - Get system statistics
- `POST /api/v1/admin/cache/flush` - Flush cache
- `POST /api/v1/admin/api-keys` - Create API key
- `GET /api/v1/admin/api-keys` - List API keys
- `DELETE /api/v1/admin/api-keys/:id` - Revoke API key
- `GET /api/v1/admin/audit-logs` - Query audit logs

## Installation

Add to your `Cargo.toml`:

```toml
[dependencies]
llm-optimizer-api-rest = { path = "../api-rest" }
```

## Quick Start

### Basic Server

```rust
use llm_optimizer_api_rest::{start_server, ServerConfig};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = ServerConfig::new(
        "0.0.0.0:8080".parse()?,
        "your-jwt-secret".to_string(),
    );

    start_server(config).await?;
    Ok(())
}
```

### With Custom Configuration

```rust
use llm_optimizer_api_rest::{
    start_server, ServerConfig,
    middleware::{CorsConfig, RateLimitConfig, development_cors},
};
use std::time::Duration;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = ServerConfig::new(
        "0.0.0.0:8080".parse()?,
        std::env::var("JWT_SECRET")?,
    )
    .with_cors(development_cors())
    .with_rate_limit(RateLimitConfig::new(
        10000, // Global: 10k req/min
        1000,  // Authenticated: 1k req/min
        100,   // Anonymous: 100 req/min
        5000,  // API key: 5k req/min
    ));

    start_server(config).await?;
    Ok(())
}
```

## Authentication

### JWT Bearer Token

```bash
# Obtain token (example)
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Use token in requests
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/v1/optimize
```

### API Key

```bash
# Use API key in requests
curl -H "X-API-Key: your-api-key" \
  http://localhost:8080/api/v1/optimize
```

## Role-Based Access Control

### Roles

- **admin**: Full access to all endpoints
- **user**: Access to optimization, config (read), metrics (read), integrations (read)
- **readonly**: Read-only access to most endpoints
- **api_user**: Programmatic access with optimize and metrics permissions

### Permissions

Permissions are automatically assigned based on roles:

```rust
use llm_optimizer_api_rest::middleware::{Role, Permission};

let admin_permissions = Permission::for_role(&Role::Admin);
// Includes: OptimizeWrite, AdminExecute, IntegrationDelete, etc.

let readonly_permissions = Permission::for_role(&Role::ReadOnly);
// Includes: OptimizeRead, ConfigRead, MetricsRead
```

## OpenAPI Documentation

The API automatically generates OpenAPI 3.0 documentation accessible at:

- **Swagger UI**: http://localhost:8080/swagger-ui
- **RapiDoc**: http://localhost:8080/rapidoc
- **ReDoc**: http://localhost:8080/redoc

### Generate OpenAPI Spec Files

```bash
# Run the example to generate specs
cargo run --example generate_openapi

# This creates:
# - openapi.yaml
# - openapi.json
```

## Rate Limiting

Rate limits are applied at two levels:

1. **Global**: Protects entire API from overload
2. **Per-User**: Limits based on user identity

Default limits:
- Global: 10,000 requests/minute
- Authenticated users: 1,000 requests/minute
- Anonymous users: 100 requests/minute
- API keys: 5,000 requests/minute

Rate limit headers in responses:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 995
X-RateLimit-Reset: 1609459200
```

## CORS Configuration

### Development (Permissive)

```rust
use llm_optimizer_api_rest::middleware::development_cors;

let config = ServerConfig::default()
    .with_cors(development_cors());
```

### Production (Restricted)

```rust
use llm_optimizer_api_rest::middleware::CorsConfig;
use std::time::Duration;

let cors = CorsConfig::new()
    .with_origins(vec![
        "https://app.example.com".to_string(),
        "https://dashboard.example.com".to_string(),
    ])
    .with_credentials(true)
    .with_max_age(Duration::from_secs(3600));

let config = ServerConfig::default()
    .with_cors(cors);
```

## Error Handling

All errors return consistent JSON responses:

```json
{
  "error": "validation_error",
  "message": "Invalid request: field 'name' is required",
  "request_id": "req-abc123",
  "details": {
    "field": "name",
    "constraint": "required"
  }
}
```

### Error Types

- `authentication_error` (401)
- `authorization_error` (403)
- `validation_error` (400)
- `not_found` (404)
- `conflict` (409)
- `rate_limit_exceeded` (429)
- `internal_error` (500)
- `service_unavailable` (503)
- `timeout` (504)

## Request Tracing

Every request is assigned a unique ID:

```bash
curl -v http://localhost:8080/health

# Response includes:
# X-Request-ID: 550e8400-e29b-41d4-a716-446655440000
```

Use request IDs to track requests across logs and distributed systems.

## Environment Variables

```bash
# Server configuration
BIND_ADDRESS=0.0.0.0:8080
JWT_SECRET=your-secret-key

# Logging
RUST_LOG=info,llm_optimizer_api_rest=debug

# Optional
CORS_ORIGINS=https://app.example.com,https://dashboard.example.com
RATE_LIMIT_GLOBAL=10000
RATE_LIMIT_AUTHENTICATED=1000
RATE_LIMIT_ANONYMOUS=100
```

## Testing

### Run Tests

```bash
# Unit tests
cargo test

# Integration tests
cargo test --test integration_tests

# With logging
RUST_LOG=debug cargo test
```

### Example Test

```rust
use axum_test::TestServer;
use llm_optimizer_api_rest::{build_app, ServerConfig};

#[tokio::test]
async fn test_health_check() {
    let config = ServerConfig::default();
    let app = build_app(config);
    let server = TestServer::new(app).unwrap();

    let response = server.get("/health").await;
    assert_eq!(response.status_code(), 200);
}
```

## Performance

- **Async/await**: Built on Tokio for maximum concurrency
- **Zero-copy**: Uses axum's efficient body handling
- **Compression**: Automatic response compression
- **Connection pooling**: Reuses connections for better performance
- **Timeouts**: Prevents long-running requests from blocking

## Security

- ✅ JWT with RS256/HS256 support
- ✅ API key authentication
- ✅ RBAC with fine-grained permissions
- ✅ Rate limiting to prevent abuse
- ✅ Request validation
- ✅ CORS protection
- ✅ Timeout protection
- ✅ Secure headers (via tower-http)

## Production Deployment

### Docker

```dockerfile
FROM rust:1.75 as builder
WORKDIR /app
COPY . .
RUN cargo build --release --package llm-optimizer-api-rest

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/llm-optimizer-api-rest /usr/local/bin/
EXPOSE 8080
CMD ["llm-optimizer-api-rest"]
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: llm-optimizer-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: llm-optimizer-api
  template:
    metadata:
      labels:
        app: llm-optimizer-api
    spec:
      containers:
      - name: api
        image: llm-optimizer-api-rest:latest
        ports:
        - containerPort: 8080
        env:
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: api-secrets
              key: jwt-secret
        livenessProbe:
          httpGet:
            path: /health/live
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 5
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 3
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Client Request                        │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                  Middleware Stack                        │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Request ID → Logging → Tracing → Timeout          │ │
│  └────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────┐ │
│  │ CORS → Compression → Auth → Rate Limit            │ │
│  └────────────────────────────────────────────────────┘ │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                    Route Handlers                        │
│  ┌──────────┬──────────┬─────────┬──────────────────┐  │
│  │Optimize  │ Config   │ Metrics │ Integrations     │  │
│  │          │          │         │                  │  │
│  │ Health   │ Admin    │         │                  │  │
│  └──────────┴──────────┴─────────┴──────────────────┘  │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│              Business Logic Layer                        │
│  (Processor, Analyzer, Decision, Actuator)               │
└─────────────────────────────────────────────────────────┘
```

## License

Apache 2.0

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for details.
