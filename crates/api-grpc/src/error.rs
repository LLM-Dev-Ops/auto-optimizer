//! Error types and status code mapping for gRPC API

use thiserror::Error;
use tonic::{Code, Status};

/// API error types
#[derive(Error, Debug)]
pub enum ApiError {
    #[error("Resource not found: {0}")]
    NotFound(String),

    #[error("Invalid argument: {0}")]
    InvalidArgument(String),

    #[error("Already exists: {0}")]
    AlreadyExists(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Unauthenticated: {0}")]
    Unauthenticated(String),

    #[error("Resource exhausted: {0}")]
    ResourceExhausted(String),

    #[error("Failed precondition: {0}")]
    FailedPrecondition(String),

    #[error("Aborted: {0}")]
    Aborted(String),

    #[error("Out of range: {0}")]
    OutOfRange(String),

    #[error("Unimplemented: {0}")]
    Unimplemented(String),

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("Service unavailable: {0}")]
    Unavailable(String),

    #[error("Data loss: {0}")]
    DataLoss(String),

    #[error("Deadline exceeded: {0}")]
    DeadlineExceeded(String),

    #[error("Cancelled: {0}")]
    Cancelled(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Serialization error: {0}")]
    Serialization(String),

    #[error("Configuration error: {0}")]
    Configuration(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Rate limit exceeded")]
    RateLimitExceeded,

    #[error("Token expired or invalid")]
    InvalidToken,
}

impl From<ApiError> for Status {
    fn from(error: ApiError) -> Self {
        match error {
            ApiError::NotFound(msg) => Status::not_found(msg),
            ApiError::InvalidArgument(msg) => Status::invalid_argument(msg),
            ApiError::AlreadyExists(msg) => Status::already_exists(msg),
            ApiError::PermissionDenied(msg) => Status::permission_denied(msg),
            ApiError::Unauthenticated(msg) => Status::unauthenticated(msg),
            ApiError::ResourceExhausted(msg) => Status::resource_exhausted(msg),
            ApiError::FailedPrecondition(msg) => Status::failed_precondition(msg),
            ApiError::Aborted(msg) => Status::aborted(msg),
            ApiError::OutOfRange(msg) => Status::out_of_range(msg),
            ApiError::Unimplemented(msg) => Status::unimplemented(msg),
            ApiError::Internal(msg) => Status::internal(msg),
            ApiError::Unavailable(msg) => Status::unavailable(msg),
            ApiError::DataLoss(msg) => Status::data_loss(msg),
            ApiError::DeadlineExceeded(msg) => Status::deadline_exceeded(msg),
            ApiError::Cancelled(msg) => Status::cancelled(msg),
            ApiError::Database(msg) => Status::internal(format!("Database error: {}", msg)),
            ApiError::Serialization(msg) => Status::internal(format!("Serialization error: {}", msg)),
            ApiError::Configuration(msg) => Status::failed_precondition(format!("Configuration error: {}", msg)),
            ApiError::Validation(msg) => Status::invalid_argument(format!("Validation error: {}", msg)),
            ApiError::RateLimitExceeded => Status::resource_exhausted("Rate limit exceeded"),
            ApiError::InvalidToken => Status::unauthenticated("Token expired or invalid"),
        }
    }
}

impl From<llm_optimizer_types::OptimizerError> for ApiError {
    fn from(error: llm_optimizer_types::OptimizerError) -> Self {
        ApiError::Internal(error.to_string())
    }
}

impl From<serde_json::Error> for ApiError {
    fn from(error: serde_json::Error) -> Self {
        ApiError::Serialization(error.to_string())
    }
}

impl From<uuid::Error> for ApiError {
    fn from(error: uuid::Error) -> Self {
        ApiError::InvalidArgument(format!("Invalid UUID: {}", error))
    }
}

/// Result type for API operations
pub type Result<T> = std::result::Result<T, ApiError>;

/// Helper trait to convert Results to Status
pub trait IntoStatus<T> {
    fn into_status(self) -> std::result::Result<T, Status>;
}

impl<T> IntoStatus<T> for Result<T> {
    fn into_status(self) -> std::result::Result<T, Status> {
        self.map_err(|e| e.into())
    }
}

/// Create a not found error
pub fn not_found(resource: impl Into<String>) -> ApiError {
    ApiError::NotFound(resource.into())
}

/// Create an invalid argument error
pub fn invalid_argument(msg: impl Into<String>) -> ApiError {
    ApiError::InvalidArgument(msg.into())
}

/// Create an internal error
pub fn internal(msg: impl Into<String>) -> ApiError {
    ApiError::Internal(msg.into())
}

/// Create a validation error
pub fn validation(msg: impl Into<String>) -> ApiError {
    ApiError::Validation(msg.into())
}

/// Create a permission denied error
pub fn permission_denied(msg: impl Into<String>) -> ApiError {
    ApiError::PermissionDenied(msg.into())
}

/// Create an unauthenticated error
pub fn unauthenticated(msg: impl Into<String>) -> ApiError {
    ApiError::Unauthenticated(msg.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_to_status_mapping() {
        let error = ApiError::NotFound("resource".to_string());
        let status: Status = error.into();
        assert_eq!(status.code(), Code::NotFound);

        let error = ApiError::InvalidArgument("bad arg".to_string());
        let status: Status = error.into();
        assert_eq!(status.code(), Code::InvalidArgument);

        let error = ApiError::RateLimitExceeded;
        let status: Status = error.into();
        assert_eq!(status.code(), Code::ResourceExhausted);
    }

    #[test]
    fn test_helper_functions() {
        let err = not_found("test");
        assert!(matches!(err, ApiError::NotFound(_)));

        let err = invalid_argument("test");
        assert!(matches!(err, ApiError::InvalidArgument(_)));

        let err = internal("test");
        assert!(matches!(err, ApiError::Internal(_)));
    }
}
