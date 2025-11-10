//! Configuration management for the main service
//!
//! This module handles loading, validation, and hot-reloading of configuration.

use anyhow::{Context, Result};
use figment::{
    providers::{Env, Format, Toml, Yaml},
    Figment,
};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;
use notify::{Watcher, RecursiveMode, Event};
use tracing::{info, warn, error};

pub mod defaults;
pub mod validation;

pub use defaults::Defaults;
pub use validation::Validator;

/// Main service configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    /// Service metadata
    pub service: ServiceConfig,

    /// Collector service configuration
    pub collector: CollectorConfig,

    /// Processor service configuration
    pub processor: ProcessorConfig,

    /// REST API configuration
    pub rest_api: RestApiConfig,

    /// gRPC API configuration
    pub grpc_api: GrpcApiConfig,

    /// Storage configuration
    pub storage: StorageConfig,

    /// Integrations configuration
    pub integrations: IntegrationsConfig,

    /// Observability configuration
    pub observability: ObservabilityConfig,
}

impl Config {
    /// Load configuration from file and environment variables
    pub fn load(config_path: Option<PathBuf>) -> Result<Self> {
        let mut figment = Figment::new();

        // Start with defaults
        figment = figment.merge(Defaults::provider());

        // Load from file if provided
        if let Some(path) = config_path.as_ref() {
            if path.extension().and_then(|s| s.to_str()) == Some("toml") {
                figment = figment.merge(Toml::file(path));
            } else if path.extension().and_then(|s| s.to_str()) == Some("yaml")
                || path.extension().and_then(|s| s.to_str()) == Some("yml")
            {
                figment = figment.merge(Yaml::file(path));
            } else {
                anyhow::bail!("Unsupported configuration file format");
            }
        }

        // Override with environment variables (prefixed with LLM_OPTIMIZER_)
        figment = figment.merge(Env::prefixed("LLM_OPTIMIZER_").split("__"));

        let config: Config = figment
            .extract()
            .context("Failed to extract configuration")?;

        // Validate configuration
        config.validate()?;

        Ok(config)
    }

    /// Validate the configuration
    pub fn validate(&self) -> Result<()> {
        Validator::validate_config(self)
    }

    /// Reload configuration from file
    pub async fn reload(&mut self, config_path: &Path) -> Result<()> {
        info!("Reloading configuration from {:?}", config_path);

        let new_config = Self::load(Some(config_path.to_path_buf()))?;

        // Update configuration
        *self = new_config;

        info!("Configuration reloaded successfully");
        Ok(())
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            service: ServiceConfig::default(),
            collector: CollectorConfig::default(),
            processor: ProcessorConfig::default(),
            rest_api: RestApiConfig::default(),
            grpc_api: GrpcApiConfig::default(),
            storage: StorageConfig::default(),
            integrations: IntegrationsConfig::default(),
            observability: ObservabilityConfig::default(),
        }
    }
}

/// Service metadata configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceConfig {
    /// Service name
    pub name: String,
    /// Service version
    pub version: String,
    /// Service environment (dev, staging, production)
    pub environment: String,
    /// Service host
    pub host: String,
}

impl Default for ServiceConfig {
    fn default() -> Self {
        Self {
            name: "llm-optimizer".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            environment: "development".to_string(),
            host: "0.0.0.0".to_string(),
        }
    }
}

/// Collector service configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectorConfig {
    /// Enable collector service
    pub enabled: bool,
    /// Kafka brokers
    pub kafka_brokers: Vec<String>,
    /// Kafka topic
    pub kafka_topic: String,
    /// Buffer size
    pub buffer_size: usize,
    /// Batch size
    pub batch_size: usize,
}

impl Default for CollectorConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            kafka_brokers: vec!["localhost:9092".to_string()],
            kafka_topic: "llm-feedback".to_string(),
            buffer_size: 10000,
            batch_size: 100,
        }
    }
}

/// Processor service configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessorConfig {
    /// Enable processor service
    pub enabled: bool,
    /// Number of worker threads
    pub worker_threads: usize,
    /// Window size in seconds
    pub window_size_secs: u64,
}

impl Default for ProcessorConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            worker_threads: 4,
            window_size_secs: 300, // 5 minutes
        }
    }
}

