//! CORS middleware configuration

use tower_http::cors::{Any, CorsLayer};
use std::time::Duration;

/// CORS configuration
#[derive(Clone, Debug)]
pub struct CorsConfig {
    /// Allowed origins
    pub allowed_origins: Vec<String>,
    /// Allow credentials
    pub allow_credentials: bool,
    /// Max age for preflight requests
    pub max_age: Duration,
}

impl CorsConfig {
    /// Create a new CORS config
    pub fn new() -> Self {
        Self {
            allowed_origins: vec!["*".to_string()],
            allow_credentials: false,
            max_age: Duration::from_secs(3600),
        }
    }

    /// Set allowed origins
    pub fn with_origins(mut self, origins: Vec<String>) -> Self {
        self.allowed_origins = origins;
        self
    }

    /// Allow credentials
    pub fn with_credentials(mut self, allow: bool) -> Self {
        self.allow_credentials = allow;
        self
    }

    /// Set max age
    pub fn with_max_age(mut self, max_age: Duration) -> Self {
        self.max_age = max_age;
        self
    }

    /// Build the CorsLayer
    pub fn build(self) -> CorsLayer {
        let mut cors = CorsLayer::new()
            .allow_methods([
                axum::http::Method::GET,
                axum::http::Method::POST,
                axum::http::Method::PUT,
                axum::http::Method::DELETE,
                axum::http::Method::PATCH,
                axum::http::Method::OPTIONS,
            ])
            .allow_headers([
                axum::http::header::CONTENT_TYPE,
                axum::http::header::AUTHORIZATION,
                axum::http::header::ACCEPT,
                axum::http::header::HeaderName::from_static("x-api-key"),
                axum::http::header::HeaderName::from_static("x-request-id"),
            ])
            .expose_headers([
                axum::http::header::CONTENT_TYPE,
                axum::http::header::HeaderName::from_static("x-request-id"),
                axum::http::header::HeaderName::from_static("x-ratelimit-limit"),
                axum::http::header::HeaderName::from_static("x-ratelimit-remaining"),
                axum::http::header::HeaderName::from_static("x-ratelimit-reset"),
            ])
            .max_age(self.max_age);

        // Handle origins
        if self.allowed_origins.contains(&"*".to_string()) {
            cors = cors.allow_origin(Any);
        } else {
            let origins: Vec<_> = self
                .allowed_origins
                .iter()
                .filter_map(|origin| origin.parse::<axum::http::HeaderValue>().ok())
                .collect();
            cors = cors.allow_origin(origins);
        }

        // Handle credentials
        if self.allow_credentials {
            cors = cors.allow_credentials(true);
        }

        cors
    }
}

impl Default for CorsConfig {
    fn default() -> Self {
        Self::new()
    }
}

/// Production CORS configuration
pub fn production_cors() -> CorsConfig {
    CorsConfig::new()
        .with_origins(vec![
            "https://app.example.com".to_string(),
            "https://dashboard.example.com".to_string(),
        ])
        .with_credentials(true)
        .with_max_age(Duration::from_secs(3600))
}

/// Development CORS configuration (permissive)
pub fn development_cors() -> CorsConfig {
    CorsConfig::new()
        .with_origins(vec!["*".to_string()])
        .with_credentials(false)
        .with_max_age(Duration::from_secs(600))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cors_config_creation() {
        let config = CorsConfig::new();
        assert_eq!(config.allowed_origins, vec!["*"]);
        assert!(!config.allow_credentials);
    }

    #[test]
    fn test_cors_config_builder() {
        let config = CorsConfig::new()
            .with_origins(vec!["https://example.com".to_string()])
            .with_credentials(true)
            .with_max_age(Duration::from_secs(7200));

        assert_eq!(config.allowed_origins, vec!["https://example.com"]);
        assert!(config.allow_credentials);
        assert_eq!(config.max_age, Duration::from_secs(7200));
    }

    #[test]
    fn test_production_cors() {
        let config = production_cors();
        assert!(config.allow_credentials);
        assert!(config.allowed_origins.len() > 0);
    }

    #[test]
    fn test_development_cors() {
        let config = development_cors();
        assert!(!config.allow_credentials);
        assert_eq!(config.allowed_origins, vec!["*"]);
    }
}
