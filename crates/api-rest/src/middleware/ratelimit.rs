//! Rate limiting middleware

use axum::{
    extract::{Request, State},
    middleware::Next,
    response::Response,
};
use governor::{
    clock::DefaultClock,
    state::{InMemoryState, NotKeyed},
    Quota, RateLimiter as GovernorRateLimiter,
};
use std::num::NonZeroU32;
use std::sync::Arc;
use std::time::Duration;

use crate::error::ApiError;
use crate::middleware::auth::AuthMethod;

/// Rate limiter configuration
#[derive(Clone)]
pub struct RateLimitConfig {
    /// Global rate limiter (shared across all users)
    pub global: Arc<GovernorRateLimiter<NotKeyed, InMemoryState, DefaultClock>>,
    /// Per-user rate limiter
    pub per_user: Arc<dashmap::DashMap<String, Arc<GovernorRateLimiter<NotKeyed, InMemoryState, DefaultClock>>>>,
    /// Requests per minute for authenticated users
    pub authenticated_rpm: u32,
    /// Requests per minute for anonymous users
    pub anonymous_rpm: u32,
    /// Requests per minute for API keys
    pub api_key_rpm: u32,
}

impl RateLimitConfig {
    /// Create a new rate limit config
    pub fn new(global_rpm: u32, authenticated_rpm: u32, anonymous_rpm: u32, api_key_rpm: u32) -> Self {
        let global_quota = Quota::per_minute(NonZeroU32::new(global_rpm).unwrap());
        let global_limiter = Arc::new(GovernorRateLimiter::direct(global_quota));

        Self {
            global: global_limiter,
            per_user: Arc::new(dashmap::DashMap::new()),
            authenticated_rpm,
            anonymous_rpm,
            api_key_rpm,
        }
    }

    /// Get or create rate limiter for a user
    fn get_user_limiter(&self, user_id: &str, rpm: u32) -> Arc<GovernorRateLimiter<NotKeyed, InMemoryState, DefaultClock>> {
        self.per_user
            .entry(user_id.to_string())
            .or_insert_with(|| {
                let quota = Quota::per_minute(NonZeroU32::new(rpm).unwrap());
                Arc::new(GovernorRateLimiter::direct(quota))
            })
            .clone()
    }

    /// Clean up old entries (should be called periodically)
    pub fn cleanup_old_entries(&self) {
        self.per_user.retain(|_, limiter| {
            // Keep entries that have been used recently
            // This is a simple heuristic - in production you might want more sophisticated cleanup
            Arc::strong_count(limiter) > 1
        });
    }
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self::new(
            10000, // Global: 10k requests per minute
            1000,  // Authenticated: 1k requests per minute
            100,   // Anonymous: 100 requests per minute
            5000,  // API key: 5k requests per minute
        )
    }
}

/// Rate limit middleware
pub async fn rate_limit_middleware(
    State(config): State<Arc<RateLimitConfig>>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    // Check global rate limit first
    if config.global.check().is_err() {
        return Err(ApiError::RateLimit(
            "Global rate limit exceeded. Please try again later.".into(),
        ));
    }

    // Get user identifier and appropriate rate limit
    let (user_id, rpm) = if let Some(auth) = request.extensions().get::<AuthMethod>() {
        match auth {
            AuthMethod::Bearer(claims) => (claims.sub.clone(), config.authenticated_rpm),
            AuthMethod::ApiKey(key) => (format!("api:{}", key), config.api_key_rpm),
        }
    } else {
        // For anonymous users, use IP address or a generic identifier
        ("anonymous".to_string(), config.anonymous_rpm)
    };

    // Check per-user rate limit
    let user_limiter = config.get_user_limiter(&user_id, rpm);
    if user_limiter.check().is_err() {
        return Err(ApiError::RateLimit(format!(
            "Rate limit exceeded for user. Limit: {} requests per minute.",
            rpm
        )));
    }

    Ok(next.run(request).await)
}

/// Endpoint-specific rate limiter
pub struct EndpointRateLimiter {
    limiters: Arc<dashmap::DashMap<String, Arc<GovernorRateLimiter<NotKeyed, InMemoryState, DefaultClock>>>>,
}

impl EndpointRateLimiter {
    /// Create a new endpoint rate limiter
    pub fn new() -> Self {
        Self {
            limiters: Arc::new(dashmap::DashMap::new()),
        }
    }

    /// Create a rate limiter for a specific endpoint
    pub fn create_limiter(&self, endpoint: &str, requests_per_minute: u32) {
        let quota = Quota::per_minute(NonZeroU32::new(requests_per_minute).unwrap());
        let limiter = Arc::new(GovernorRateLimiter::direct(quota));
        self.limiters.insert(endpoint.to_string(), limiter);
    }

    /// Check rate limit for an endpoint
    pub fn check(&self, endpoint: &str, user_id: &str) -> Result<(), ApiError> {
        let key = format!("{}:{}", endpoint, user_id);

        if let Some(limiter) = self.limiters.get(endpoint) {
            if limiter.check().is_err() {
                return Err(ApiError::RateLimit(format!(
                    "Rate limit exceeded for endpoint: {}",
                    endpoint
                )));
            }
        }

        Ok(())
    }
}

impl Default for EndpointRateLimiter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rate_limit_config_creation() {
        let config = RateLimitConfig::new(10000, 1000, 100, 5000);
        assert_eq!(config.authenticated_rpm, 1000);
        assert_eq!(config.anonymous_rpm, 100);
        assert_eq!(config.api_key_rpm, 5000);
    }

    #[test]
    fn test_endpoint_rate_limiter() {
        let limiter = EndpointRateLimiter::new();
        limiter.create_limiter("/api/v1/optimize", 100);

        // First request should succeed
        assert!(limiter.check("/api/v1/optimize", "user-123").is_ok());
    }

    #[tokio::test]
    async fn test_rate_limit_enforcement() {
        let config = RateLimitConfig::new(10, 5, 2, 8);

        // Simulate multiple requests
        let mut success_count = 0;
        for _ in 0..20 {
            if config.global.check().is_ok() {
                success_count += 1;
            }
        }

        // Should allow up to the limit
        assert!(success_count <= 10);
    }
}
