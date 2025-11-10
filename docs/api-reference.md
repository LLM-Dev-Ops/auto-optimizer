# API Reference

Complete API reference for LLM Auto Optimizer REST and gRPC APIs.

## Table of Contents

1. [REST API](#rest-api)
2. [gRPC API](#grpc-api)
3. [Authentication](#authentication)
4. [Rate Limiting](#rate-limiting)
5. [Error Handling](#error-handling)

## REST API

Base URL: `http://localhost:8080/api/v1`

### Authentication

All API requests require authentication via JWT token:

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8080/api/v1/optimize
```

### Health Endpoints

#### GET /health

Check service health.

**Response:**
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "uptime_seconds": 12345
}
```

#### GET /health/detailed

Detailed health check with component status.

**Response:**
```json
{
  "status": "healthy",
  "components": {
    "database": "healthy",
    "redis": "healthy",
    "kafka": "healthy"
  },
  "metrics": {
    "memory_mb": 450,
    "cpu_percent": 12.5
  }
}
```

### Optimization Endpoints

#### POST /api/v1/optimize

Create new optimization.

**Request:**
```json
{
  "name": "Cost Optimization",
  "strategy": "cost_reduction",
  "parameters": {
    "target_reduction": "0.40",
    "quality_threshold": "0.95"
  }
}
```

**Response:**
```json
{
  "id": "opt-123",
  "name": "Cost Optimization",
  "strategy": "cost_reduction",
  "status": "created",
  "created_at": "2025-11-10T10:00:00Z"
}
```

#### GET /api/v1/optimize/{id}

Get optimization status.

**Response:**
```json
{
  "id": "opt-123",
  "name": "Cost Optimization",
  "strategy": "cost_reduction",
  "status": "deployed",
  "metrics": {
    "cost_reduction": 0.42,
    "quality_score": 0.96,
    "deployment_percentage": 100
  }
}
```

#### GET /api/v1/optimize

List all optimizations.

**Query Parameters:**
- `status` - Filter by status
- `strategy` - Filter by strategy
- `limit` - Results per page (default: 20)
- `offset` - Page offset (default: 0)

**Response:**
```json
{
  "optimizations": [
    {
      "id": "opt-123",
      "name": "Cost Optimization",
      "status": "deployed"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

#### POST /api/v1/optimize/{id}/deploy

Deploy optimization.

**Request:**
```json
{
  "canary": {
    "enabled": true,
    "stages": [
      {"percentage": 10, "duration_sec": 300},
      {"percentage": 50, "duration_sec": 600},
      {"percentage": 100}
    ]
  }
}
```

**Response:**
```json
{
  "deployment_id": "dep-456",
  "status": "deploying",
  "current_stage": 0
}
```

#### POST /api/v1/optimize/{id}/rollback

Rollback optimization.

**Response:**
```json
{
  "id": "opt-123",
  "status": "rolled_back",
  "rolled_back_at": "2025-11-10T11:00:00Z"
}
```

#### DELETE /api/v1/optimize/{id}

Delete optimization.

**Response:**
```json
{
  "message": "Optimization deleted successfully"
}
```

### Configuration Endpoints

#### GET /api/v1/config

Get current configuration.

**Response:**
```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 8080
  },
  "optimization": {
    "enabled": true,
    "interval_sec": 300
  }
}
```

#### PUT /api/v1/config

Update configuration.

**Request:**
```json
{
  "optimization": {
    "interval_sec": 600
  }
}
```

#### POST /api/v1/config/reload

Reload configuration from file.

**Response:**
```json
{
  "message": "Configuration reloaded successfully"
}
```

### Metrics Endpoints

#### GET /api/v1/metrics

Get optimization metrics.

**Query Parameters:**
- `start_time` - Start timestamp (ISO 8601)
- `end_time` - End timestamp (ISO 8601)
- `metric_type` - Type of metric (cost, latency, quality)

**Response:**
```json
{
  "metrics": [
    {
      "timestamp": "2025-11-10T10:00:00Z",
      "type": "cost",
      "value": 123.45,
      "optimization_id": "opt-123"
    }
  ]
}
```

#### GET /api/v1/metrics/summary

Get metrics summary.

**Response:**
```json
{
  "cost": {
    "current": 1234.56,
    "previous": 2000.00,
    "reduction": 0.38
  },
  "latency": {
    "p50_ms": 120,
    "p95_ms": 450,
    "p99_ms": 850
  },
  "quality": {
    "score": 0.96,
    "trend": "improving"
  }
}
```

### Integration Endpoints

#### POST /api/v1/integrations

Register new integration.

**Request:**
```json
{
  "type": "prometheus",
  "name": "Production Metrics",
  "config": {
    "url": "http://prometheus:9090",
    "scrape_interval": 30
  }
}
```

#### GET /api/v1/integrations

List integrations.

#### DELETE /api/v1/integrations/{id}

Remove integration.

### Admin Endpoints

#### POST /api/v1/admin/shutdown

Graceful shutdown.

**Request:**
```json
{
  "timeout_sec": 30
}
```

#### GET /api/v1/admin/stats

Get service statistics.

**Response:**
```json
{
  "requests_total": 12345,
  "errors_total": 12,
  "uptime_seconds": 86400,
  "active_optimizations": 5
}
```

## gRPC API

Protocol Buffer definitions in `proto/optimizer.proto`.

### Services

#### OptimizerService

```protobuf
service OptimizerService {
  rpc CreateOptimization(CreateOptimizationRequest) returns (Optimization);
  rpc GetOptimization(GetOptimizationRequest) returns (Optimization);
  rpc ListOptimizations(ListOptimizationsRequest) returns (ListOptimizationsResponse);
  rpc DeployOptimization(DeployOptimizationRequest) returns (Deployment);
  rpc RollbackOptimization(RollbackOptimizationRequest) returns (Optimization);
  rpc StreamMetrics(StreamMetricsRequest) returns (stream Metric);
}
```

### Example Usage (Rust)

```rust
use tonic::transport::Channel;
use optimizer_proto::optimizer_service_client::OptimizerServiceClient;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let channel = Channel::from_static("http://localhost:50051")
        .connect()
        .await?;

    let mut client = OptimizerServiceClient::new(channel);

    let request = tonic::Request::new(CreateOptimizationRequest {
        name: "Cost Optimization".to_string(),
        strategy: "cost_reduction".to_string(),
        parameters: HashMap::new(),
    });

    let response = client.create_optimization(request).await?;
    println!("Created: {:?}", response.get_ref());

    Ok(())
}
```

## Authentication

### JWT Authentication

Obtain token:

```bash
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "secret"}'
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_at": "2025-11-11T10:00:00Z"
}
```

Use token in requests:

```bash
curl -H "Authorization: Bearer eyJhbG..." \
  http://localhost:8080/api/v1/optimize
