//! Storage service wrapper

use super::{HealthCheckResult, Service, ServiceState};
use anyhow::Result;
use async_trait::async_trait;
use llm_optimizer_processor::{StorageManager, StorageConfig};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, warn};

/// Storage service configuration
#[derive(Debug, Clone)]
pub struct StorageServiceConfig {
    /// Storage manager configuration
    pub storage_config: StorageConfig,
}

/// Storage service manages all storage backends
pub struct StorageService {
    config: StorageServiceConfig,
    storage: Arc<RwLock<Option<StorageManager>>>,
    state: Arc<RwLock<ServiceState>>,
}

impl StorageService {
    /// Create a new storage service
    pub fn new(config: StorageServiceConfig) -> Self {
        Self {
            config,
            storage: Arc::new(RwLock::new(None)),
            state: Arc::new(RwLock::new(ServiceState::Initializing)),
        }
    }

    /// Get the storage manager instance
    pub async fn storage(&self) -> Option<StorageManager> {
        self.storage.read().await.clone()
    }
}

#[async_trait]
impl Service for StorageService {
    fn name(&self) -> &str {
        "storage"
    }

    async fn start(&mut self) -> Result<()> {
        info!("Starting storage service");

        let mut state = self.state.write().await;
        *state = ServiceState::Running;
        drop(state);

        // Initialize storage manager
        let storage = StorageManager::new(self.config.storage_config.clone()).await?;

        let mut storage_lock = self.storage.write().await;
        *storage_lock = Some(storage);

        info!("Storage service started");
        Ok(())
    }

    async fn stop(&mut self) -> Result<()> {
        info!("Stopping storage service");

        let mut state = self.state.write().await;
        *state = ServiceState::ShuttingDown;
        drop(state);

        // Stop storage manager
        if let Some(storage) = self.storage.write().await.take() {
            storage.shutdown().await?;
        }

        let mut state = self.state.write().await;
        *state = ServiceState::Stopped;

        info!("Storage service stopped");
        Ok(())
    }

    async fn health_check(&self) -> Result<HealthCheckResult> {
        let storage_guard = self.storage.read().await;

        if let Some(storage) = storage_guard.as_ref() {
            // Check storage health
            let health = storage.health_check().await?;

            if health.is_healthy() {
                Ok(HealthCheckResult::healthy()
                    .with_metadata("backends", health.backends.len().to_string()))
            } else {
                Ok(HealthCheckResult::unhealthy("Storage is unhealthy")
                    .with_metadata("status", format!("{:?}", health)))
            }
        } else {
            Ok(HealthCheckResult::unhealthy("Storage not initialized"))
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
        // Storage has no dependencies
        vec![]
    }

    async fn recover(&mut self) -> Result<()> {
        warn!("Attempting to recover storage service");

        let _ = self.stop().await;
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        self.start().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_storage_service_state() {
        let config = StorageServiceConfig {
            storage_config: StorageConfig::default(),
        };

        let service = StorageService::new(config);
        assert_eq!(service.state(), ServiceState::Initializing);
        assert!(service.dependencies().is_empty());
    }
}
