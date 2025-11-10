//! Error types and handling for the REST API

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use std::fmt;
use thiserror::Error;

/// API error type
#[derive(Error, Debug)]
pub enum ApiError {
    #[error("Authentication failed: {0}")]
    Authentication(String),

    #[error("Authorization failed: {0}")]
    Authorization(String),

    #[error("Validation failed: {0}")]
    Validation(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Rate limit exceeded: {0}")]
    RateLimit(String),

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Internal server error: {0}")]
    Internal(String),

    #[error("Service unavailable: {0}")]
    ServiceUnavailable(String),

    #[error("Timeout: {0}")]
    Timeout(String),

    #[error("Unsupported media type: {0}")]
    UnsupportedMediaType(String),

    #[error(transparent)]
    OptimizerError(#[from] llm_optimizer_types::OptimizerError),

    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

impl ApiError {
    /// Get HTTP status code for this error
    pub fn status_code(&self) -> StatusCode {
        match self {
            ApiError::Authentication(_) => StatusCode::UNAUTHORIZED,
            ApiError::Authorization(_) => StatusCode::FORBIDDEN,
            ApiError::Validation(_) => StatusCode::BAD_REQUEST,
            ApiError::NotFound(_) => StatusCode::NOT_FOUND,
            ApiError::Conflict(_) => StatusCode::CONFLICT,
            ApiError::RateLimit(_) => StatusCode::TOO_MANY_REQUESTS,
            ApiError::BadRequest(_) => StatusCode::BAD_REQUEST,
            ApiError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
            ApiError::ServiceUnavailable(_) => StatusCode::SERVICE_UNAVAILABLE,
            ApiError::Timeout(_) => StatusCode::GATEWAY_TIMEOUT,
            ApiError::UnsupportedMediaType(_) => StatusCode::UNSUPPORTED_MEDIA_TYPE,
            ApiError::OptimizerError(e) => match e {
                llm_optimizer_types::OptimizerError::NotFound(_) => StatusCode::NOT_FOUND,
                llm_optimizer_types::OptimizerError::AlreadyExists(_) => StatusCode::CONFLICT,
                llm_optimizer_types::OptimizerError::Validation(_) => StatusCode::BAD_REQUEST,
                _ => StatusCode::INTERNAL_SERVER_ERROR,
            },
            ApiError::Other(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    /// Get error type string
    pub fn error_type(&self) -> &str {
        match self {
            ApiError::Authentication(_) => "authentication_error",
            ApiError::Authorization(_) => "authorization_error",
            ApiError::Validation(_) => "validation_error",
            ApiError::NotFound(_) => "not_found",
            ApiError::Conflict(_) => "conflict",
            ApiError::RateLimit(_) => "rate_limit_exceeded",
            ApiError::BadRequest(_) => "bad_request",
            ApiError::Internal(_) => "internal_error",
            ApiError::ServiceUnavailable(_) => "service_unavailable",
            ApiError::Timeout(_) => "timeout",
            ApiError::UnsupportedMediaType(_) => "unsupported_media_type",
            ApiError::OptimizerError(_) => "optimizer_error",
            ApiError::Other(_) => "internal_error",
        }
    }
}

/// API error response
#[derive(Debug, Serialize, Deserialize)]
pub struct ErrorResponse {
    /// Error type
    pub error: String,
    /// Error message
    pub message: String,
    /// Request ID for tracking
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
    /// Additional error details
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

impl ErrorResponse {
    /// Create a new error response
    pub fn new(error: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            error: error.into(),
            message: message.into(),
            request_id: None,
            details: None,
        }
    }

    /// Add request ID
    pub fn with_request_id(mut self, request_id: impl Into<String>) -> Self {
        self.request_id = Some(request_id.into());
        self
    }

    /// Add details
    pub fn with_details(mut self, details: serde_json::Value) -> Self {
        self.details = Some(details);
        self
    }
}

impl fmt::Display for ErrorResponse {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.error, self.message)
    }
}

// Implement IntoResponse for ApiError to enable automatic error handling
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = self.status_code();
        let error_type = self.error_type().to_string();
        let message = self.to_string();

        tracing::error!(
            error_type = %error_type,
            message = %message,
            status = %status,
            "API error occurred"
        );

        let body = ErrorResponse::new(error_type, message);

        (status, Json(body)).into_response()
    }
}

/// Result type alias for API operations
pub type ApiResult<T> = Result<T, ApiError>;

/// Validation error details
#[derive(Debug, Serialize, Deserialize)]
pub struct ValidationError {
    /// Field name
    pub field: String,
    /// Validation message
    pub message: String,
}

impl ValidationError {
    pub fn new(field: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            field: field.into(),
            message: message.into(),
        }
    }
}

/// Multiple validation errors
#[derive(Debug, Serialize, Deserialize)]
pub struct ValidationErrors {
    pub errors: Vec<ValidationError>,
}

impl ValidationErrors {
    pub fn new(errors: Vec<ValidationError>) -> Self {
        Self { errors }
    }

    pub fn single(field: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            errors: vec![ValidationError::new(field, message)],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_status_codes() {
        assert_eq!(
            ApiError::Authentication("test".into()).status_code(),
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            ApiError::NotFound("test".into()).status_code(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            ApiError::RateLimit("test".into()).status_code(),
            StatusCode::TOO_MANY_REQUESTS
        );
    }

    #[test]
    fn test_error_types() {
        assert_eq!(
            ApiError::Authentication("test".into()).error_type(),
            "authentication_error"
        );
        assert_eq!(
            ApiError::Validation("test".into()).error_type(),
            "validation_error"
        );
    }

    #[test]
    fn test_error_response_creation() {
        let resp = ErrorResponse::new("test_error", "Test message")
            .with_request_id("req-123")
            .with_details(serde_json::json!({"key": "value"}));

        assert_eq!(resp.error, "test_error");
        assert_eq!(resp.message, "Test message");
        assert_eq!(resp.request_id, Some("req-123".to_string()));
        assert!(resp.details.is_some());
    }
}
