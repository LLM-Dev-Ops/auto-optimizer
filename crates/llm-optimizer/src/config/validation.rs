//! Configuration validation

use anyhow::{bail, Result};
use super::Config;

/// Configuration validator
pub struct Validator;

impl Validator {
    /// Validate the entire configuration
    pub fn validate_config(config: &Config) -> Result<()> {
        Self::validate_service(&config.service)?;
        Self::validate_collector(&config.collector)?;
        Self::validate_processor(&config.processor)?;
        Self::validate_rest_api(&config.rest_api)?;
        Self::validate_grpc_api(&config.grpc_api)?;
        Self::validate_storage(&config.storage)?;
        Self::validate_observability(&config.observability)?;

        Ok(())
    }

    /// Validate service configuration
    fn validate_service(config: &super::ServiceConfig) -> Result<()> {
        if config.name.is_empty() {
            bail!("Service name cannot be empty");
        }

        if config.version.is_empty() {
            bail!("Service version cannot be empty");
        }

        if config.environment.is_empty() {
            bail!("Service environment cannot be empty");
        }

        Ok(())
    }

    /// Validate collector configuration
    fn validate_collector(config: &super::CollectorConfig) -> Result<()> {
        if !config.enabled {
            return Ok(());
        }

        if config.kafka_brokers.is_empty() {
            bail!("Kafka brokers cannot be empty when collector is enabled");
        }

        if config.kafka_topic.is_empty() {
            bail!("Kafka topic cannot be empty");
        }

        if config.buffer_size == 0 {
            bail!("Buffer size must be greater than 0");
        }

        if config.batch_size == 0 {
            bail!("Batch size must be greater than 0");
        }

        if config.batch_size > config.buffer_size {
            bail!("Batch size cannot exceed buffer size");
        }

        Ok(())
    }

    /// Validate processor configuration
    fn validate_processor(config: &super::ProcessorConfig) -> Result<()> {
        if !config.enabled {
            return Ok(());
        }

        if config.worker_threads == 0 {
            bail!("Worker threads must be greater than 0");
        }

        if config.window_size_secs == 0 {
            bail!("Window size must be greater than 0");
        }

        Ok(())
    }

    /// Validate REST API configuration
    fn validate_rest_api(config: &super::RestApiConfig) -> Result<()> {
        if !config.enabled {
            return Ok(());
        }

        if config.port == 0 || config.port > 65535 {
            bail!("REST API port must be between 1 and 65535");
        }

        if config.timeout_secs == 0 {
            bail!("Request timeout must be greater than 0");
        }

        Ok(())
    }

    /// Validate gRPC API configuration
    fn validate_grpc_api(config: &super::GrpcApiConfig) -> Result<()> {
        if !config.enabled {
            return Ok(());
        }

        if config.port == 0 || config.port > 65535 {
            bail!("gRPC API port must be between 1 and 65535");
        }

        Ok(())
    }

    /// Validate storage configuration
    fn validate_storage(config: &super::StorageConfig) -> Result<()> {
        if config.postgres_url.is_empty() {
            bail!("PostgreSQL URL cannot be empty");
        }

        if config.redis_url.is_empty() {
            bail!("Redis URL cannot be empty");
        }

        if config.sled_path.is_empty() {
            bail!("Sled path cannot be empty");
        }

        if config.max_connections == 0 {
            bail!("Max connections must be greater than 0");
        }

        Ok(())
    }

    /// Validate observability configuration
    fn validate_observability(config: &super::ObservabilityConfig) -> Result<()> {
        let valid_log_levels = ["trace", "debug", "info", "warn", "error"];

        if !valid_log_levels.contains(&config.log_level.as_str()) {
            bail!(
                "Invalid log level: {}. Must be one of: {:?}",
                config.log_level,
                valid_log_levels
            );
        }

        if config.metrics_port == 0 || config.metrics_port > 65535 {
            bail!("Metrics port must be between 1 and 65535");
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_default_config() {
        let config = Config::default();
        assert!(Validator::validate_config(&config).is_ok());
    }

    #[test]
    fn test_validate_empty_service_name() {
        let mut config = Config::default();
        config.service.name = String::new();
        assert!(Validator::validate_config(&config).is_err());
    }

    #[test]
    fn test_validate_invalid_log_level() {
        let mut config = Config::default();
        config.observability.log_level = "invalid".to_string();
        assert!(Validator::validate_config(&config).is_err());
    }

    #[test]
    fn test_validate_invalid_port() {
        let mut config = Config::default();
        config.rest_api.port = 0;
        assert!(Validator::validate_config(&config).is_err());
    }
}
