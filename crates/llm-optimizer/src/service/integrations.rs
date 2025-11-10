//! Integrations service wrapper

use super::{HealthCheckResult, Service, ServiceState};
use anyhow::Result;
use async_trait::async_trait;
use llm_optimizer_integrations::{AnthropicClient, JiraClient};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, warn};

/// Integration clients configuration
#[derive(Debug, Clone)]
pub struct IntegrationsServiceConfig {
    /// Jira client configuration
    pub jira_config: Option<llm_optimizer_integrations::JiraConfig>,
    /// Anthropic client configuration
    pub anthropic_config: Option<llm_optimizer_integrations::AnthropicConfig>,
}

/// Integration clients container
pub struct IntegrationClients {
    /// Jira client
    pub jira: Option<JiraClient>,
    /// Anthropic client
    pub anthropic: Option<AnthropicClient>,
}

/// Integrations service manages external service integrations
pub struct IntegrationsService {
    config: IntegrationsServiceConfig,
    clients: Arc<RwLock<Option<IntegrationClients>>>,
    state: Arc<RwLock<ServiceState>>,
}

impl IntegrationsService {
    /// Create a new integrations service
    pub fn new(config: IntegrationsServiceConfig) -> Self {
        Self {
            config,
            clients: Arc::new(RwLock::new(None)),
            state: Arc::new(RwLock::new(ServiceState::Initializing)),
        }
    }

    /// Get the integration clients
    pub async fn clients(&self) -> Option<IntegrationClients> {
        self.clients.read().await.as_ref().map(|clients| IntegrationClients {
            jira: clients.jira.clone(),
            anthropic: clients.anthropic.clone(),
        })
    }
}

#[async_trait]
impl Service for IntegrationsService {
    fn name(&self) -> &str {
        "integrations"
    }

    async fn start(&mut self) -> Result<()> {
        info!("Starting integrations service");

        let mut state = self.state.write().await;
        *state = ServiceState::Running;
        drop(state);

        // Initialize integration clients
        let jira = if let Some(ref config) = self.config.jira_config {
            Some(JiraClient::new(config.clone()).await?)
        } else {
            None
        };

        let anthropic = if let Some(ref config) = self.config.anthropic_config {
            Some(AnthropicClient::new(config.clone()).await?)
        } else {
            None
        };

        let mut clients_lock = self.clients.write().await;
        *clients_lock = Some(IntegrationClients {
            jira,
            anthropic,
        });

        info!("Integrations service started");
        Ok(())
    }

    async fn stop(&mut self) -> Result<()> {
        info!("Stopping integrations service");

        let mut state = self.state.write().await;
        *state = ServiceState::ShuttingDown;
        drop(state);

        // Clear clients
        let mut clients_lock = self.clients.write().await;
        *clients_lock = None;

        let mut state = self.state.write().await;
        *state = ServiceState::Stopped;

        info!("Integrations service stopped");
        Ok(())
    }

    async fn health_check(&self) -> Result<HealthCheckResult> {
        let clients_guard = self.clients.read().await;

        if let Some(clients) = clients_guard.as_ref() {
            let mut result = HealthCheckResult::healthy();

            if clients.jira.is_some() {
                result = result.with_metadata("jira", "configured");
            }

            if clients.anthropic.is_some() {
                result = result.with_metadata("anthropic", "configured");
            }

            Ok(result)
        } else {
            Ok(HealthCheckResult::unhealthy("Clients not initialized"))
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
        // Integrations has no dependencies
        vec![]
    }

    async fn recover(&mut self) -> Result<()> {
        warn!("Attempting to recover integrations service");

        let _ = self.stop().await;
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        self.start().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_integrations_service_state() {
        let config = IntegrationsServiceConfig {
            jira_config: None,
            anthropic_config: None,
        };

        let service = IntegrationsService::new(config);
        assert_eq!(service.state(), ServiceState::Initializing);
        assert!(service.dependencies().is_empty());
    }
}
