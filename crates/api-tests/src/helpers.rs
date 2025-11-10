//! Test helper functions

use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::fixtures::{MockUser, MOCK_JWT_SECRET};

/// JWT Claims for testing
#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: usize,
    pub role: String,
}

/// Generate a test JWT token
pub fn generate_test_jwt(user: &MockUser, expires_in_secs: u64) -> Result<String, jsonwebtoken::errors::Error> {
    let expiration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() + expires_in_secs;

    let claims = Claims {
        sub: user.id.to_string(),
        exp: expiration as usize,
        role: format!("{:?}", user.role),
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(MOCK_JWT_SECRET.as_bytes()),
    )
}

/// Verify a test JWT token
pub fn verify_test_jwt(token: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
    let validation = Validation::default();
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(MOCK_JWT_SECRET.as_bytes()),
        &validation,
    )?;
    Ok(token_data.claims)
}

/// Generate a random API key
pub fn generate_api_key() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.gen()).collect();
    hex::encode(bytes)
}

/// HTTP client builder for tests
pub fn build_test_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .expect("Failed to build HTTP client")
}

/// Create authorization header with Bearer token
pub fn bearer_auth_header(token: &str) -> (&'static str, String) {
    ("Authorization", format!("Bearer {}", token))
}

/// Create authorization header with API key
pub fn api_key_auth_header(api_key: &str) -> (&'static str, String) {
    ("X-API-Key", api_key.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fixtures::MockUser;

    #[test]
    fn test_generate_and_verify_jwt() {
        let user = MockUser::admin();
        let token = generate_test_jwt(&user, 3600).unwrap();
        let claims = verify_test_jwt(&token).unwrap();
        assert_eq!(claims.sub, user.id.to_string());
    }

    #[test]
    fn test_generate_api_key() {
        let key = generate_api_key();
        assert_eq!(key.len(), 64); // 32 bytes = 64 hex characters
    }

    #[test]
    fn test_bearer_auth_header() {
        let (name, value) = bearer_auth_header("token123");
        assert_eq!(name, "Authorization");
        assert_eq!(value, "Bearer token123");
    }

    #[test]
    fn test_api_key_auth_header() {
        let (name, value) = api_key_auth_header("key123");
        assert_eq!(name, "X-API-Key");
        assert_eq!(value, "key123");
    }
}