```

### API Keys

Alternative: Use API keys:

```bash
curl -H "X-API-Key: your-api-key" \
  http://localhost:8080/api/v1/optimize
```

## Rate Limiting

Default limits:
- 100 requests per minute per IP
- 1000 requests per hour per user

Headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1699614000
```

## Error Handling

### Error Response Format

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Validation failed: name is required",
    "details": {
      "field": "name",
      "constraint": "required"
    }
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_REQUEST` | 400 | Request validation failed |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource conflict |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Internal server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |

### Retry Logic

Use exponential backoff:

```python
import time
import requests

def api_call_with_retry(url, max_retries=3):
    for attempt in range(max_retries):
        try:
            response = requests.get(url)
            if response.status_code == 429:
                # Rate limited, wait and retry
                wait_time = 2 ** attempt
                time.sleep(wait_time)
                continue
            return response
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            time.sleep(2 ** attempt)
```

## Webhooks

Register webhooks for events:

```bash
curl -X POST http://localhost:8080/api/v1/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-service.com/webhook",
    "events": ["optimization.deployed", "optimization.failed"],
    "secret": "webhook-secret"
  }'
```

Webhook payload:

```json
{
  "event": "optimization.deployed",
  "timestamp": "2025-11-10T10:00:00Z",
  "data": {
    "id": "opt-123",
    "name": "Cost Optimization",
    "status": "deployed"
  }
}
```

## SDK Examples

### Python

```python
from llm_optimizer import Client

client = Client(
    base_url="http://localhost:8080",
    api_key="your-api-key"
)

# Create optimization
opt = client.optimizations.create(
    name="Cost Optimization",
    strategy="cost_reduction",
    parameters={"target_reduction": 0.40}
)

# Deploy
client.optimizations.deploy(opt.id)

# Monitor
metrics = client.metrics.get(opt.id)
print(f"Cost reduction: {metrics.cost_reduction}")
```

### JavaScript/TypeScript

```typescript
import { OptimizerClient } from '@llm-optimizer/client';

const client = new OptimizerClient({
  baseUrl: 'http://localhost:8080',
  apiKey: 'your-api-key'
});

// Create optimization
const opt = await client.optimizations.create({
  name: 'Cost Optimization',
  strategy: 'cost_reduction',
  parameters: { targetReduction: 0.40 }
});

// Deploy
await client.optimizations.deploy(opt.id);

// Monitor
const metrics = await client.metrics.get(opt.id);
console.log(`Cost reduction: ${metrics.costReduction}`);
```

## OpenAPI Specification

View interactive API documentation:

- **Swagger UI**: http://localhost:8080/swagger-ui
- **ReDoc**: http://localhost:8080/redoc
- **RapiDoc**: http://localhost:8080/rapidoc

Download OpenAPI spec: http://localhost:8080/api-docs/openapi.json
