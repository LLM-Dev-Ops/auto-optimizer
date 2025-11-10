//! Logging and tracing interceptor for gRPC requests

use tonic::{Request, Status};
use tracing::{info, warn, Span};
use std::time::Instant;

/// Logging interceptor
#[derive(Clone)]
pub struct LoggingInterceptor {
    /// Service name for logging
    service_name: String,
}

impl LoggingInterceptor {
    /// Create a new logging interceptor
    pub fn new(service_name: impl Into<String>) -> Self {
        Self {
            service_name: service_name.into(),
        }
    }

    /// Intercept and log request
    pub fn intercept<T>(&self, request: Request<T>) -> Result<Request<T>, Status> {
        let path = request.uri().path().to_string();
        let metadata = request.metadata().clone();

        // Extract useful metadata
        let user_agent = metadata
            .get("user-agent")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("unknown");

        let request_id = metadata
            .get("x-request-id")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string())
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

        info!(
            service = %self.service_name,
            method = %path,
            user_agent = %user_agent,
            request_id = %request_id,
            "gRPC request received"
        );

        Ok(request)
    }
}

/// Create a logging span for request tracking
pub fn create_request_span(method: &str, request_id: &str) -> Span {
    tracing::info_span!(
        "grpc_request",
        method = %method,
        request_id = %request_id,
        duration_ms = tracing::field::Empty,
    )
}

/// Log request completion
pub fn log_request_complete(
    method: &str,
    request_id: &str,
    duration: std::time::Duration,
    status: Result<(), Status>,
) {
    match status {
        Ok(()) => {
            info!(
                method = %method,
                request_id = %request_id,
                duration_ms = %duration.as_millis(),
                "gRPC request completed successfully"
            );
        }
        Err(status) => {
            warn!(
                method = %method,
                request_id = %request_id,
                duration_ms = %duration.as_millis(),
                status_code = %status.code(),
                error = %status.message(),
                "gRPC request failed"
            );
        }
    }
}

/// Request timing wrapper
pub struct RequestTimer {
    start: Instant,
    method: String,
    request_id: String,
}

impl RequestTimer {
    /// Create a new request timer
    pub fn new(method: impl Into<String>, request_id: impl Into<String>) -> Self {
        Self {
            start: Instant::now(),
            method: method.into(),
            request_id: request_id.into(),
        }
    }

    /// Complete the request and log timing
    pub fn complete(self, status: Result<(), Status>) {
        let duration = self.start.elapsed();
        log_request_complete(&self.method, &self.request_id, duration, status);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_logging_interceptor() {
        let interceptor = LoggingInterceptor::new("test-service");
        let request = Request::new(());

        let result = interceptor.intercept(request);
        assert!(result.is_ok());
    }

    #[test]
    fn test_request_timer() {
        let timer = RequestTimer::new("TestMethod", "req-123");
        std::thread::sleep(std::time::Duration::from_millis(10));
        timer.complete(Ok(()));
    }
}
