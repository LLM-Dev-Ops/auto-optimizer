//! Test fixtures and mock data

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Mock API key for testing
pub const MOCK_API_KEY: &str = "test_api_key_12345";

/// Mock JWT secret for testing
pub const MOCK_JWT_SECRET: &str = "test_jwt_secret_super_secure";

/// Mock user for testing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MockUser {
    pub id: Uuid,
    pub username: String,
    pub email: String,
    pub role: UserRole,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum UserRole {
    Admin,
    User,
    ReadOnly,
}

impl MockUser {
    pub fn admin() -> Self {
        Self {
            id: Uuid::new_v4(),
            username: "admin".to_string(),
            email: "admin@example.com".to_string(),
            role: UserRole::Admin,
        }
    }

    pub fn user() -> Self {
        Self {
            id: Uuid::new_v4(),
            username: "user".to_string(),
            email: "user@example.com".to_string(),
            role: UserRole::User,
        }
    }

    pub fn readonly() -> Self {
        Self {
            id: Uuid::new_v4(),
            username: "readonly".to_string(),
            email: "readonly@example.com".to_string(),
            role: UserRole::ReadOnly,
        }
    }
}

/// Mock request data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MockRequest {
    pub id: Uuid,
    pub data: String,
}

impl MockRequest {
    pub fn new(data: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4(),
            data: data.into(),
        }
    }
}

/// Mock response data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MockResponse {
    pub id: Uuid,
    pub status: String,
    pub data: String,
}

impl MockResponse {
    pub fn success(data: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4(),
            status: "success".to_string(),
            data: data.into(),
        }
    }

    pub fn error(message: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4(),
            status: "error".to_string(),
            data: message.into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mock_users() {
        let admin = MockUser::admin();
        assert_eq!(admin.role, UserRole::Admin);

        let user = MockUser::user();
        assert_eq!(user.role, UserRole::User);

        let readonly = MockUser::readonly();
        assert_eq!(readonly.role, UserRole::ReadOnly);
    }

    #[test]
    fn test_mock_request() {
        let req = MockRequest::new("test data");
        assert_eq!(req.data, "test data");
    }

    #[test]
    fn test_mock_response() {
        let success = MockResponse::success("done");
        assert_eq!(success.status, "success");

        let error = MockResponse::error("failed");
        assert_eq!(error.status, "error");
    }
}
