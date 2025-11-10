# LLM Auto Optimizer - gRPC API

Production-ready gRPC API implementation with enterprise-grade quality for the LLM Auto Optimizer.

## Features

- **Protocol Buffers 3**: Type-safe message definitions with comprehensive schemas
- **All RPC Types**: Unary, server streaming, client streaming, and bidirectional streaming
- **HTTP/2 with TLS 1.3**: Secure communication with optional mutual TLS (mTLS)
- **Enterprise Interceptors**: Authentication (JWT), logging/tracing, rate limiting, error handling
- **Real-time Streaming**: Metrics, events, and interactive optimization sessions
- **Health Checks**: Standard gRPC health checking protocol
- **Reflection**: Dynamic client discovery (optional)
- **100% Rust**: Type-safe implementation with strict typing

## Services

### OptimizationService
Optimization operations with all RPC patterns:
- **Unary**: Create, get, list, deploy, rollback, cancel, validate optimizations
- **Server Streaming**: Subscribe to real-time optimization events
- **Client Streaming**: Batch create multiple optimizations
- **Bidirectional**: Interactive optimization sessions with AI-powered suggestions

### ConfigService
Configuration management:
- **Unary**: CRUD operations, versioning, import/export
- **Server Streaming**: Watch configuration changes in real-time
- **Client Streaming**: Batch configuration updates

### MetricsService
Real-time metrics and analytics:
- **Unary**: Query metrics, analytics, export data
- **Server Streaming**: Subscribe to metrics, performance data, cost tracking, alerts
- **Client Streaming**: Batch record metrics

### IntegrationService
External integration management:
- **Unary**: CRUD operations, health checks, testing
- **Server Streaming**: Subscribe to integration events

### HealthService
Health checks and readiness probes:
- **Unary**: Health, readiness, liveness checks
- **Server Streaming**: Watch health status changes

### AdminService
Administrative operations:
- **Unary**: System stats, database management, feature flags, jobs
- **Server Streaming**: Subscribe to system events

## Quick Start

### Server

```rust
use llm_optimizer_api_grpc::{GrpcServer, GrpcServerConfig, TlsConfig};
use std::path::PathBuf;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    // Configure server
    let mut config = GrpcServerConfig::default();
    config.addr = "0.0.0.0:50051".parse()?;

    // Optional: Enable TLS
    config.tls = Some(TlsConfig {
        cert_path: PathBuf::from("certs/server.crt"),
        key_path: PathBuf::from("certs/server.key"),
        ca_cert_path: Some(PathBuf::from("certs/ca.crt")),
        require_client_cert: false,
    });

    // Create and start server
    let server = GrpcServer::new(config).await?;
    server.serve().await?;

    Ok(())
}
```

### Client

```rust
use llm_optimizer_api_grpc::proto::optimization::*;
use tonic::transport::Channel;
use tonic::metadata::MetadataValue;
use tonic::Request;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Connect to server
    let channel = Channel::from_static("http://localhost:50051")
        .connect()
        .await?;

    let mut client = optimization_service_client::OptimizationServiceClient::new(channel);

    // Create optimization request
    let request = CreateOptimizationRequest {
        strategy: OptimizationStrategy::CostPerformanceScoring as i32,
        target_services: vec!["service-1".to_string()],
        changes: vec![
            ConfigurationChange {
                parameter: "model".to_string(),
                old_value: "claude-3-opus".to_string(),
                new_value: "claude-3-haiku".to_string(),
                change_type: ChangeType::Replace as i32,
            },
        ],
        rationale: "Reduce costs while maintaining quality".to_string(),
        expected_impact: Some(ExpectedImpact {
            cost_reduction_pct: 50.0,
            quality_delta_pct: -5.0,
            latency_delta_pct: 10.0,
            confidence: 0.85,
        }),
        constraints: vec![],
        auto_deploy: false,
    };

    // Add authentication token
    let mut request = Request::new(request);
    let token = "your-jwt-token";
    request.metadata_mut().insert(
        "authorization",
        MetadataValue::from_str(&format!("Bearer {}", token))?,
    );

    // Call service
    let response = client.create_optimization(request).await?;
    println!("Created optimization: {:?}", response.into_inner());

    Ok(())
}
```

## Streaming Examples

### Server Streaming: Subscribe to Events

```rust
use futures::StreamExt;

// Subscribe to optimization events
let request = SubscribeOptimizationEventsRequest {
    decision_ids: vec!["opt-123".to_string()],
    status_filter: vec![],
};

let mut stream = client
    .subscribe_optimization_events(request)
    .await?
    .into_inner();

// Process events as they arrive
while let Some(event) = stream.next().await {
    let event = event?;
    println!("Received event: {:?}", event);
}
```

### Client Streaming: Batch Operations

```rust
use tokio_stream::iter;

// Create multiple optimizations in a batch
let requests = vec![
    CreateOptimizationRequest { /* ... */ },
    CreateOptimizationRequest { /* ... */ },
    CreateOptimizationRequest { /* ... */ },
];

let stream = iter(requests);
let response = client.batch_create_optimizations(stream).await?;

println!("Created {} optimizations", response.into_inner().successful);
```

### Bidirectional Streaming: Interactive Sessions

