//! Middleware tests

use llm_optimizer_api_rest::middleware::{
    ratelimit::RateLimitConfig,
    rbac::{Role, Permission, has_permission},
    auth::{AuthMethod, Claims},
};

#[test]
fn test_rate_limit_config() {
    let config = RateLimitConfig::new(10000, 1000, 100, 5000);
    assert_eq!(config.authenticated_rpm, 1000);
    assert_eq!(config.anonymous_rpm, 100);
    assert_eq!(config.api_key_rpm, 5000);
}

#[test]
fn test_permission_checking() {
    let claims = Claims::new(
        "user-123".to_string(),
        vec!["admin".to_string()],
        3600,
    );
    let auth = AuthMethod::Bearer(claims);

    assert!(has_permission(&auth, &Permission::OptimizeWrite));
    assert!(has_permission(&auth, &Permission::AdminExecute));
}

#[test]
fn test_readonly_permissions() {
    let claims = Claims::new(
        "user-123".to_string(),
        vec!["readonly".to_string()],
        3600,
    );
    let auth = AuthMethod::Bearer(claims);

    assert!(has_permission(&auth, &Permission::OptimizeRead));
    assert!(!has_permission(&auth, &Permission::OptimizeWrite));
    assert!(!has_permission(&auth, &Permission::AdminExecute));
}

#[test]
fn test_role_permissions() {
    let admin_perms = Permission::for_role(&Role::Admin);
    let user_perms = Permission::for_role(&Role::User);
    let readonly_perms = Permission::for_role(&Role::ReadOnly);

    assert!(admin_perms.len() > user_perms.len());
    assert!(user_perms.len() > readonly_perms.len());
    assert!(admin_perms.contains(&Permission::AdminExecute));
    assert!(!user_perms.contains(&Permission::AdminExecute));
}
