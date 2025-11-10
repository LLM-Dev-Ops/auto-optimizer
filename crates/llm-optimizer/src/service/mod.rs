//! Service management and orchestration
//!
//! This module provides the core service trait and service manager for orchestrating
//! all components of the LLM Auto Optimizer system.

use anyhow::Result;
use async_trait::async_trait;
use std::fmt;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{broadcast, RwLock};
use tokio::time::{interval, sleep};
use tracing::{debug, error, info, warn};

pub mod collector;
pub mod processor;
pub mod rest_api;
pub mod grpc_api;
pub mod storage;
pub mod integrations;

pub use collector::CollectorService;
pub use processor::ProcessorService;
pub use rest_api::RestApiService;
pub use grpc_api::GrpcApiService;
pub use storage::StorageService;
pub use integrations::IntegrationsService;

/// Service lifecycle states
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ServiceState {
    /// Service is initializing
    Initializing,
    /// Service is running normally
    Running,
    /// Service is degraded but operational
    Degraded,
    /// Service is shutting down gracefully
    ShuttingDown,
    /// Service has stopped
    Stopped,
    /// Service has failed
    Failed,
}

impl fmt::Display for ServiceState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Initializing => write!(f, "Initializing"),
            Self::Running => write!(f, "Running"),
            Self::Degraded => write!(f, "Degraded"),
            Self::ShuttingDown => write!(f, "ShuttingDown"),
            Self::Stopped => write!(f, "Stopped"),
            Self::Failed => write!(f, "Failed"),
        }
    }
}

/// Health check result
#[derive(Debug, Clone)]
pub struct HealthCheckResult {
    /// Service is healthy
    pub healthy: bool,
    /// Optional message
    pub message: Option<String>,
    /// Additional metadata
    pub metadata: std::collections::HashMap<String, String>,
}

impl HealthCheckResult {
    /// Create a healthy result
    pub fn healthy() -> Self {
        Self {
            healthy: true,
            message: None,
            metadata: std::collections::HashMap::new(),
        }
    }

    /// Create an unhealthy result
    pub fn unhealthy(message: impl Into<String>) -> Self {
        Self {
            healthy: false,
            message: Some(message.into()),
            metadata: std::collections::HashMap::new(),
        }
    }

    /// Add metadata
    pub fn with_metadata(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.metadata.insert(key.into(), value.into());
        self
    }
}

/// Core service trait that all services must implement
#[async_trait]
pub trait Service: Send + Sync {
    /// Service name
    fn name(&self) -> &str;

    /// Start the service
    async fn start(&mut self) -> Result<()>;

    /// Stop the service gracefully
    async fn stop(&mut self) -> Result<()>;

    /// Check service health
    async fn health_check(&self) -> Result<HealthCheckResult>;

    /// Get current service state
    fn state(&self) -> ServiceState;

    /// Check if service requires other services to start first
    fn dependencies(&self) -> Vec<String> {
        Vec::new()
    }

    /// Attempt to recover from a failure
    async fn recover(&mut self) -> Result<()> {
        warn!("Service {} does not implement custom recovery", self.name());
        self.stop().await?;
        sleep(Duration::from_secs(1)).await;
        self.start().await
    }
}

/// Service manager configuration
#[derive(Debug, Clone)]
pub struct ServiceManagerConfig {
    /// Health check interval
    pub health_check_interval: Duration,
    /// Maximum number of restart attempts
    pub max_restart_attempts: u32,
    /// Restart backoff base delay
    pub restart_backoff_base: Duration,
    /// Maximum restart backoff
    pub restart_backoff_max: Duration,
    /// Graceful shutdown timeout
    pub shutdown_timeout: Duration,
}

impl Default for ServiceManagerConfig {
    fn default() -> Self {
        Self {
            health_check_interval: Duration::from_secs(30),
            max_restart_attempts: 3,
            restart_backoff_base: Duration::from_secs(1),
            restart_backoff_max: Duration::from_secs(60),
            shutdown_timeout: Duration::from_secs(30),
        }
    }
}

/// Service wrapper with metadata
struct ManagedService {
    service: Box<dyn Service>,
    restart_count: u32,
    last_health_check: Option<HealthCheckResult>,
}

