//! Processor service wrapper

use super::{HealthCheckResult, Service, ServiceState};
use anyhow::Result;
use async_trait::async_trait;
use llm_optimizer_processor::{StreamProcessor, StreamProcessorConfig};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, warn};

/// Processor service configuration
#[derive(Debug, Clone)]
pub struct ProcessorServiceConfig {
    /// Stream processor configuration
    pub processor_config: StreamProcessorConfig,
}

/// Processor service manages stream processing
pub struct ProcessorService {
    config: ProcessorServiceConfig,
    processor: Arc<RwLock<Option<StreamProcessor>>>,
    state: Arc<RwLock<ServiceState>>,
}

impl ProcessorService {
    /// Create a new processor service
    pub fn new(config: ProcessorServiceConfig) -> Self {
        Self {
            config,
            processor: Arc::new(RwLock::new(None)),
            state: Arc::new(RwLock::new(ServiceState::Initializing)),
        }
    }

    /// Get the processor instance
    pub async fn processor(&self) -> Option<StreamProcessor> {
        self.processor.read().await.clone()
    }
}

#[async_trait]
impl Service for ProcessorService {
    fn name(&self) -> &str {
        "processor"
    }

    async fn start(&mut self) -> Result<()> {
        info!("Starting processor service");

        let mut state = self.state.write().await;
        *state = ServiceState::Running;
        drop(state);

        // Initialize processor
        let processor = StreamProcessor::builder()
            .with_config(self.config.processor_config.clone())
            .build()
            .await?;

        let mut processor_lock = self.processor.write().await;
        *processor_lock = Some(processor);

        info!("Processor service started");
        Ok(())
    }

    async fn stop(&mut self) -> Result<()> {
        info!("Stopping processor service");

        let mut state = self.state.write().await;
        *state = ServiceState::ShuttingDown;
        drop(state);

        // Stop processor
        if let Some(processor) = self.processor.write().await.take() {
            processor.shutdown().await?;
        }

        let mut state = self.state.write().await;
        *state = ServiceState::Stopped;

        info!("Processor service stopped");
        Ok(())
    }

    async fn health_check(&self) -> Result<HealthCheckResult> {
        let processor_guard = self.processor.read().await;

        if let Some(processor) = processor_guard.as_ref() {
            // Check processor health by examining stats
            let stats = processor.stats().await;

            let healthy = stats.errors_total == 0 ||
                         (stats.events_processed > 0 &&
                          stats.errors_total as f64 / stats.events_processed as f64 < 0.01);

            if healthy {
                Ok(HealthCheckResult::healthy()
                    .with_metadata("events_processed", stats.events_processed.to_string())
                    .with_metadata("events_filtered", stats.events_filtered.to_string())
                    .with_metadata("windows_triggered", stats.windows_triggered.to_string()))
            } else {
                Ok(HealthCheckResult::unhealthy("High error rate")
                    .with_metadata("errors", stats.errors_total.to_string())
                    .with_metadata("events_processed", stats.events_processed.to_string()))
            }
        } else {
            Ok(HealthCheckResult::unhealthy("Processor not initialized"))
        }
    }

    fn state(&self) -> ServiceState {
        tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(async {
                *self.state.read().await
            })
        })
    }

    fn dependencies(&self) -> Vec<String> {
        // Processor depends on collector and storage
        vec!["collector".to_string(), "storage".to_string()]
    }

    async fn recover(&mut self) -> Result<()> {
        warn!("Attempting to recover processor service");

        let _ = self.stop().await;
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        self.start().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_processor_service_lifecycle() {
        let config = ProcessorServiceConfig {
            processor_config: StreamProcessorConfig::default(),
        };

        let mut service = ProcessorService::new(config);

        assert_eq!(service.state(), ServiceState::Initializing);
        assert_eq!(service.dependencies(), vec!["collector", "storage"]);
    }
}
