//! Role-Based Access Control (RBAC) middleware

use axum::{
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::Response,
};

use crate::error::ApiError;
use crate::middleware::auth::AuthMethod;

/// Role definition
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Role {
    Admin,
    User,
    ReadOnly,
    ApiUser,
}

impl Role {
    /// Convert string to role
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "admin" => Some(Role::Admin),
            "user" => Some(Role::User),
            "readonly" | "read_only" => Some(Role::ReadOnly),
            "api_user" => Some(Role::ApiUser),
            _ => None,
        }
    }

    /// Convert role to string
    pub fn as_str(&self) -> &str {
        match self {
            Role::Admin => "admin",
            Role::User => "user",
            Role::ReadOnly => "readonly",
            Role::ApiUser => "api_user",
        }
    }
}

/// Permission definition
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Permission {
    // Optimization permissions
    OptimizeRead,
    OptimizeWrite,
    OptimizeExecute,

    // Configuration permissions
    ConfigRead,
    ConfigWrite,

    // Metrics permissions
    MetricsRead,
    MetricsWrite,

    // Integration permissions
    IntegrationRead,
    IntegrationWrite,
    IntegrationDelete,

    // Admin permissions
    AdminRead,
    AdminWrite,
    AdminExecute,

    // System permissions
    SystemHealth,
}

impl Permission {
    /// Get permissions for a role
    pub fn for_role(role: &Role) -> Vec<Permission> {
        match role {
            Role::Admin => vec![
                Permission::OptimizeRead,
                Permission::OptimizeWrite,
                Permission::OptimizeExecute,
                Permission::ConfigRead,
                Permission::ConfigWrite,
                Permission::MetricsRead,
                Permission::MetricsWrite,
                Permission::IntegrationRead,
                Permission::IntegrationWrite,
                Permission::IntegrationDelete,
                Permission::AdminRead,
                Permission::AdminWrite,
                Permission::AdminExecute,
                Permission::SystemHealth,
            ],
            Role::User => vec![
                Permission::OptimizeRead,
                Permission::OptimizeWrite,
                Permission::OptimizeExecute,
                Permission::ConfigRead,
                Permission::MetricsRead,
                Permission::IntegrationRead,
                Permission::SystemHealth,
            ],
            Role::ReadOnly => vec![
                Permission::OptimizeRead,
                Permission::ConfigRead,
                Permission::MetricsRead,
                Permission::IntegrationRead,
                Permission::SystemHealth,
            ],
            Role::ApiUser => vec![
                Permission::OptimizeRead,
                Permission::OptimizeWrite,
                Permission::OptimizeExecute,
                Permission::ConfigRead,
                Permission::MetricsRead,
                Permission::SystemHealth,
            ],
        }
    }
}

/// Check if auth method has required permission
pub fn has_permission(auth: &AuthMethod, permission: &Permission) -> bool {
    let roles = auth.roles();

    for role_str in &roles {
        if let Some(role) = Role::from_str(role_str) {
            let permissions = Permission::for_role(&role);
            if permissions.contains(permission) {
                return true;
            }
        }
    }

    false
}

/// Require specific permission
pub async fn require_permission(
    permission: Permission,
) -> impl FnMut(Request, Next) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Response, ApiError>> + Send>>
{
    move |request: Request, next: Next| {
        let perm = permission.clone();
        Box::pin(async move {
            let auth = request
                .extensions()
                .get::<AuthMethod>()
                .ok_or_else(|| ApiError::Authentication("Not authenticated".into()))?;

            if !has_permission(auth, &perm) {
                return Err(ApiError::Authorization(format!(
                    "Missing required permission: {:?}",
                    perm
                )));
            }

            Ok(next.run(request).await)
        })
    }
}

/// Require any of the specified roles
pub async fn require_any_role(
    required_roles: Vec<String>,
    mut request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let auth = request
        .extensions()
        .get::<AuthMethod>()
        .ok_or_else(|| ApiError::Authentication("Not authenticated".into()))?;

    let user_roles = auth.roles();
    let has_role = required_roles
        .iter()
        .any(|required| user_roles.iter().any(|user_role| user_role == required));

    if !has_role {
        return Err(ApiError::Authorization(format!(
            "Missing required role. Need one of: {:?}",
            required_roles
        )));
    }

    Ok(next.run(request).await)
}

/// Require admin role
pub async fn require_admin(mut request: Request, next: Next) -> Result<Response, ApiError> {
    require_any_role(vec!["admin".to_string()], request, next).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::middleware::auth::Claims;

    #[test]
    fn test_role_from_str() {
        assert_eq!(Role::from_str("admin"), Some(Role::Admin));
        assert_eq!(Role::from_str("user"), Some(Role::User));
        assert_eq!(Role::from_str("readonly"), Some(Role::ReadOnly));
        assert_eq!(Role::from_str("invalid"), None);
    }

    #[test]
    fn test_admin_permissions() {
        let permissions = Permission::for_role(&Role::Admin);
        assert!(permissions.contains(&Permission::OptimizeWrite));
        assert!(permissions.contains(&Permission::AdminExecute));
        assert!(permissions.contains(&Permission::IntegrationDelete));
    }

    #[test]
    fn test_readonly_permissions() {
        let permissions = Permission::for_role(&Role::ReadOnly);
        assert!(permissions.contains(&Permission::OptimizeRead));
        assert!(!permissions.contains(&Permission::OptimizeWrite));
        assert!(!permissions.contains(&Permission::AdminExecute));
    }

    #[test]
    fn test_has_permission() {
        let claims = Claims::new("user-123".to_string(), vec!["admin".to_string()], 3600);
        let auth = AuthMethod::Bearer(claims);

        assert!(has_permission(&auth, &Permission::OptimizeWrite));
        assert!(has_permission(&auth, &Permission::AdminExecute));
    }

    #[test]
    fn test_user_without_permission() {
        let claims = Claims::new("user-123".to_string(), vec!["readonly".to_string()], 3600);
        let auth = AuthMethod::Bearer(claims);

        assert!(has_permission(&auth, &Permission::OptimizeRead));
        assert!(!has_permission(&auth, &Permission::OptimizeWrite));
        assert!(!has_permission(&auth, &Permission::AdminExecute));
    }
}
