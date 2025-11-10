//! Authentication and authorization for gRPC API

use crate::error::{ApiError, Result};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

/// JWT claims
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    /// Subject (user ID)
    pub sub: String,
    /// Expiration time (Unix timestamp)
    pub exp: u64,
    /// Issued at (Unix timestamp)
    pub iat: u64,
    /// Issuer
    pub iss: String,
    /// Roles/permissions
    pub roles: Vec<String>,
    /// Additional metadata
    #[serde(flatten)]
    pub metadata: std::collections::HashMap<String, serde_json::Value>,
}

impl Claims {
    /// Create new claims
    pub fn new(
        subject: impl Into<String>,
        issuer: impl Into<String>,
        roles: Vec<String>,
        expiration_secs: u64,
    ) -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("Time went backwards")
            .as_secs();

        Self {
            sub: subject.into(),
            exp: now + expiration_secs,
            iat: now,
            iss: issuer.into(),
            roles,
            metadata: std::collections::HashMap::new(),
        }
    }

    /// Check if token is expired
    pub fn is_expired(&self) -> bool {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("Time went backwards")
            .as_secs();

        self.exp < now
    }

    /// Check if user has role
    pub fn has_role(&self, role: &str) -> bool {
        self.roles.iter().any(|r| r == role)
    }

    /// Check if user has any of the roles
    pub fn has_any_role(&self, roles: &[&str]) -> bool {
        self.roles.iter().any(|r| roles.contains(&r.as_str()))
    }
}

/// JWT token manager
#[derive(Clone)]
pub struct TokenManager {
    encoding_key: EncodingKey,
    decoding_key: DecodingKey,
    issuer: String,
    default_expiration_secs: u64,
}

impl TokenManager {
    /// Create a new token manager with secret
    pub fn new(secret: impl AsRef<[u8]>, issuer: String) -> Self {
        Self {
            encoding_key: EncodingKey::from_secret(secret.as_ref()),
            decoding_key: DecodingKey::from_secret(secret.as_ref()),
            issuer,
            default_expiration_secs: 3600, // 1 hour default
        }
    }

    /// Set default expiration time
    pub fn with_expiration(mut self, expiration_secs: u64) -> Self {
        self.default_expiration_secs = expiration_secs;
        self
    }

    /// Generate a new token
    pub fn generate_token(
        &self,
        subject: impl Into<String>,
        roles: Vec<String>,
    ) -> Result<String> {
        let claims = Claims::new(
            subject,
            self.issuer.clone(),
            roles,
            self.default_expiration_secs,
        );

        encode(&Header::default(), &claims, &self.encoding_key)
            .map_err(|e| ApiError::Internal(format!("Failed to encode token: {}", e)))
    }

    /// Verify and decode a token
    pub fn verify_token(&self, token: &str) -> Result<Claims> {
        let mut validation = Validation::default();
        validation.set_issuer(&[&self.issuer]);

        let token_data = decode::<Claims>(token, &self.decoding_key, &validation)
            .map_err(|_| ApiError::InvalidToken)?;

        if token_data.claims.is_expired() {
            return Err(ApiError::InvalidToken);
        }

        Ok(token_data.claims)
    }
}

/// Permission levels
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Permission {
    Read,
    Write,
    Admin,
}

/// Check if claims have required permission
pub fn check_permission(claims: &Claims, required: Permission) -> Result<()> {
    match required {
        Permission::Read => {
            if claims.has_any_role(&["read", "write", "admin"]) {
                Ok(())
            } else {
                Err(ApiError::PermissionDenied("Read permission required".to_string()))
            }
        }
        Permission::Write => {
            if claims.has_any_role(&["write", "admin"]) {
                Ok(())
            } else {
                Err(ApiError::PermissionDenied("Write permission required".to_string()))
            }
        }
        Permission::Admin => {
            if claims.has_role("admin") {
                Ok(())
            } else {
                Err(ApiError::PermissionDenied("Admin permission required".to_string()))
            }
        }
    }
}

/// Extract token from metadata
pub fn extract_token_from_metadata(
    metadata: &tonic::metadata::MetadataMap,
) -> Result<String> {
    let auth_header = metadata
        .get("authorization")
        .ok_or_else(|| ApiError::Unauthenticated("Missing authorization header".to_string()))?;

    let auth_str = auth_header
        .to_str()
        .map_err(|_| ApiError::Unauthenticated("Invalid authorization header".to_string()))?;

    if let Some(token) = auth_str.strip_prefix("Bearer ") {
        Ok(token.to_string())
    } else {
        Err(ApiError::Unauthenticated("Invalid authorization format, expected 'Bearer <token>'".to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_token_generation_and_verification() {
        let manager = TokenManager::new("test-secret", "test-issuer".to_string());

        let token = manager
            .generate_token("user123", vec!["read".to_string(), "write".to_string()])
            .unwrap();

        let claims = manager.verify_token(&token).unwrap();
        assert_eq!(claims.sub, "user123");
        assert!(claims.has_role("read"));
        assert!(claims.has_role("write"));
        assert!(!claims.has_role("admin"));
    }

    #[test]
    fn test_permission_checks() {
        let claims = Claims::new(
            "user",
            "issuer",
            vec!["read".to_string(), "write".to_string()],
            3600,
        );

        assert!(check_permission(&claims, Permission::Read).is_ok());
        assert!(check_permission(&claims, Permission::Write).is_ok());
        assert!(check_permission(&claims, Permission::Admin).is_err());
    }

    #[test]
    fn test_expired_token() {
        let mut claims = Claims::new("user", "issuer", vec![], 3600);
        assert!(!claims.is_expired());

        // Set expiration to the past
        claims.exp = 0;
        assert!(claims.is_expired());
    }
}
