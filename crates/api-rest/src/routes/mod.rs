//! API route handlers

pub mod optimize;
pub mod config;
pub mod metrics;
pub mod integrations;
pub mod health;
pub mod admin;

pub use optimize::optimize_routes;
pub use config::config_routes;
pub use metrics::metrics_routes;
pub use integrations::integrations_routes;
pub use health::health_routes;
pub use admin::admin_routes;