/// Service manager orchestrates multiple services
pub struct ServiceManager {
    config: ServiceManagerConfig,
    services: Arc<RwLock<Vec<ManagedService>>>,
    shutdown_tx: broadcast::Sender<()>,
    running: Arc<RwLock<bool>>,
}

impl ServiceManager {
    /// Create a new service manager
    pub fn new(config: ServiceManagerConfig) -> Self {
        let (shutdown_tx, _) = broadcast::channel(16);

        Self {
            config,
            services: Arc::new(RwLock::new(Vec::new())),
            shutdown_tx,
            running: Arc::new(RwLock::new(false)),
        }
    }

    /// Add a service to be managed
    pub async fn add_service(&self, service: Box<dyn Service>) {
        let mut services = self.services.write().await;
        services.push(ManagedService {
            service,
            restart_count: 0,
            last_health_check: None,
        });
    }

    /// Start all services in dependency order
    pub async fn start_all(&self) -> Result<()> {
        info!("Starting all services");

        let mut running = self.running.write().await;
        *running = true;
        drop(running);

        let mut services = self.services.write().await;

        // Topological sort based on dependencies
        let ordered_indices = self.resolve_dependencies(&services)?;

        // Start services in order
        for idx in ordered_indices {
            let managed = &mut services[idx];
            let service_name = managed.service.name().to_string();

            info!("Starting service: {}", service_name);

            match managed.service.start().await {
                Ok(()) => {
                    info!("Service started successfully: {}", service_name);
                }
                Err(e) => {
                    error!("Failed to start service {}: {}", service_name, e);
                    return Err(e);
                }
            }
        }

        info!("All services started successfully");
        Ok(())
    }

    /// Stop all services in reverse dependency order
    pub async fn stop_all(&self) -> Result<()> {
        info!("Stopping all services");

        let mut running = self.running.write().await;
        *running = false;
        drop(running);

        // Broadcast shutdown signal
        let _ = self.shutdown_tx.send(());

        let mut services = self.services.write().await;

        // Stop in reverse order
        for managed in services.iter_mut().rev() {
            let service_name = managed.service.name().to_string();

            info!("Stopping service: {}", service_name);

            match tokio::time::timeout(
                self.config.shutdown_timeout,
                managed.service.stop()
            ).await {
                Ok(Ok(())) => {
                    info!("Service stopped successfully: {}", service_name);
                }
                Ok(Err(e)) => {
                    error!("Error stopping service {}: {}", service_name, e);
                }
                Err(_) => {
                    error!("Service {} shutdown timed out", service_name);
                }
            }
        }

        info!("All services stopped");
        Ok(())
    }

    /// Run health checks and auto-recovery
    pub async fn run_health_monitoring(&self) -> Result<()> {
        let mut interval = interval(self.config.health_check_interval);
        let mut shutdown_rx = self.shutdown_tx.subscribe();

        loop {
            tokio::select! {
                _ = interval.tick() => {
                    if !*self.running.read().await {
                        break;
                    }

                    self.check_and_recover_services().await;
                }
                _ = shutdown_rx.recv() => {
                    debug!("Health monitoring received shutdown signal");
                    break;
                }
            }
        }

        Ok(())
    }

    /// Check health of all services and attempt recovery if needed
    async fn check_and_recover_services(&self) {
        let mut services = self.services.write().await;

        for managed in services.iter_mut() {
            let service_name = managed.service.name().to_string();

            // Perform health check
            match managed.service.health_check().await {
                Ok(result) => {
                    managed.last_health_check = Some(result.clone());

                    if !result.healthy {
                        warn!(
                            "Service {} is unhealthy: {:?}",
                            service_name,
                            result.message
                        );

                        // Attempt recovery if we haven't exceeded retry limit
                        if managed.restart_count < self.config.max_restart_attempts {
                            info!(
                                "Attempting to recover service {} (attempt {}/{})",
                                service_name,
                                managed.restart_count + 1,
                                self.config.max_restart_attempts
                            );

                            // Calculate backoff
                            let backoff = std::cmp::min(
                                self.config.restart_backoff_base * 2_u32.pow(managed.restart_count),
                                self.config.restart_backoff_max,
                            );

                            sleep(backoff).await;

                            match managed.service.recover().await {
                                Ok(()) => {
                                    info!("Service {} recovered successfully", service_name);
                                    managed.restart_count = 0;
                                }
                                Err(e) => {
                                    error!("Failed to recover service {}: {}", service_name, e);
                                    managed.restart_count += 1;
                                }
                            }
                        } else {
                            error!(
                                "Service {} has exceeded maximum restart attempts",
                                service_name
                            );
                        }
                    } else {
                        // Reset restart count on successful health check
                        if managed.restart_count > 0 {
                            debug!("Service {} is healthy, resetting restart count", service_name);
                            managed.restart_count = 0;
                        }
                    }
                }
                Err(e) => {
                    error!("Health check failed for service {}: {}", service_name, e);
                }
            }
        }
    }

