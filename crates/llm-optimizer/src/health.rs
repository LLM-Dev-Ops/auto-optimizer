//! Health monitoring and auto-recovery
//!
//! This module provides comprehensive health monitoring for all services
//! with automatic recovery capabilities.

use anyhow::Result;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tokio::time::interval;
use tracing::{debug, error, info, warn};

use crate::service::{HealthCheckResult, ServiceState};

/// Overall system health status
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SystemHealth {
    /// All services healthy
    Healthy,
    /// Some services degraded but system operational
    Degraded,
    /// Critical services failed
    Unhealthy,
}

/// Service health information
#[derive(Debug, Clone)]
pub struct ServiceHealth {
    /// Service name
    pub name: String,
    /// Current state
    pub state: ServiceState,
    /// Last health check result
    pub last_check: Option<HealthCheckResult>,
    /// Last check timestamp
    pub last_check_time: Option<Instant>,
    /// Number of consecutive failures
    pub consecutive_failures: u32,
    /// Total failures
    pub total_failures: u64,
    /// Uptime duration
    pub uptime: Duration,
}

/// Health monitor configuration
#[derive(Debug, Clone)]
pub struct HealthMonitorConfig {
    /// Health check interval
    pub check_interval: Duration,
    /// Number of failures before marking unhealthy
    pub failure_threshold: u32,
    /// Enable auto-recovery
    pub auto_recovery: bool,
    /// Recovery retry limit
    pub max_recovery_attempts: u32,
}

impl Default for HealthMonitorConfig {
    fn default() -> Self {
        Self {
            check_interval: Duration::from_secs(30),
            failure_threshold: 3,
            auto_recovery: true,
            max_recovery_attempts: 3,
        }
    }
}

/// Health monitor tracks and manages service health
pub struct HealthMonitor {
    config: HealthMonitorConfig,
    services: Arc<RwLock<HashMap<String, ServiceHealth>>>,
    start_time: Instant,
}

impl HealthMonitor {
    /// Create a new health monitor
    pub fn new(config: HealthMonitorConfig) -> Self {
        Self {
            config,
            services: Arc::new(RwLock::new(HashMap::new())),
            start_time: Instant::now(),
        }
    }

    /// Register a service for monitoring
    pub async fn register_service(&self, name: String) {
        let mut services = self.services.write().await;
        services.insert(
            name.clone(),
            ServiceHealth {
                name,
                state: ServiceState::Initializing,
                last_check: None,
                last_check_time: None,
                consecutive_failures: 0,
                total_failures: 0,
                uptime: Duration::from_secs(0),
            },
        );
    }

    /// Update service health
    pub async fn update_service_health(
        &self,
        name: &str,
        state: ServiceState,
        check_result: HealthCheckResult,
    ) {
        let mut services = self.services.write().await;

        if let Some(health) = services.get_mut(name) {
            health.state = state;
            health.last_check_time = Some(Instant::now());

            if check_result.healthy {
                health.consecutive_failures = 0;
                debug!("Service {} health check passed", name);
            } else {
                health.consecutive_failures += 1;
                health.total_failures += 1;
                warn!(
                    "Service {} health check failed (consecutive: {}): {:?}",
                    name, health.consecutive_failures, check_result.message
                );
            }

            health.last_check = Some(check_result);
        }
    }

    /// Get overall system health
    pub async fn get_system_health(&self) -> SystemHealth {
        let services = self.services.read().await;

        let mut healthy_count = 0;
        let mut degraded_count = 0;
        let mut unhealthy_count = 0;

        for health in services.values() {
            if health.consecutive_failures >= self.config.failure_threshold {
                unhealthy_count += 1;
            } else if health.consecutive_failures > 0 {
                degraded_count += 1;
            } else {
                healthy_count += 1;
            }
        }

        if unhealthy_count > 0 {
            SystemHealth::Unhealthy
        } else if degraded_count > 0 {
            SystemHealth::Degraded
        } else {
            SystemHealth::Healthy
        }
    }

    /// Get health report for all services
    pub async fn get_health_report(&self) -> HashMap<String, ServiceHealth> {
        self.services.read().await.clone()
    }

    /// Get service health
    pub async fn get_service_health(&self, name: &str) -> Option<ServiceHealth> {
        self.services.read().await.get(name).cloned()
    }

    /// Check if service needs recovery
    pub async fn needs_recovery(&self, name: &str) -> bool {
        if let Some(health) = self.services.read().await.get(name) {
            health.consecutive_failures >= self.config.failure_threshold
                && health.consecutive_failures < self.config.max_recovery_attempts
        } else {
            false
        }
    }

    /// Mark service as recovered
    pub async fn mark_recovered(&self, name: &str) {
        let mut services = self.services.write().await;
        if let Some(health) = services.get_mut(name) {
            health.consecutive_failures = 0;
            info!("Service {} marked as recovered", name);
        }
    }

