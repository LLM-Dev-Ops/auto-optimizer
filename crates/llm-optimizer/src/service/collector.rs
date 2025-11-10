//! Collector service wrapper

use super::{HealthCheckResult, Service, ServiceState};
use anyhow::Result;
use async_trait::async_trait;
use llm_optimizer_collector::{FeedbackCollector, FeedbackCollectorConfig};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, warn};

/// Collector service configuration
#[derive(Debug, Clone)]
pub struct CollectorServiceConfig {
    /// Feedback collector configuration
    pub collector_config: FeedbackCollectorConfig,
}

/// Collector service manages feedback collection
pub struct CollectorService {
    config: CollectorServiceConfig,
    collector: Arc<RwLock<Option<FeedbackCollector>>>,
    state: Arc<RwLock<ServiceState>>,
}

impl CollectorService {
    /// Create a new collector service
    pub fn new(config: CollectorServiceConfig) -> Self {
        Self {
            config,
            collector: Arc::new(RwLock::new(None)),
            state: Arc::new(RwLock::new(ServiceState::Initializing)),
        }
    }

    /// Get the collector instance
    pub async fn collector(&self) -> Option<FeedbackCollector> {
        self.collector.read().await.clone()
    }
}

#[async_trait]
impl Service for CollectorService {
    fn name(&self) -> &str {
        "collector"
    }

    async fn start(&mut self) -> Result<()> {
        info!("Starting collector service");

        let mut state = self.state.write().await;
        *state = ServiceState::Running;
        drop(state);

        // Initialize collector
        let collector = FeedbackCollector::builder()
            .with_config(self.config.collector_config.clone())
            .build()
            .await?;

        let mut collector_lock = self.collector.write().await;
        *collector_lock = Some(collector);

        info!("Collector service started");
        Ok(())
    }

    async fn stop(&mut self) -> Result<()> {
        info!("Stopping collector service");

        let mut state = self.state.write().await;
        *state = ServiceState::ShuttingDown;
        drop(state);

        // Stop collector
        if let Some(collector) = self.collector.write().await.take() {
            collector.shutdown().await?;
        }

        let mut state = self.state.write().await;
        *state = ServiceState::Stopped;

        info!("Collector service stopped");
        Ok(())
    }

    async fn health_check(&self) -> Result<HealthCheckResult> {
        let collector_guard = self.collector.read().await;

        if let Some(collector) = collector_guard.as_ref() {
            // Check collector health
            let health = collector.health_check().await?;

            if health.is_healthy() {
                Ok(HealthCheckResult::healthy()
                    .with_metadata("buffer_size", health.buffer_size.to_string())
                    .with_metadata("events_processed", health.events_processed.to_string()))
            } else {
                Ok(HealthCheckResult::unhealthy("Collector is unhealthy")
                    .with_metadata("status", format!("{:?}", health.status)))
            }
        } else {
            Ok(HealthCheckResult::unhealthy("Collector not initialized"))
        }
    }

    fn state(&self) -> ServiceState {
        // Note: This is a blocking read, which is acceptable for a quick check
        // In production, consider using a lock-free atomic or accept the blocking nature
        tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(async {
                *self.state.read().await
            })
        })
    }

    fn dependencies(&self) -> Vec<String> {
        // Collector may depend on storage for DLQ
        vec![]
    }

    async fn recover(&mut self) -> Result<()> {
        warn!("Attempting to recover collector service");

        // Try graceful restart
        let _ = self.stop().await;
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        self.start().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_collector_service_lifecycle() {
        let config = CollectorServiceConfig {
            collector_config: FeedbackCollectorConfig::default(),
        };

        let mut service = CollectorService::new(config);

        assert_eq!(service.state(), ServiceState::Initializing);

        // Start service
        assert!(service.start().await.is_ok());
        assert_eq!(service.state(), ServiceState::Running);

        // Stop service
        assert!(service.stop().await.is_ok());
        assert_eq!(service.state(), ServiceState::Stopped);
    }
}
