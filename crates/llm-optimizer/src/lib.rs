//! # LLM Auto Optimizer - Main Service Library
//!
//! Production-ready main service library providing orchestration,
//! configuration, health monitoring, and metrics for the entire
//! LLM Auto Optimizer system.
//!
//! ## Features
//!
//! - **Service Orchestration**: Manages lifecycle of all system components
//! - **Configuration Management**: Hot-reloadable configuration with validation
//! - **Health Monitoring**: Automatic health checks and recovery
//! - **Metrics Aggregation**: Prometheus-compatible metrics export
//! - **Signal Handling**: Graceful shutdown and configuration reload
//! - **Dependency Management**: Topological service startup ordering
//!
//! ## Architecture
//!
//! The main service orchestrates the following components:
//!
//! 1. **Storage Service**: PostgreSQL, Redis, and Sled backends
//! 2. **Collector Service**: Feedback collection with OpenTelemetry and Kafka
//! 3. **Processor Service**: Stream processing, analysis, and decision-making
//! 4. **REST API Service**: HTTP/1.1 and HTTP/2 REST endpoints
//! 5. **gRPC API Service**: gRPC endpoints with streaming support
//! 6. **Integrations Service**: External service integrations (Jira, Slack, GitHub, Anthropic)
//!
//! ## Example
//!
//! ```no_run
//! use llm_optimizer::config::Config;
//! use llm_optimizer::service::ServiceManager;
//!
//! # async fn example() -> anyhow::Result<()> {
//! // Load configuration
//! let config = Config::load(None)?;
//!
//! // Create service manager
//! let manager = ServiceManager::new(Default::default());
//!
//! // Add services and start
//! // ... (see main.rs for complete example)
//! # Ok(())
//! # }
//! ```

#![warn(missing_docs, clippy::all, clippy::pedantic)]
#![allow(
    clippy::module_name_repetitions,
    clippy::missing_errors_doc,
    clippy::missing_panics_doc
)]

pub mod config;
pub mod health;
pub mod metrics;
pub mod service;
pub mod signals;

// Re-export commonly used types
pub use config::Config;
pub use health::{HealthMonitor, SystemHealth};
pub use metrics::MetricsAggregator;
pub use service::{Service, ServiceManager, ServiceState};
pub use signals::{SignalHandler, SignalType};

/// Library version
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Get the library version
pub fn version() -> &'static str {
    VERSION
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version() {
        let version = version();
        assert!(!version.is_empty());
    }
}
