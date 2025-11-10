# OpenAPI Specification Summary

## Overview

The LLM Auto Optimizer REST API provides a complete OpenAPI 3.0 specification with auto-generated documentation accessible through multiple UI tools.

## Accessing Documentation

### Swagger UI
- **URL**: `http://localhost:8080/swagger-ui`
- **Description**: Interactive API documentation with "Try it out" functionality
- **Best for**: Testing and exploring the API interactively

### RapiDoc
- **URL**: `http://localhost:8080/rapidoc`
- **Description**: Modern, customizable API documentation
- **Best for**: Clean, readable documentation

### ReDoc
- **URL**: `http://localhost:8080/redoc`
- **Description**: Three-panel documentation with search
- **Best for**: Reference documentation and API exploration

## Generating Specification Files

### Using the Example

```bash
cd crates/api-rest
cargo run --example generate_openapi
```

This generates:
- `openapi.yaml` - YAML format specification
- `openapi.json` - JSON format specification

### Programmatically

```rust
use llm_optimizer_api_rest::openapi::{generate_openapi_yaml, generate_openapi_json};

// Generate YAML
let yaml = generate_openapi_yaml()?;
std::fs::write("openapi.yaml", yaml)?;

// Generate JSON
let json = generate_openapi_json()?;
std::fs::write("openapi.json", json)?;
```

## API Information

### Metadata
- **Title**: LLM Auto Optimizer REST API
- **Version**: 1.0.0
- **License**: Apache 2.0
- **Base URLs**:
  - Development: `http://localhost:8080`
  - Production: `https://api.llmdevops.dev`

### Contact
- **Name**: LLM DevOps Team
- **Email**: devops@llmdevops.dev
- **Website**: https://llmdevops.dev

## Security Schemes

### Bearer Authentication (JWT)
- **Type**: HTTP Bearer
- **Scheme**: Bearer
- **Format**: JWT
- **Header**: `Authorization: Bearer <token>`

### API Key Authentication
- **Type**: API Key
- **In**: Header
- **Name**: `x-api-key`
- **Header**: `X-API-Key: <api-key>`

## Endpoint Categories

### 1. Health Endpoints
**Tag**: `health`

No authentication required for health checks.

#### GET /health
- **Summary**: Comprehensive health check
- **Response**: HealthResponse
- **Status**: 200 (Healthy), 503 (Unhealthy)

#### GET /health/live
- **Summary**: Liveness probe
- **Response**: LivenessResponse
- **Status**: 200

#### GET /health/ready
- **Summary**: Readiness probe
- **Response**: ReadinessResponse
- **Status**: 200 (Ready), 503 (Not Ready)

### 2. Optimization Endpoints
**Tag**: `optimize`
**Path**: `/api/v1/optimize`
**Authentication**: Required

#### POST /api/v1/optimize
- **Summary**: Create optimization
- **Request**: CreateOptimizationRequest
- **Response**: OptimizationResponse
- **Status**: 201 (Created), 400 (Bad Request), 401 (Unauthorized)

#### GET /api/v1/optimize
- **Summary**: List optimizations
- **Query Params**:
  - Pagination (page, page_size)
  - ListOptimizationsQuery (status, strategy, service, from, to)
- **Response**: PaginatedResponse<OptimizationResponse>
- **Status**: 200

#### GET /api/v1/optimize/{id}
- **Summary**: Get optimization details
- **Path Param**: id (UUID)
- **Response**: OptimizationResponse
- **Status**: 200, 404 (Not Found)

#### POST /api/v1/optimize/{id}/deploy
- **Summary**: Deploy optimization
- **Path Param**: id (UUID)
- **Request**: DeployOptimizationRequest
- **Response**: OptimizationResponse
- **Status**: 200, 404

#### POST /api/v1/optimize/{id}/rollback
- **Summary**: Rollback optimization
- **Path Param**: id (UUID)
- **Request**: RollbackOptimizationRequest
- **Response**: OptimizationResponse
- **Status**: 200, 404

### 3. Configuration Endpoints
**Tag**: `config`
**Path**: `/api/v1/config`
**Authentication**: Required

#### GET /api/v1/config/{key}
- **Summary**: Get configuration value
- **Path Param**: key (string)
- **Response**: ConfigResponse
- **Status**: 200, 404

#### PUT /api/v1/config/{key}
- **Summary**: Update configuration
- **Path Param**: key (string)
- **Request**: UpdateConfigRequest
- **Response**: ConfigResponse
- **Status**: 200, 404

#### POST /api/v1/config/batch
- **Summary**: Batch update configurations
- **Request**: BatchUpdateConfigRequest
- **Response**: Vec<ConfigResponse>
- **Status**: 200