/// REST API configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestApiConfig {
    /// Enable REST API
    pub enabled: bool,
    /// REST API port
    pub port: u16,
    /// Enable TLS
    pub enable_tls: bool,
    /// Request timeout in seconds
    pub timeout_secs: u64,
}

impl Default for RestApiConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            port: 8080,
            enable_tls: false,
            timeout_secs: 30,
        }
    }
}

/// gRPC API configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrpcApiConfig {
    /// Enable gRPC API
    pub enabled: bool,
    /// gRPC port
    pub port: u16,
    /// Enable TLS
    pub enable_tls: bool,
}

impl Default for GrpcApiConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            port: 50051,
            enable_tls: false,
        }
    }
}

/// Storage configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageConfig {
    /// PostgreSQL connection string
    pub postgres_url: String,
    /// Redis connection string
    pub redis_url: String,
    /// Sled database path
    pub sled_path: String,
    /// Maximum connections
    pub max_connections: u32,
}

impl Default for StorageConfig {
    fn default() -> Self {
        Self {
            postgres_url: "postgres://localhost:5432/llm_optimizer".to_string(),
            redis_url: "redis://localhost:6379".to_string(),
            sled_path: "./data/sled".to_string(),
            max_connections: 10,
        }
    }
}

/// Integrations configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntegrationsConfig {
    /// Jira configuration
    pub jira: Option<JiraConfig>,
    /// Anthropic configuration
    pub anthropic: Option<AnthropicConfig>,
    /// Slack webhook URL
    pub slack_webhook_url: Option<String>,
    /// GitHub API token
    pub github_token: Option<String>,
}

impl Default for IntegrationsConfig {
    fn default() -> Self {
        Self {
            jira: None,
            anthropic: None,
            slack_webhook_url: None,
            github_token: None,
        }
    }
}

/// Jira integration configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraConfig {
    /// Jira base URL
    pub base_url: String,
    /// Jira email
    pub email: String,
    /// Jira API token
    pub api_token: String,
}

/// Anthropic integration configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnthropicConfig {
    /// Anthropic API key
    pub api_key: String,
    /// API base URL
    pub base_url: Option<String>,
}

/// Observability configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObservabilityConfig {
    /// Log level (trace, debug, info, warn, error)
    pub log_level: String,
    /// Enable JSON logging
    pub json_logging: bool,
    /// OpenTelemetry endpoint
    pub otel_endpoint: Option<String>,
    /// Metrics export port
    pub metrics_port: u16,
}

impl Default for ObservabilityConfig {
    fn default() -> Self {
        Self {
            log_level: "info".to_string(),
            json_logging: false,
            otel_endpoint: None,
            metrics_port: 9090,
        }
    }
}

/// Configuration watcher for hot-reloading
pub struct ConfigWatcher {
    config: Arc<RwLock<Config>>,
    config_path: PathBuf,
    _watcher: Option<Box<dyn Watcher>>,
}

impl ConfigWatcher {
    /// Create a new configuration watcher
    pub fn new(config: Config, config_path: PathBuf) -> Self {
        Self {
            config: Arc::new(RwLock::new(config)),
            config_path,
            _watcher: None,
        }
    }

    /// Start watching for configuration changes
    pub async fn start(&mut self) -> Result<()> {
        let config = Arc::clone(&self.config);
        let config_path = self.config_path.clone();

        let (tx, mut rx) = tokio::sync::mpsc::channel(100);

        // Create file watcher
        let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                let _ = tx.blocking_send(event);
            }
        })?;

        watcher.watch(&self.config_path, RecursiveMode::NonRecursive)?;

        // Spawn task to handle file change events
        tokio::spawn(async move {
            while let Some(_event) = rx.recv().await {
                info!("Configuration file changed, reloading...");

                let mut config_guard = config.write().await;
                match config_guard.reload(&config_path).await {
                    Ok(()) => {
                        info!("Configuration reloaded successfully");
                    }
                    Err(e) => {
                        error!("Failed to reload configuration: {}", e);
                    }
                }
            }
        });

        self._watcher = Some(Box::new(watcher));

        Ok(())
    }

    /// Get a clone of the current configuration
    pub async fn get_config(&self) -> Config {
        self.config.read().await.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = Config::default();
        assert_eq!(config.service.name, "llm-optimizer");
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_config_serialization() {
        let config = Config::default();
        let yaml = serde_yaml::to_string(&config).unwrap();
        assert!(!yaml.is_empty());
    }
}
