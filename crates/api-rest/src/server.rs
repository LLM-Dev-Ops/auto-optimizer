//! HTTP server implementation

use axum::{
    middleware,
    Router,
    http::{header, Method},
};
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tower::ServiceBuilder;
use tower_http::{
    compression::CompressionLayer,
    trace::TraceLayer,
};
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;
use utoipa_rapidoc::RapiDoc;
use utoipa_redoc::{Redoc, Servable};

use crate::{
    error::ApiResult,
    middleware::{
        auth::{auth_middleware, AuthConfig},
        cors::CorsConfig,
        logging::{logging_middleware, metrics_middleware, request_id_middleware},
        ratelimit::{rate_limit_middleware, RateLimitConfig},
        timeout::default_timeout,
    },
    openapi::ApiDoc,
    routes::{
        admin::{admin_routes, AdminService},
        config::{config_routes, ConfigService},
        health::{health_routes, HealthState},
        integrations::{integrations_routes, IntegrationService},
        metrics::{metrics_routes, MetricsService},
        optimize::{optimize_routes, OptimizationService},
    },
};

/// Server configuration
#[derive(Clone)]
pub struct ServerConfig {
    /// Server address
    pub addr: SocketAddr,
    /// Authentication config
    pub auth: Arc<AuthConfig>,
    /// Rate limit config
    pub rate_limit: Arc<RateLimitConfig>,
    /// CORS config
    pub cors: CorsConfig,
    /// Application version
    pub version: String,
}

impl ServerConfig {
    /// Create a new server config
    pub fn new(addr: SocketAddr, jwt_secret: String) -> Self {
        Self {
            addr,
            auth: Arc::new(AuthConfig::new(jwt_secret)),
            rate_limit: Arc::new(RateLimitConfig::default()),
            cors: CorsConfig::default(),
            version: env!("CARGO_PKG_VERSION").to_string(),
        }
    }

    /// Set CORS config
    pub fn with_cors(mut self, cors: CorsConfig) -> Self {
        self.cors = cors;
        self
    }

    /// Set rate limit config
    pub fn with_rate_limit(mut self, rate_limit: RateLimitConfig) -> Self {
        self.rate_limit = Arc::new(rate_limit);
        self
    }
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self::new(
            "0.0.0.0:8080".parse().unwrap(),
            "default-secret-change-in-production".to_string(),
        )
    }
}

/// Build the application router
pub fn build_app(config: ServerConfig) -> Router {
    // Initialize services
    let health_state = Arc::new(HealthState::new(config.version.clone()));
    let optimize_service = Arc::new(OptimizationService::new());
    let config_service = Arc::new(ConfigService);
    let metrics_service = Arc::new(MetricsService);
    let integrations_service = Arc::new(IntegrationService);
    let admin_service = Arc::new(AdminService);

    // Build API v1 routes (protected)
    let api_v1 = Router::new()
        .merge(optimize_routes(optimize_service))
        .merge(config_routes(config_service))
        .merge(metrics_routes(metrics_service))
        .merge(integrations_routes(integrations_service))
        .merge(admin_routes(admin_service))
        // Add authentication middleware
        .layer(middleware::from_fn_with_state(
            config.auth.clone(),
            auth_middleware,
        ))
        // Add rate limiting
        .layer(middleware::from_fn_with_state(
            config.rate_limit.clone(),
            rate_limit_middleware,
        ));

    // Build complete router
    Router::new()
        // OpenAPI documentation
        .merge(SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", ApiDoc::openapi()))
        .merge(RapiDoc::new("/api-docs/openapi.json").path("/rapidoc"))
        .merge(Redoc::with_url("/redoc", ApiDoc::openapi()))
        // Health endpoints (no authentication required)
        .merge(health_routes(health_state))
        // API v1 routes (authentication required)
        .nest("/api/v1", api_v1)
        // Global middleware (applied to all routes)
        .layer(
            ServiceBuilder::new()
                // Timeout
                .layer(default_timeout())
                // Compression (gzip, brotli)
                .layer(CompressionLayer::new())
                // CORS
                .layer(config.cors.build())
                // Request ID
                .layer(middleware::from_fn(request_id_middleware))
                // Logging
                .layer(middleware::from_fn(logging_middleware))
                // Metrics
                .layer(middleware::from_fn(metrics_middleware))
                // Tracing
                .layer(
                    TraceLayer::new_for_http()
                        .make_span_with(|request: &axum::http::Request<_>| {
                            tracing::info_span!(
                                "http_request",
                                method = %request.method(),
                                uri = %request.uri(),
                            )
                        }),
                ),
        )
}

/// Start the HTTP server
pub async fn start_server(config: ServerConfig) -> ApiResult<()> {
    let addr = config.addr;
    let app = build_app(config);

    tracing::info!("Starting server on {}", addr);
    tracing::info!("OpenAPI documentation available at:");
    tracing::info!("  - Swagger UI: http://{}/swagger-ui", addr);
    tracing::info!("  - RapiDoc: http://{}/rapidoc", addr);
    tracing::info!("  - ReDoc: http://{}/redoc", addr);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| crate::error::ApiError::Internal(format!("Failed to bind to {}: {}", addr, e)))?;

    axum::serve(listener, app)
        .await
        .map_err(|e| crate::error::ApiError::Internal(format!("Server error: {}", e)))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_server_config_creation() {
        let config = ServerConfig::default();
        assert_eq!(config.addr.port(), 8080);
    }

    #[test]
    fn test_app_building() {
        let config = ServerConfig::default();
        let _app = build_app(config);
        // If we get here, the app was built successfully
        assert!(true);
    }
}
