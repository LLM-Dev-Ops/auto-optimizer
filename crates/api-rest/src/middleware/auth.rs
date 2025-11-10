//! Authentication middleware

use axum::{
    extract::{Request, State},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::Response,
};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

use crate::error::{ApiError, ApiResult};

/// JWT claims structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    /// Subject (user ID)
    pub sub: String,
    /// Issued at
    pub iat: u64,
    /// Expiration time
    pub exp: u64,
    /// JWT ID
    pub jti: String,
    /// User roles
    pub roles: Vec<String>,
    /// Additional metadata
    #[serde(flatten)]
    pub metadata: std::collections::HashMap<String, serde_json::Value>,
}

impl Claims {
    /// Create new claims
    pub fn new(user_id: String, roles: Vec<String>, ttl_seconds: u64) -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        Self {
            sub: user_id,
            iat: now,
            exp: now + ttl_seconds,
            jti: Uuid::new_v4().to_string(),
            roles,
            metadata: std::collections::HashMap::new(),
        }
    }

    /// Check if token is expired
    pub fn is_expired(&self) -> bool {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        self.exp <= now
    }

    /// Check if user has a specific role
    pub fn has_role(&self, role: &str) -> bool {
        self.roles.iter().any(|r| r == role)
    }

    /// Check if user has any of the specified roles
    pub fn has_any_role(&self, roles: &[&str]) -> bool {
        roles.iter().any(|role| self.has_role(role))
    }
}

/// Authentication configuration
#[derive(Clone)]
pub struct AuthConfig {
    /// JWT secret key
    pub jwt_secret: String,
    /// Token TTL in seconds
    pub token_ttl: u64,
    /// Refresh token TTL in seconds
    pub refresh_token_ttl: u64,
    /// Valid API keys
    pub api_keys: Arc<std::collections::HashSet<String>>,
}

impl AuthConfig {
    /// Create a new auth config
    pub fn new(jwt_secret: String) -> Self {
        Self {
            jwt_secret,
            token_ttl: 3600, // 1 hour
            refresh_token_ttl: 604800, // 7 days
            api_keys: Arc::new(std::collections::HashSet::new()),
        }
    }

    /// Add an API key
    pub fn with_api_key(mut self, api_key: String) -> Self {
        Arc::make_mut(&mut self.api_keys).insert(api_key);
        self
    }

    /// Generate a JWT token
    pub fn generate_token(&self, claims: &Claims) -> ApiResult<String> {
        let encoding_key = EncodingKey::from_secret(self.jwt_secret.as_bytes());
        encode(&Header::default(), claims, &encoding_key)
            .map_err(|e| ApiError::Internal(format!("Failed to generate token: {}", e)))
    }

    /// Verify and decode a JWT token
    pub fn verify_token(&self, token: &str) -> ApiResult<Claims> {
        let decoding_key = DecodingKey::from_secret(self.jwt_secret.as_bytes());
        let validation = Validation::default();

        decode::<Claims>(token, &decoding_key, &validation)
            .map(|data| data.claims)
            .map_err(|e| ApiError::Authentication(format!("Invalid token: {}", e)))
    }

    /// Verify an API key
    pub fn verify_api_key(&self, api_key: &str) -> bool {
        self.api_keys.contains(api_key)
    }
}

/// Authentication method
#[derive(Debug, Clone)]
pub enum AuthMethod {
    /// JWT bearer token
    Bearer(Claims),
    /// API key
    ApiKey(String),
}

impl AuthMethod {
    /// Get user ID
    pub fn user_id(&self) -> String {
        match self {
            AuthMethod::Bearer(claims) => claims.sub.clone(),
            AuthMethod::ApiKey(key) => format!("api_key:{}", &key[..8]),
        }
    }

    /// Get roles
    pub fn roles(&self) -> Vec<String> {
        match self {
            AuthMethod::Bearer(claims) => claims.roles.clone(),
            AuthMethod::ApiKey(_) => vec!["api_user".to_string()],
        }
    }

    /// Check if has role
    pub fn has_role(&self, role: &str) -> bool {
        self.roles().iter().any(|r| r == role)
    }
}

/// Extract authentication from headers
fn extract_auth(headers: &HeaderMap, config: &AuthConfig) -> ApiResult<AuthMethod> {
    // Try Bearer token first
    if let Some(auth_header) = headers.get("authorization") {
        let auth_str = auth_header
            .to_str()
            .map_err(|_| ApiError::Authentication("Invalid authorization header".into()))?;

        if let Some(token) = auth_str.strip_prefix("Bearer ") {
            let claims = config.verify_token(token)?;
            if claims.is_expired() {
                return Err(ApiError::Authentication("Token expired".into()));
            }
            return Ok(AuthMethod::Bearer(claims));
        }
    }

    // Try API key
    if let Some(api_key) = headers.get("x-api-key") {
        let key = api_key
            .to_str()
            .map_err(|_| ApiError::Authentication("Invalid API key header".into()))?;

        if config.verify_api_key(key) {
            return Ok(AuthMethod::ApiKey(key.to_string()));
        } else {
            return Err(ApiError::Authentication("Invalid API key".into()));
        }
    }

    Err(ApiError::Authentication(
        "No authentication credentials provided".into(),
    ))
}

/// Authentication middleware
pub async fn auth_middleware(
    State(config): State<Arc<AuthConfig>>,
    mut request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let auth = extract_auth(request.headers(), &config)?;

    // Store auth method in request extensions for use in handlers
    request.extensions_mut().insert(auth);

    Ok(next.run(request).await)
}

/// Optional authentication middleware (doesn't fail if no auth)
pub async fn optional_auth_middleware(
    State(config): State<Arc<AuthConfig>>,
    mut request: Request,
    next: Next,
) -> Response {
    if let Ok(auth) = extract_auth(request.headers(), &config) {
        request.extensions_mut().insert(auth);
    }

    next.run(request).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_claims_creation() {
        let claims = Claims::new("user-123".to_string(), vec!["admin".to_string()], 3600);

        assert_eq!(claims.sub, "user-123");
        assert!(claims.has_role("admin"));
        assert!(!claims.has_role("user"));
        assert!(!claims.is_expired());
    }

    #[test]
    fn test_token_generation_and_verification() {
        let config = AuthConfig::new("test-secret-key".to_string());
        let claims = Claims::new("user-123".to_string(), vec!["admin".to_string()], 3600);

        let token = config.generate_token(&claims).unwrap();
        let verified = config.verify_token(&token).unwrap();

        assert_eq!(verified.sub, claims.sub);
        assert_eq!(verified.roles, claims.roles);
    }

    #[test]
    fn test_api_key_verification() {
        let config = AuthConfig::new("test-secret".to_string())
            .with_api_key("test-api-key-123".to_string());

        assert!(config.verify_api_key("test-api-key-123"));
        assert!(!config.verify_api_key("invalid-key"));
    }

    #[test]
    fn test_expired_token() {
        let mut claims = Claims::new("user-123".to_string(), vec![], 0);
        claims.exp = 1000; // Set to past timestamp

        assert!(claims.is_expired());
    }
}