    /// Get health status of all services
    pub async fn get_health_status(&self) -> Vec<(String, ServiceState, Option<HealthCheckResult>)> {
        let services = self.services.read().await;

        services
            .iter()
            .map(|managed| {
                (
                    managed.service.name().to_string(),
                    managed.service.state(),
                    managed.last_health_check.clone(),
                )
            })
            .collect()
    }

    /// Subscribe to shutdown signals
    pub fn subscribe_shutdown(&self) -> broadcast::Receiver<()> {
        self.shutdown_tx.subscribe()
    }

    /// Resolve service dependencies using topological sort
    fn resolve_dependencies(&self, services: &[ManagedService]) -> Result<Vec<usize>> {
        let n = services.len();
        let mut in_degree = vec![0; n];
        let mut adj_list: Vec<Vec<usize>> = vec![Vec::new(); n];

        // Build adjacency list and in-degree count
        for (i, managed) in services.iter().enumerate() {
            let deps = managed.service.dependencies();
            for dep_name in deps {
                // Find dependency index
                if let Some(dep_idx) = services
                    .iter()
                    .position(|m| m.service.name() == dep_name)
                {
                    adj_list[dep_idx].push(i);
                    in_degree[i] += 1;
                } else {
                    return Err(anyhow::anyhow!(
                        "Service {} has unmet dependency: {}",
                        managed.service.name(),
                        dep_name
                    ));
                }
            }
        }

        // Topological sort using Kahn's algorithm
        let mut queue: Vec<usize> = in_degree
            .iter()
            .enumerate()
            .filter_map(|(i, &deg)| if deg == 0 { Some(i) } else { None })
            .collect();

        let mut result = Vec::new();

        while let Some(curr) = queue.pop() {
            result.push(curr);

            for &next in &adj_list[curr] {
                in_degree[next] -= 1;
                if in_degree[next] == 0 {
                    queue.push(next);
                }
            }
        }

        if result.len() != n {
            return Err(anyhow::anyhow!("Circular dependency detected in services"));
        }

        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct MockService {
        name: String,
        state: ServiceState,
        fail_start: bool,
    }

    #[async_trait]
    impl Service for MockService {
        fn name(&self) -> &str {
            &self.name
        }

        async fn start(&mut self) -> Result<()> {
            if self.fail_start {
                anyhow::bail!("Start failed");
            }
            self.state = ServiceState::Running;
            Ok(())
        }

        async fn stop(&mut self) -> Result<()> {
            self.state = ServiceState::Stopped;
            Ok(())
        }

        async fn health_check(&self) -> Result<HealthCheckResult> {
            Ok(HealthCheckResult::healthy())
        }

        fn state(&self) -> ServiceState {
            self.state
        }
    }

    #[tokio::test]
    async fn test_service_manager_lifecycle() {
        let config = ServiceManagerConfig::default();
        let manager = ServiceManager::new(config);

        let service = Box::new(MockService {
            name: "test".to_string(),
            state: ServiceState::Initializing,
            fail_start: false,
        });

        manager.add_service(service).await;

        assert!(manager.start_all().await.is_ok());
        assert!(manager.stop_all().await.is_ok());
    }

    #[tokio::test]
    async fn test_service_state_display() {
        assert_eq!(ServiceState::Running.to_string(), "Running");
        assert_eq!(ServiceState::Failed.to_string(), "Failed");
    }
}
