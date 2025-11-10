//! Interceptors for gRPC requests
//!
//! This module provides various interceptors for cross-cutting concerns:
//! - Authentication and authorization
//! - Request logging and tracing
//! - Rate limiting
//! - Error handling

pub mod auth;
pub mod logging;
pub mod ratelimit;

pub use auth::{create_auth_interceptor, AuthInterceptor};
pub use logging::{create_request_span, log_request_complete, LoggingInterceptor, RequestTimer};
pub use ratelimit::{create_ratelimit_interceptor, RateLimitConfig, RateLimitInterceptor};

use tonic::{Request, Status};

/// Combined interceptor that applies multiple interceptors in sequence
#[derive(Clone)]
pub struct CombinedInterceptor {
    auth: Option<AuthInterceptor>,
    logging: Option<LoggingInterceptor>,
    ratelimit: Option<RateLimitInterceptor>,
}

impl CombinedInterceptor {
    /// Create a new combined interceptor
    pub fn new() -> Self {
        Self {
            auth: None,
            logging: None,
            ratelimit: None,
        }
    }

    /// Add authentication interceptor
    pub fn with_auth(mut self, auth: AuthInterceptor) -> Self {
        self.auth = Some(auth);
        self
    }

    /// Add logging interceptor
    pub fn with_logging(mut self, logging: LoggingInterceptor) -> Self {
        self.logging = Some(logging);
        self
    }

    /// Add rate limiting interceptor
    pub fn with_ratelimit(mut self, ratelimit: RateLimitInterceptor) -> Self {
        self.ratelimit = Some(ratelimit);
        self
    }

    /// Intercept request through all configured interceptors
    pub fn intercept<T>(&self, request: Request<T>) -> Result<Request<T>, Status> {
        let mut request = request;

        // Apply logging first
        if let Some(ref logging) = self.logging {
            request = logging.intercept(request)?;
        }

        // Apply rate limiting
        if let Some(ref ratelimit) = self.ratelimit {
            request = ratelimit.intercept(request)?;
        }

        // Apply authentication last (after rate limiting)
        if let Some(ref auth) = self.auth {
            request = auth.intercept(request)?;
        }

        Ok(request)
    }
}

impl Default for CombinedInterceptor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_combined_interceptor() {
        let logging = LoggingInterceptor::new("test");
        let ratelimit = RateLimitInterceptor::new(RateLimitConfig::default());

        let interceptor = CombinedInterceptor::new()
            .with_logging(logging)
            .with_ratelimit(ratelimit);

        let request = Request::new(());
        // Should pass logging and ratelimit, but fail on auth if enabled
        let result = interceptor.intercept(request);
        assert!(result.is_ok());
    }
}