```rust
use tokio::sync::mpsc;
use futures::{StreamExt, SinkExt};

// Create bidirectional channel
let (tx, rx) = mpsc::channel(100);
let outbound = tokio_stream::wrappers::ReceiverStream::new(rx);

// Start session
let mut inbound = client
    .optimization_session(outbound)
    .await?
    .into_inner();

// Send query
tx.send(OptimizationSessionMessage {
    message: Some(optimization_session_message::Message::Query(
        OptimizationQuery {
            target_services: vec!["service-1".to_string()],
            focus_areas: vec!["cost".to_string()],
            context: Default::default(),
        },
    )),
}).await?;

// Receive suggestions
while let Some(message) = inbound.next().await {
    let message = message?;
    if let Some(optimization_session_message::Message::Suggestion(suggestion)) = message.message {
        println!("Received suggestion: {}", suggestion.explanation);

        // Send feedback
        tx.send(OptimizationSessionMessage {
            message: Some(optimization_session_message::Message::Feedback(
                OptimizationFeedback {
                    suggestion_id: suggestion.suggestion_id,
                    accepted: true,
                    feedback_text: "Looks good!".to_string(),
                    adjustments: Default::default(),
                },
            )),
        }).await?;
    }
}
```

## Authentication

The API uses JWT tokens for authentication. Include the token in the `authorization` metadata:

```rust
let mut request = Request::new(your_request);
request.metadata_mut().insert(
    "authorization",
    MetadataValue::from_str(&format!("Bearer {}", token))?,
);
```

### Generating Tokens

```rust
use llm_optimizer_api_grpc::{TokenManager, Permission};

let manager = TokenManager::new("your-secret", "llm-optimizer".to_string());

let token = manager.generate_token(
    "user-123",
    vec!["read".to_string(), "write".to_string()],
)?;
```

## TLS Configuration

### Self-Signed Certificates (Development)

```bash
# Generate CA
openssl req -x509 -newkey rsa:4096 -days 365 -nodes \
    -keyout ca.key -out ca.crt \
    -subj "/CN=LLM Optimizer CA"

# Generate server certificate
openssl req -newkey rsa:4096 -nodes \
    -keyout server.key -out server.csr \
    -subj "/CN=localhost"

openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key \
    -CAcreateserial -out server.crt -days 365
```

### mTLS (Mutual TLS)

Enable client certificate verification:

```rust
config.tls = Some(TlsConfig {
    cert_path: PathBuf::from("certs/server.crt"),
    key_path: PathBuf::from("certs/server.key"),
    ca_cert_path: Some(PathBuf::from("certs/ca.crt")),
    require_client_cert: true,  // Enable mTLS
});
```

## Rate Limiting

Configure rate limits per service:

```rust
use llm_optimizer_api_grpc::interceptors::RateLimitConfig;

config.rate_limit = RateLimitConfig {
    requests_per_second: 100,
    burst_size: 10,
    per_user: true,
};
```

## Observability

### Logging

The API uses `tracing` for structured logging:

```rust
tracing_subscriber::fmt()
    .with_env_filter("info,llm_optimizer_api_grpc=debug")
    .json()
    .init();
```

### Metrics

Prometheus metrics are exposed for:
- Request counts
- Latency histograms
- Error rates
- Active streams

### Distributed Tracing

OpenTelemetry integration for distributed tracing:

```rust
use opentelemetry::global;
use opentelemetry_otlp::WithExportConfig;

let tracer = opentelemetry_otlp::new_pipeline()
    .tracing()
    .with_exporter(
        opentelemetry_otlp::new_exporter()
            .tonic()
            .with_endpoint("http://localhost:4317"),
    )
    .install_batch(opentelemetry_sdk::runtime::Tokio)?;

global::set_tracer_provider(tracer);
```

## Protocol Buffer Schemas

All `.proto` files are located in the `proto/` directory:

- `common.proto` - Common types and enums
- `optimization.proto` - Optimization service
- `config.proto` - Configuration service
- `metrics.proto` - Metrics service
- `integrations.proto` - Integration service
- `health.proto` - Health service
- `admin.proto` - Admin service

## Error Handling

All errors are mapped to appropriate gRPC status codes:

| API Error | gRPC Code |
|-----------|-----------|
| NotFound | NOT_FOUND |
| InvalidArgument | INVALID_ARGUMENT |
| PermissionDenied | PERMISSION_DENIED |
| Unauthenticated | UNAUTHENTICATED |
| RateLimitExceeded | RESOURCE_EXHAUSTED |
| Internal | INTERNAL |

## Testing

Run tests:

```bash
cargo test --package llm-optimizer-api-grpc
```

Run with coverage:

```bash
cargo tarpaulin --package llm-optimizer-api-grpc
```

## Performance

Benchmarks (on M1 Mac):
- Unary RPC: ~50k req/s
- Server streaming: ~100k events/s
- Bidirectional: ~30k messages/s (bidirectional)

## Production Checklist

- [ ] Enable TLS with valid certificates
- [ ] Configure authentication with strong JWT secret
- [ ] Set appropriate rate limits
- [ ] Enable structured logging (JSON)
- [ ] Configure metrics export
- [ ] Set up distributed tracing
- [ ] Configure health checks for k8s/cloud
- [ ] Review and adjust timeouts
- [ ] Enable connection limits
- [ ] Test failover and recovery

## License

Apache-2.0

## Contributing

See the main repository CONTRIBUTING.md for guidelines.