### 4. Metrics Endpoints
**Tag**: `metrics`
**Path**: `/api/v1/metrics`
**Authentication**: Required

#### POST /api/v1/metrics/query
- **Summary**: Query metrics
- **Request**: QueryMetricsRequest
- **Response**: MetricsResponse
- **Status**: 200

#### GET /api/v1/metrics/performance
- **Summary**: Get performance metrics
- **Response**: PerformanceMetricsResponse
- **Status**: 200

#### GET /api/v1/metrics/cost
- **Summary**: Get cost metrics
- **Response**: CostMetricsResponse
- **Status**: 200

#### GET /api/v1/metrics/quality
- **Summary**: Get quality metrics
- **Response**: QualityMetricsResponse
- **Status**: 200

### 5. Integration Endpoints
**Tag**: `integrations`
**Path**: `/api/v1/integrations`
**Authentication**: Required

#### POST /api/v1/integrations
- **Summary**: Create integration
- **Request**: CreateIntegrationRequest
- **Response**: IntegrationResponse
- **Status**: 201, 400

#### GET /api/v1/integrations
- **Summary**: List integrations
- **Response**: PaginatedResponse<IntegrationResponse>
- **Status**: 200

#### GET /api/v1/integrations/{id}
- **Summary**: Get integration details
- **Path Param**: id (UUID)
- **Response**: IntegrationResponse
- **Status**: 200, 404

#### PUT /api/v1/integrations/{id}
- **Summary**: Update integration
- **Path Param**: id (UUID)
- **Request**: UpdateIntegrationRequest
- **Response**: IntegrationResponse
- **Status**: 200, 404

#### DELETE /api/v1/integrations/{id}
- **Summary**: Delete integration
- **Path Param**: id (UUID)
- **Status**: 204 (No Content)

#### POST /api/v1/integrations/{id}/test
- **Summary**: Test integration
- **Path Param**: id (UUID)
- **Request**: TestIntegrationRequest
- **Response**: TestIntegrationResponse
- **Status**: 200

### 6. Admin Endpoints
**Tag**: `admin`
**Path**: `/api/v1/admin`
**Authentication**: Required (Admin role)

#### GET /api/v1/admin/stats
- **Summary**: Get system statistics
- **Response**: SystemStats
- **Status**: 200

#### POST /api/v1/admin/cache/flush
- **Summary**: Flush cache
- **Request**: FlushCacheRequest
- **Response**: FlushCacheResponse
- **Status**: 200

#### POST /api/v1/admin/api-keys
- **Summary**: Create API key
- **Request**: CreateApiKeyRequest
- **Response**: ApiKeyResponse
- **Status**: 201

#### GET /api/v1/admin/api-keys
- **Summary**: List API keys
- **Response**: PaginatedResponse<ApiKeyResponse>
- **Status**: 200

#### DELETE /api/v1/admin/api-keys/{id}
- **Summary**: Revoke API key
- **Path Param**: id (string)
- **Status**: 204

#### GET /api/v1/admin/audit-logs
- **Summary**: Query audit logs
- **Query Params**: QueryAuditLogsRequest
- **Response**: PaginatedResponse<AuditLogEntry>
- **Status**: 200

## Data Models

### Common Models

#### Pagination
```yaml
properties:
  page:
    type: integer
    default: 1
  page_size:
    type: integer
    default: 20
```

#### PaginatedResponse<T>
```yaml
properties:
  items:
    type: array
    items: T
  total:
    type: integer
  page:
    type: integer
  page_size:
    type: integer
  total_pages:
    type: integer
```

#### ApiResponse<T>
```yaml
properties:
  data: T
  request_id:
    type: string
    nullable: true
  metadata:
    type: object
    nullable: true
```

### Optimization Models

#### CreateOptimizationRequest
```yaml
properties:
  target_services:
    type: array
    items:
      type: string
  strategy:
    type: string
    enum: [ab_testing, reinforcement_feedback, cost_performance_scoring, ...]
  config:
    type: object
  constraints:
    type: array
    items: ConstraintInput
  dry_run:
    type: boolean
    default: false
```

#### OptimizationResponse
```yaml
properties:
  id: uuid
  target_services: array<string>
  strategy: OptimizationStrategy
  status: DecisionStatus
  changes: array<ConfigurationChangeResponse>
  expected_impact: ExpectedImpactResponse
  actual_impact: ActualImpactResponse (nullable)
  rationale: string
  created_at: datetime
  deployed_at: datetime (nullable)
```

### Health Models

