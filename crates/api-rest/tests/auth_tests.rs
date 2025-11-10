//! Authentication tests

use llm_optimizer_api_rest::middleware::{AuthConfig, Claims};

#[test]
fn test_jwt_generation_and_verification() {
    let config = AuthConfig::new("test-secret-key".to_string());
    let claims = Claims::new(
        "user-123".to_string(),
        vec!["admin".to_string()],
        3600,
    );

    let token = config.generate_token(&claims).unwrap();
    assert!(!token.is_empty());

    let verified = config.verify_token(&token).unwrap();
    assert_eq!(verified.sub, "user-123");
    assert!(verified.has_role("admin"));
}

#[test]
fn test_expired_token_detection() {
    let mut claims = Claims::new(
        "user-123".to_string(),
        vec!["user".to_string()],
        0,
    );
    claims.exp = 1000; // Set to past timestamp

    assert!(claims.is_expired());
}

#[test]
fn test_api_key_verification() {
    let config = AuthConfig::new("test-secret".to_string())
        .with_api_key("test-api-key-123".to_string());

    assert!(config.verify_api_key("test-api-key-123"));
    assert!(!config.verify_api_key("invalid-key"));
}

#[test]
fn test_role_checking() {
    let claims = Claims::new(
        "user-123".to_string(),
        vec!["admin".to_string(), "user".to_string()],
        3600,
    );

    assert!(claims.has_role("admin"));
    assert!(claims.has_role("user"));
    assert!(!claims.has_role("superadmin"));
    assert!(claims.has_any_role(&["admin", "moderator"]));
}
