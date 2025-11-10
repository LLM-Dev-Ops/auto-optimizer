//! Production-ready REST API for LLM Auto Optimizer
//!
//! This crate provides a comprehensive REST API implementation with:
//! - RESTful endpoint design following best practices
//! - HTTP/1.1 and HTTP/2 support
//! - JSON request/response with schema validation
//! - OpenAPI 3.0 specification with auto-generated docs
//! - Content negotiation (JSON, MessagePack)
//! - CORS support with configurable origins
//! - Compression (gzip, brotli)
//! - ETags for caching
//! - JWT and API key authentication
//! - Role-based access control (RBAC)
//! - Rate limiting (per-user, per-endpoint)
//! - Request ID generation and tracking
//! - Structured logging and tracing
//! - Error handling with detailed error responses
//! - Timeout handling
//! - Comprehensive test coverage

pub mod error;
pub mod middleware;
pub mod models;
pub mod openapi;
pub mod routes;
pub mod server;

pub use error::{ApiError, ApiResult, ErrorResponse};
pub use server::{build_app, start_server, ServerConfig};

/// Re-export commonly used types
pub mod prelude {
    pub use crate::error::{ApiError, ApiResult};
    pub use crate::middleware::{AuthConfig, AuthMethod, Claims};
    pub use crate::models::common::{ApiResponse, Pagination, PaginatedResponse};
    pub use crate::server::{build_app, start_server, ServerConfig};
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version() {
        let version = env!("CARGO_PKG_VERSION");
        assert!(!version.is_empty());
    }
}
