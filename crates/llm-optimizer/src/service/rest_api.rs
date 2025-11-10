//! REST API service wrapper

use super::{HealthCheckResult, Service, ServiceState};
use anyhow::Result;
use async_trait::async_trait;
use llm_optimizer_api_rest::{ServerConfig, start_server};
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::task::JoinHandle;
use tracing::{info, warn};

/// REST API service configuration
#[derive(Debug, Clone)]
pub struct RestApiServiceConfig {
    /// Server configuration
    pub server_config: ServerConfig,
}

/// REST API service manages the HTTP REST API server
pub struct RestApiService {
    config: RestApiServiceConfig,
    server_handle: Arc<RwLock<Option<JoinHandle<Result<()>>>>>,
    state: Arc<RwLock<ServiceState>>,
}

impl RestApiService {
    /// Create a new REST API service
    pub fn new(config: RestApiServiceConfig) -> Self {
        Self {
            config,
            server_handle: Arc::new(RwLock::new(None)),
            state: Arc::new(RwLock::new(ServiceState::Initializing)),
        }
    }
}

#[async_trait]
impl Service for RestApiService {
    fn name(&self) -> &str {
        "rest-api"
    }

    async fn start(&mut self) -> Result<()> {
        info!("Starting REST API service on port {}", self.config.server_config.port);

        let mut state = self.state.write().await;
        *state = ServiceState::Running;
        drop(state);

        // Start the REST API server in a background task
        let config = self.config.server_config.clone();
        let handle = tokio::spawn(async move {
            start_server(config).await
        });

        let mut handle_lock = self.server_handle.write().await;
        *handle_lock = Some(handle);

        info!("REST API service started");
        Ok(())
    }

    async fn stop(&mut self) -> Result<()> {
        info!("Stopping REST API service");

        let mut state = self.state.write().await;
        *state = ServiceState::ShuttingDown;
        drop(state);

        // Abort the server task
        if let Some(handle) = self.server_handle.write().await.take() {
            handle.abort();
            // Wait for graceful shutdown
            let _ = tokio::time::timeout(
                std::time::Duration::from_secs(10),
                handle
            ).await;
        }

        let mut state = self.state.write().await;
        *state = ServiceState::Stopped;

        info!("REST API service stopped");
        Ok(())
    }

    async fn health_check(&self) -> Result<HealthCheckResult> {
        let handle_guard = self.server_handle.read().await;

        if let Some(handle) = handle_guard.as_ref() {
            if handle.is_finished() {
                Ok(HealthCheckResult::unhealthy("Server task has terminated"))
            } else {
                // Could perform HTTP health check here
                Ok(HealthCheckResult::healthy()
                    .with_metadata("port", self.config.server_config.port.to_string()))
            }
        } else {
            Ok(HealthCheckResult::unhealthy("Server not started"))
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
        // REST API depends on processor and storage
        vec!["processor".to_string(), "storage".to_string()]
    }

    async fn recover(&mut self) -> Result<()> {
        warn!("Attempting to recover REST API service");

        let _ = self.stop().await;
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        self.start().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_rest_api_service_state() {
        let config = RestApiServiceConfig {
            server_config: ServerConfig::default(),
        };

        let service = RestApiService::new(config);
        assert_eq!(service.state(), ServiceState::Initializing);
        assert_eq!(service.dependencies(), vec!["processor", "storage"]);
    }
}
