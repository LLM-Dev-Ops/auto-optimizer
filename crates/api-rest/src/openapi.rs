//! OpenAPI specification generation

use utoipa::{
    openapi::security::{ApiKey, ApiKeyValue, HttpAuthScheme, HttpBuilder, SecurityScheme},
    Modify, OpenApi,
};

use crate::models::{
    admin::*, common::*, config::*, health::*, integrations::*, metrics::*, optimize::*,
};

/// OpenAPI documentation
#[derive(OpenApi)]
#[openapi(
    paths(
        // Health endpoints
        crate::routes::health::health_check,
        crate::routes::health::liveness_check,
        crate::routes::health::readiness_check,
        // Optimization endpoints
        crate::routes::optimize::create_optimization,
        crate::routes::optimize::list_optimizations,
        crate::routes::optimize::get_optimization,
        crate::routes::optimize::deploy_optimization,
        crate::routes::optimize::rollback_optimization,
    ),
    components(
        schemas(
            // Common models
            Pagination,
            PaginatedResponse<OptimizationResponse>,
            PaginatedResponse<IntegrationResponse>,
            PaginatedResponse<ApiKeyResponse>,
            PaginatedResponse<AuditLogEntry>,
            ApiResponse<OptimizationResponse>,
            ApiResponse<ConfigResponse>,
            ApiResponse<MetricsResponse>,
            ApiResponse<PerformanceMetricsResponse>,
            ApiResponse<CostMetricsResponse>,
            ApiResponse<QualityMetricsResponse>,
            ApiResponse<IntegrationResponse>,
            ApiResponse<TestIntegrationResponse>,
            ApiResponse<SystemStats>,
            ApiResponse<FlushCacheResponse>,
            ApiResponse<ApiKeyResponse>,
            ApiResponse<Vec<ConfigResponse>>,
            SortDirection,
            DateRange,
            // Optimization models
            CreateOptimizationRequest,
            OptimizationResponse,
            ConfigurationChangeResponse,
            ExpectedImpactResponse,
            ActualImpactResponse,
            DeployOptimizationRequest,
            RollbackOptimizationRequest,
            ListOptimizationsQuery,
            ConstraintInput,
            // Config models
            GetConfigRequest,
            UpdateConfigRequest,
            ConfigResponse,
            BatchUpdateConfigRequest,
            ConfigUpdate,
            // Metrics models
            QueryMetricsRequest,
            MetricsResponse,
            MetricDataPoint,
            MetricSummary,
            PerformanceMetricsResponse,
            CostMetricsResponse,
            QualityMetricsResponse,
            // Integration models
            IntegrationType,
            CreateIntegrationRequest,
            UpdateIntegrationRequest,
            IntegrationResponse,
            TestIntegrationRequest,
            TestIntegrationResponse,
            // Health models
            HealthStatus,
            ComponentHealth,
            HealthResponse,
            LivenessResponse,
            ReadinessResponse,
            ComponentReadiness,
            // Admin models
            SystemStats,
            FlushCacheRequest,
            FlushCacheResponse,
            CreateApiKeyRequest,
            ApiKeyResponse,
            AuditLogEntry,
            QueryAuditLogsRequest,
        )
    ),
    modifiers(&SecurityAddon),
    tags(
        (name = "health", description = "Health check endpoints"),
        (name = "optimize", description = "Optimization management endpoints"),
        (name = "config", description = "Configuration management endpoints"),
        (name = "metrics", description = "Metrics and analytics endpoints"),
        (name = "integrations", description = "Integration management endpoints"),
        (name = "admin", description = "Administrative endpoints"),
    ),
    info(
        title = "LLM Auto Optimizer REST API",
        version = "1.0.0",
        description = "Production-ready REST API for LLM Auto Optimizer with enterprise-grade features including authentication, rate limiting, and comprehensive metrics.",
        contact(
            name = "LLM DevOps Team",
            email = "devops@llmdevops.dev",
            url = "https://llmdevops.dev"
        ),
        license(
            name = "Apache 2.0",
            url = "https://www.apache.org/licenses/LICENSE-2.0"
        )
    ),
    servers(
        (url = "http://localhost:8080", description = "Local development server"),
        (url = "https://api.llmdevops.dev", description = "Production server"),
    )
)]
pub struct ApiDoc;

/// Security scheme addon
struct SecurityAddon;

impl Modify for SecurityAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        if let Some(components) = openapi.components.as_mut() {
            components.add_security_scheme(
                "bearer_auth",
                SecurityScheme::Http(
                    HttpBuilder::new()
                        .scheme(HttpAuthScheme::Bearer)
                        .bearer_format("JWT")
                        .description(Some("JWT bearer token authentication"))
                        .build(),
                ),
            );

            components.add_security_scheme(
                "api_key",
                SecurityScheme::ApiKey(ApiKey::Header(ApiKeyValue::new("x-api-key"))),
            );
        }
    }
}

/// Generate OpenAPI YAML specification
pub fn generate_openapi_yaml() -> Result<String, serde_yaml::Error> {
    let api_doc = ApiDoc::openapi();
    serde_yaml::to_string(&api_doc)
}

/// Generate OpenAPI JSON specification
pub fn generate_openapi_json() -> Result<String, serde_json::Error> {
    let api_doc = ApiDoc::openapi();
    serde_json::to_string_pretty(&api_doc)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_openapi_generation() {
        let api_doc = ApiDoc::openapi();
        assert_eq!(api_doc.info.title, "LLM Auto Optimizer REST API");
        assert_eq!(api_doc.info.version, "1.0.0");
    }

    #[test]
    fn test_yaml_generation() {
        let yaml = generate_openapi_yaml();
        assert!(yaml.is_ok());
    }

    #[test]
    fn test_json_generation() {
        let json = generate_openapi_json();
        assert!(json.is_ok());
    }
}
