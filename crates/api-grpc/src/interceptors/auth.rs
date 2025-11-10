//! Authentication interceptor for gRPC requests

use crate::auth::{extract_token_from_metadata, TokenManager};
use crate::error::ApiError;
use std::sync::Arc;
use tonic::{Request, Status};
use tracing::{debug, warn};

/// Authentication interceptor
#[derive(Clone)]
pub struct AuthInterceptor {
    token_manager: Arc<TokenManager>,
    /// Paths that don't require authentication
    public_paths: Vec<String>,
}

impl AuthInterceptor {
    /// Create a new authentication interceptor
    pub fn new(token_manager: Arc<TokenManager>) -> Self {
        Self {
            token_manager,
            public_paths: vec![
                "/grpc.health.v1.Health/Check".to_string(),
                "/grpc.health.v1.Health/Watch".to_string(),
                "/llm.optimizer.health.HealthService/Check".to_string(),
                "/llm.optimizer.health.HealthService/Liveness".to_string(),
                "/llm.optimizer.health.HealthService/Readiness".to_string(),
            ],
        }
    }

    /// Add a public path that doesn't require authentication
    pub fn add_public_path(&mut self, path: impl Into<String>) {
        self.public_paths.push(path.into());
    }

    /// Check if path is public
    fn is_public_path(&self, path: &str) -> bool {
        self.public_paths.iter().any(|p| path.starts_with(p))
    }

    /// Intercept and authenticate request
    pub fn intercept<T>(&self, mut request: Request<T>) -> Result<Request<T>, Status> {
        let path = request.uri().path();

        // Skip authentication for public paths
        if self.is_public_path(path) {
            debug!("Public path accessed: {}", path);
            return Ok(request);
        }

        // Extract and verify token
        let token = extract_token_from_metadata(request.metadata())
            .map_err(|e| Status::from(e))?;

        let claims = self
            .token_manager
            .verify_token(&token)
            .map_err(|e| Status::from(e))?;

        debug!(
            "Authenticated request for user: {} with roles: {:?}",
            claims.sub, claims.roles
        );

        // Store claims in request extensions for use by handlers
        request.extensions_mut().insert(claims);

        Ok(request)
    }
}

/// Helper function to create auth interceptor closure for tonic
pub fn create_auth_interceptor(
    token_manager: Arc<TokenManager>,
) -> impl Fn(Request<()>) -> Result<Request<()>, Status> + Clone {
    let interceptor = AuthInterceptor::new(token_manager);

    move |request| interceptor.intercept(request)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::Claims;
    use tonic::metadata::MetadataMap;

    #[test]
    fn test_public_path_bypass() {
        let token_manager = Arc::new(TokenManager::new("secret", "issuer".to_string()));
        let interceptor = AuthInterceptor::new(token_manager);

        assert!(interceptor.is_public_path("/grpc.health.v1.Health/Check"));
        assert!(!interceptor.is_public_path("/llm.optimizer.optimization.OptimizationService/CreateOptimization"));
    }

    #[test]
    fn test_missing_auth_header() {
        let token_manager = Arc::new(TokenManager::new("secret", "issuer".to_string()));
        let interceptor = AuthInterceptor::new(token_manager);

        let request = Request::new(());
        let result = interceptor.intercept(request);

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code(), tonic::Code::Unauthenticated);
    }
}
