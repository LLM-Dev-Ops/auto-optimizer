//! Request validation middleware

use axum::{
    body::Body,
    extract::Request,
    middleware::Next,
    response::Response,
};
use validator::Validate;

use crate::error::ApiError;

/// Validate a request body
pub async fn validate_request<T: Validate>(data: &T) -> Result<(), ApiError> {
    data.validate()
        .map_err(|e| ApiError::Validation(format!("Validation failed: {}", e)))
}

/// Content-Type validation
pub fn validate_content_type(
    request: &Request,
    expected: &[&str],
) -> Result<(), ApiError> {
    if let Some(content_type) = request.headers().get("content-type") {
        let ct = content_type
            .to_str()
            .map_err(|_| ApiError::BadRequest("Invalid Content-Type header".into()))?;

        // Check if content type matches any expected type
        let matches = expected.iter().any(|&exp| ct.starts_with(exp));

        if !matches {
            return Err(ApiError::UnsupportedMediaType(format!(
                "Expected Content-Type to be one of: {}. Got: {}",
                expected.join(", "),
                ct
            )));
        }
    }

    Ok(())
}

/// Size limit validation
pub fn validate_size_limit(size: usize, max_size: usize) -> Result<(), ApiError> {
    if size > max_size {
        return Err(ApiError::BadRequest(format!(
            "Request body too large. Max size: {} bytes, received: {} bytes",
            max_size, size
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use validator::Validate;

    #[derive(Validate)]
    struct TestData {
        #[validate(length(min = 1, max = 100))]
        name: String,
        #[validate(range(min = 0, max = 100))]
        age: i32,
    }

    #[tokio::test]
    async fn test_valid_data() {
        let data = TestData {
            name: "John".to_string(),
            age: 30,
        };

        assert!(validate_request(&data).await.is_ok());
    }

    #[tokio::test]
    async fn test_invalid_data() {
        let data = TestData {
            name: "".to_string(),
            age: 150,
        };

        assert!(validate_request(&data).await.is_err());
    }

    #[test]
    fn test_size_limit_validation() {
        assert!(validate_size_limit(100, 1000).is_ok());
        assert!(validate_size_limit(2000, 1000).is_err());
    }
}