    /// Get system uptime
    pub fn uptime(&self) -> Duration {
        self.start_time.elapsed()
    }

    /// Run periodic health checks
    pub async fn run_periodic_checks<F, Fut>(
        &self,
        check_fn: F,
    ) -> Result<()>
    where
        F: Fn(String) -> Fut + Send + Sync,
        Fut: std::future::Future<Output = Result<(ServiceState, HealthCheckResult)>> + Send,
    {
        let mut ticker = interval(self.config.check_interval);

        loop {
            ticker.tick().await;

            let service_names: Vec<String> = {
                let services = self.services.read().await;
                services.keys().cloned().collect()
            };

            for name in service_names {
                match check_fn(name.clone()).await {
                    Ok((state, result)) => {
                        self.update_service_health(&name, state, result).await;
                    }
                    Err(e) => {
                        error!("Failed to check health of service {}: {}", name, e);
                        self.update_service_health(
                            &name,
                            ServiceState::Failed,
                            HealthCheckResult::unhealthy(format!("Health check error: {}", e)),
                        )
                        .await;
                    }
                }
            }
        }
    }
}

/// Health check endpoint data
#[derive(Debug, Clone, serde::Serialize)]
pub struct HealthCheckResponse {
    /// Overall health status
    pub status: String,
    /// System uptime in seconds
    pub uptime_secs: u64,
    /// Service health details
    pub services: HashMap<String, ServiceHealthStatus>,
}

/// Service health status for API response
#[derive(Debug, Clone, serde::Serialize)]
pub struct ServiceHealthStatus {
    /// Service state
    pub state: String,
    /// Is healthy
    pub healthy: bool,
    /// Consecutive failures
    pub consecutive_failures: u32,
    /// Last check message
    pub message: Option<String>,
    /// Metadata
    pub metadata: HashMap<String, String>,
}

impl HealthMonitor {
    /// Get health check response for API
    pub async fn get_health_response(&self) -> HealthCheckResponse {
        let services = self.services.read().await;
        let system_health = self.get_system_health().await;

        let service_statuses: HashMap<String, ServiceHealthStatus> = services
            .iter()
            .map(|(name, health)| {
                let status = ServiceHealthStatus {
                    state: format!("{}", health.state),
                    healthy: health.consecutive_failures == 0,
                    consecutive_failures: health.consecutive_failures,
                    message: health.last_check.as_ref().and_then(|c| c.message.clone()),
                    metadata: health
                        .last_check
                        .as_ref()
                        .map(|c| c.metadata.clone())
                        .unwrap_or_default(),
                };
                (name.clone(), status)
            })
            .collect();

        HealthCheckResponse {
            status: match system_health {
                SystemHealth::Healthy => "healthy".to_string(),
                SystemHealth::Degraded => "degraded".to_string(),
                SystemHealth::Unhealthy => "unhealthy".to_string(),
            },
            uptime_secs: self.uptime().as_secs(),
            services: service_statuses,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_health_monitor_lifecycle() {
        let config = HealthMonitorConfig::default();
        let monitor = HealthMonitor::new(config);

        // Register a service
        monitor.register_service("test-service".to_string()).await;

        // Update health
        monitor
            .update_service_health(
                "test-service",
                ServiceState::Running,
                HealthCheckResult::healthy(),
            )
            .await;

        // Check system health
        let health = monitor.get_system_health().await;
        assert_eq!(health, SystemHealth::Healthy);
    }

    #[tokio::test]
    async fn test_health_degradation() {
        let config = HealthMonitorConfig {
            failure_threshold: 2,
            ..Default::default()
        };
        let monitor = HealthMonitor::new(config);

        monitor.register_service("test-service".to_string()).await;

        // First failure
        monitor
            .update_service_health(
                "test-service",
                ServiceState::Running,
                HealthCheckResult::unhealthy("Test failure"),
            )
            .await;

        assert_eq!(monitor.get_system_health().await, SystemHealth::Degraded);

        // Second failure (reaches threshold)
        monitor
            .update_service_health(
                "test-service",
                ServiceState::Running,
                HealthCheckResult::unhealthy("Test failure"),
            )
            .await;

        assert_eq!(monitor.get_system_health().await, SystemHealth::Unhealthy);
    }

    #[tokio::test]
    async fn test_health_recovery() {
        let config = HealthMonitorConfig::default();
        let monitor = HealthMonitor::new(config);

        monitor.register_service("test-service".to_string()).await;

        // Mark as failed
        monitor
            .update_service_health(
                "test-service",
                ServiceState::Failed,
                HealthCheckResult::unhealthy("Test failure"),
            )
            .await;

        // Recover
        monitor.mark_recovered("test-service").await;

        let health = monitor.get_service_health("test-service").await.unwrap();
        assert_eq!(health.consecutive_failures, 0);
    }
}