#### HealthResponse
```yaml
properties:
  status: enum [healthy, degraded, unhealthy]
  version: string
  uptime_seconds: integer
  components: array<ComponentHealth>
  timestamp: datetime
```

### Error Response

All errors return:
```yaml
properties:
  error:
    type: string
    description: Error type identifier
  message:
    type: string
    description: Human-readable error message
  request_id:
    type: string
    nullable: true
  details:
    type: object
    nullable: true
```

## Response Codes

### Success Codes
- **200 OK**: Successful GET/PUT/POST request
- **201 Created**: Resource created successfully
- **204 No Content**: Successful DELETE request

### Client Error Codes
- **400 Bad Request**: Invalid request data
- **401 Unauthorized**: Missing or invalid authentication
- **403 Forbidden**: Insufficient permissions
- **404 Not Found**: Resource not found
- **409 Conflict**: Resource already exists
- **429 Too Many Requests**: Rate limit exceeded

### Server Error Codes
- **500 Internal Server Error**: Server error
- **503 Service Unavailable**: Service not ready
- **504 Gateway Timeout**: Request timeout

## Request/Response Examples

### Create Optimization

**Request**:
```json
POST /api/v1/optimize
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...

{
  "target_services": ["recommendation-service"],
  "strategy": "cost_performance_scoring",
  "config": {
    "min_quality_score": 0.85,
    "max_cost_increase": 5
  },
  "constraints": [
    {
      "constraint_type": "max_latency_ms",
      "value": 500,
      "hard": true
    }
  ],
  "dry_run": false
}
```

**Response** (201):
```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "target_services": ["recommendation-service"],
    "strategy": "cost_performance_scoring",
    "status": "pending",
    "changes": [],
    "expected_impact": {
      "cost_reduction_pct": 20.0,
      "quality_delta_pct": -2.0,
      "latency_delta_pct": -5.0,
      "confidence": 0.85
    },
    "rationale": "Optimization created successfully",
    "created_at": "2025-11-10T17:30:00Z"
  },
  "request_id": "req-abc123"
}
```

### Health Check

**Request**:
```bash
GET /health
```

**Response** (200):
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime_seconds": 86400,
  "components": [
    {
      "name": "database",
      "status": "healthy",
      "message": "Connected",
      "last_checked": "2025-11-10T17:30:00Z",
      "response_time_ms": 5.0
    }
  ],
  "timestamp": "2025-11-10T17:30:00Z"
}
```

## Validation Rules

### CreateOptimizationRequest
- `target_services`: Required, min length 1
- `strategy`: Required, valid enum value
- `constraints`: Optional array
- `dry_run`: Optional boolean

### CreateApiKeyRequest
- `name`: Required, length 1-100
- `roles`: Required, min length 1
- `expires_at`: Optional datetime

### QueryMetricsRequest
- `metric_name`: Required, min length 1
- `from`: Required datetime
- `to`: Required datetime

## Rate Limits

Default rate limits per minute:
- Global: 10,000 requests
- Authenticated users: 1,000 requests
- Anonymous users: 100 requests
- API keys: 5,000 requests

Rate limit headers in responses:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 995
X-RateLimit-Reset: 1609459200
```

## Authentication Flow

### JWT Token Authentication

1. Obtain token (implementation-specific)
2. Include in Authorization header:
   ```
   Authorization: Bearer <token>
   ```
3. Token expires after configured TTL (default 3600s)
4. Refresh token as needed

### API Key Authentication

1. Obtain API key from admin endpoint
2. Include in X-API-Key header:
   ```
   X-API-Key: sk_live_1234567890abcdef
   ```
3. API key remains valid until revoked

## Best Practices

1. **Always use HTTPS in production**
2. **Store JWT secrets securely**
3. **Rotate API keys regularly**
4. **Handle rate limits gracefully**
5. **Log request IDs for debugging**
6. **Use pagination for list endpoints**
7. **Validate all input data**
8. **Handle errors appropriately**

## Extending the API

To add new endpoints:

1. Create request/response models in `src/models/`
2. Add route handlers in `src/routes/`
3. Document with `#[utoipa::path]` attributes
4. Add to OpenAPI doc in `src/openapi.rs`
5. Add tests in `tests/`

Example:
```rust
#[utoipa::path(
    get,
    path = "/api/v1/custom",
    tag = "custom",
    responses(
        (status = 200, description = "Success", body = CustomResponse)
    )
)]
async fn custom_handler() -> Json<CustomResponse> {
    // Implementation
}
```

## Conclusion

The OpenAPI specification provides complete, accurate, and interactive documentation for the LLM Auto Optimizer REST API. It's automatically generated from the code and kept in sync with the implementation, ensuring documentation is always up-to-date.
