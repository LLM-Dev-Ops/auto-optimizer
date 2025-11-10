//! Middleware components

pub mod auth;
pub mod rbac;
pub mod ratelimit;
pub mod cors;
pub mod logging;
pub mod validation;
pub mod timeout;

pub use auth::{AuthConfig, AuthMethod, Claims};
pub use rbac::{Permission, Role, has_permission, require_admin, require_any_role};
pub use ratelimit::{RateLimitConfig, rate_limit_middleware};
pub use cors::{CorsConfig, development_cors, production_cors};
pub use logging::{RequestId, logging_middleware, metrics_middleware, request_id_middleware};
pub use validation::validate_request;
pub use timeout::timeout_middleware;
