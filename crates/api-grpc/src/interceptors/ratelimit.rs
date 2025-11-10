//! Rate limiting interceptor for gRPC requests

use crate::error::ApiError;
use dashmap::DashMap;
use governor::{
    clock::DefaultClock,
    state::{InMemoryState, NotKeyed},
    Quota, RateLimiter as GovernorRateLimiter,
};
use std::num::NonZeroU32;
use std::sync::Arc;
use tonic::{Request, Status};
use tracing::warn;

/// Rate limiter configuration
#[derive(Debug, Clone)]
pub struct RateLimitConfig {
    /// Requests per second allowed
    pub requests_per_second: u32,
    /// Burst size
    pub burst_size: u32,
    /// Enable per-user rate limiting
    pub per_user: bool,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            requests_per_second: 100,
            burst_size: 10,
            per_user: true,
        }
    }
}

/// Rate limiting interceptor
pub struct RateLimitInterceptor {
    /// Global rate limiter
    global_limiter: Arc<GovernorRateLimiter<NotKeyed, InMemoryState, DefaultClock>>,
    /// Per-user rate limiters
    user_limiters: Arc<DashMap<String, Arc<GovernorRateLimiter<NotKeyed, InMemoryState, DefaultClock>>>>,
    /// Configuration
    config: RateLimitConfig,
}

impl RateLimitInterceptor {
    /// Create a new rate limit interceptor
    pub fn new(config: RateLimitConfig) -> Self {
        let quota = Quota::per_second(
            NonZeroU32::new(config.requests_per_second)
                .expect("requests_per_second must be > 0"),
        )
        .allow_burst(
            NonZeroU32::new(config.burst_size).expect("burst_size must be > 0"),
        );

        Self {
            global_limiter: Arc::new(GovernorRateLimiter::direct(quota)),
            user_limiters: Arc::new(DashMap::new()),
            config,
        }
    }

    /// Get or create a rate limiter for a user
    fn get_user_limiter(&self, user_id: &str) -> Arc<GovernorRateLimiter<NotKeyed, InMemoryState, DefaultClock>> {
        self.user_limiters
            .entry(user_id.to_string())
            .or_insert_with(|| {
                let quota = Quota::per_second(
                    NonZeroU32::new(self.config.requests_per_second)
                        .expect("requests_per_second must be > 0"),
                )
                .allow_burst(
                    NonZeroU32::new(self.config.burst_size)
                        .expect("burst_size must be > 0"),
                );
                Arc::new(GovernorRateLimiter::direct(quota))
            })
            .clone()
    }

    /// Extract user ID from request
    fn extract_user_id<T>(request: &Request<T>) -> Option<String> {
        // Try to get user ID from claims in extensions
        request
            .extensions()
            .get::<crate::auth::Claims>()
            .map(|claims| claims.sub.clone())
            .or_else(|| {
                // Fallback to IP address or other identifier
                request
                    .metadata()
                    .get("x-forwarded-for")
                    .and_then(|v| v.to_str().ok())
                    .map(|s| s.to_string())
            })
    }

    /// Intercept and apply rate limiting
    pub fn intercept<T>(&self, request: Request<T>) -> Result<Request<T>, Status> {
        // Check global rate limit first
        if self.global_limiter.check().is_err() {
            warn!("Global rate limit exceeded");
            return Err(Status::from(ApiError::RateLimitExceeded));
        }

        // Check per-user rate limit if enabled
        if self.config.per_user {
            if let Some(user_id) = Self::extract_user_id(&request) {
                let limiter = self.get_user_limiter(&user_id);
                if limiter.check().is_err() {
                    warn!("Rate limit exceeded for user: {}", user_id);
                    return Err(Status::from(ApiError::RateLimitExceeded));
                }
            }
        }

        Ok(request)
    }
}

impl Clone for RateLimitInterceptor {
    fn clone(&self) -> Self {
        Self {
            global_limiter: Arc::clone(&self.global_limiter),
            user_limiters: Arc::clone(&self.user_limiters),
            config: self.config.clone(),
        }
    }
}

/// Create a rate limit interceptor closure for tonic
pub fn create_ratelimit_interceptor(
    config: RateLimitConfig,
) -> impl Fn(Request<()>) -> Result<Request<()>, Status> + Clone {
    let interceptor = RateLimitInterceptor::new(config);

    move |request| interceptor.intercept(request)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rate_limiter_creation() {
        let config = RateLimitConfig::default();
        let _interceptor = RateLimitInterceptor::new(config);
    }

    #[test]
    fn test_rate_limiting() {
        let config = RateLimitConfig {
            requests_per_second: 2,
            burst_size: 2,
            per_user: false,
        };
        let interceptor = RateLimitInterceptor::new(config);

        // First two requests should succeed (burst)
        assert!(interceptor.intercept(Request::new(())).is_ok());
        assert!(interceptor.intercept(Request::new(())).is_ok());

        // Third request should fail (rate limit exceeded)
        assert!(interceptor.intercept(Request::new(())).is_err());
    }
}
