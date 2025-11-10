//! Metrics aggregation and export
//!
//! This module provides centralized metrics collection and export
//! for all services using Prometheus format.

use anyhow::Result;
use prometheus_client::encoding::text::encode;
use prometheus_client::metrics::counter::Counter;
use prometheus_client::metrics::family::Family;
use prometheus_client::metrics::gauge::Gauge;
use prometheus_client::metrics::histogram::{exponential_buckets, Histogram};
use prometheus_client::registry::Registry;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

/// Metrics labels
#[derive(Clone, Debug, Hash, PartialEq, Eq)]
pub struct ServiceLabel {
    /// Service name
    pub service: String,
}

impl prometheus_client::encoding::EncodeLabelSet for ServiceLabel {
    fn encode(
        &self,
        mut encoder: prometheus_client::encoding::LabelSetEncoder,
    ) -> std::result::Result<(), std::fmt::Error> {
        ("service", self.service.as_str()).encode(encoder.encode_label())?;
        Ok(())
    }
}

/// Operation labels
#[derive(Clone, Debug, Hash, PartialEq, Eq)]
pub struct OperationLabel {
    /// Operation name
    pub operation: String,
    /// Status (success, error)
    pub status: String,
}

impl prometheus_client::encoding::EncodeLabelSet for OperationLabel {
    fn encode(
        &self,
        mut encoder: prometheus_client::encoding::LabelSetEncoder,
    ) -> std::result::Result<(), std::fmt::Error> {
        ("operation", self.operation.as_str()).encode(encoder.encode_label())?;
        ("status", self.status.as_str()).encode(encoder.encode_label())?;
        Ok(())
    }
}

/// System metrics
pub struct SystemMetrics {
    /// Service status (1 = running, 0 = stopped)
    pub service_status: Family<ServiceLabel, Gauge>,
    /// Service health (1 = healthy, 0 = unhealthy)
    pub service_health: Family<ServiceLabel, Gauge>,
    /// Service uptime in seconds
    pub service_uptime: Family<ServiceLabel, Gauge>,
    /// Total requests
    pub requests_total: Family<OperationLabel, Counter>,
    /// Request duration histogram
    pub request_duration: Family<OperationLabel, Histogram>,
    /// Active connections
    pub active_connections: Family<ServiceLabel, Gauge>,
    /// Memory usage in bytes
    pub memory_usage_bytes: Gauge,
    /// CPU usage percentage
    pub cpu_usage_percent: Gauge,
}

impl SystemMetrics {
    /// Create new system metrics
    pub fn new() -> Self {
        Self {
            service_status: Family::default(),
            service_health: Family::default(),
            service_uptime: Family::default(),
            requests_total: Family::default(),
            request_duration: Family::new_with_constructor(|| {
                Histogram::new(exponential_buckets(0.001, 2.0, 10))
            }),
            active_connections: Family::default(),
            memory_usage_bytes: Gauge::default(),
            cpu_usage_percent: Gauge::default(),
        }
    }

    /// Register metrics with a registry
    pub fn register(&self, registry: &mut Registry) {
        registry.register(
            "service_status",
            "Service status (1 = running, 0 = stopped)",
            self.service_status.clone(),
        );

        registry.register(
            "service_health",
            "Service health (1 = healthy, 0 = unhealthy)",
            self.service_health.clone(),
        );

        registry.register(
            "service_uptime_seconds",
            "Service uptime in seconds",
            self.service_uptime.clone(),
        );

        registry.register(
            "requests_total",
            "Total number of requests",
            self.requests_total.clone(),
        );

        registry.register(
            "request_duration_seconds",
            "Request duration histogram",
            self.request_duration.clone(),
        );

        registry.register(
            "active_connections",
            "Number of active connections",
            self.active_connections.clone(),
        );

        registry.register(
            "memory_usage_bytes",
            "Memory usage in bytes",
            self.memory_usage_bytes.clone(),
        );

        registry.register(
            "cpu_usage_percent",
            "CPU usage percentage",
            self.cpu_usage_percent.clone(),
        );
    }
}

impl Default for SystemMetrics {
    fn default() -> Self {
        Self::new()
    }
}

/// Metrics aggregator
pub struct MetricsAggregator {
    registry: Arc<RwLock<Registry>>,
    metrics: Arc<SystemMetrics>,
}

impl MetricsAggregator {
    /// Create a new metrics aggregator
    pub fn new() -> Self {
        let mut registry = Registry::default();
        let metrics = Arc::new(SystemMetrics::new());

        metrics.register(&mut registry);

        Self {
            registry: Arc::new(RwLock::new(registry)),
            metrics,
        }
    }

    /// Get the system metrics
    pub fn metrics(&self) -> Arc<SystemMetrics> {
        Arc::clone(&self.metrics)
    }

    /// Export metrics in Prometheus format
    pub async fn export(&self) -> Result<String> {
        let registry = self.registry.read().await;
        let mut buffer = String::new();
        encode(&mut buffer, &registry)?;
        Ok(buffer)
    }

    /// Start metrics HTTP server
    pub async fn serve(&self, addr: SocketAddr) -> Result<()> {
        use axum::{routing::get, Router};

        info!("Starting metrics server on {}", addr);

        let aggregator = Arc::new(self.clone());

        let app = Router::new().route(
            "/metrics",
            get(move || {
                let agg = Arc::clone(&aggregator);
                async move {
                    match agg.export().await {
                        Ok(metrics) => (
                            axum::http::StatusCode::OK,
                            [("content-type", "text/plain; charset=utf-8")],
                            metrics,
                        ),
                        Err(e) => (
                            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                            [("content-type", "text/plain; charset=utf-8")],
                            format!("Error exporting metrics: {}", e),
                        ),
                    }
                }
            }),
        );

        let listener = tokio::net::TcpListener::bind(addr).await?;
        axum::serve(listener, app).await?;

        Ok(())
    }

    /// Update service status
    pub fn update_service_status(&self, service: &str, running: bool) {
        self.metrics
            .service_status
            .get_or_create(&ServiceLabel {
                service: service.to_string(),
            })
            .set(if running { 1 } else { 0 });
    }

    /// Update service health
    pub fn update_service_health(&self, service: &str, healthy: bool) {
        self.metrics
            .service_health
            .get_or_create(&ServiceLabel {
                service: service.to_string(),
            })
            .set(if healthy { 1 } else { 0 });
    }

    /// Update service uptime
    pub fn update_service_uptime(&self, service: &str, uptime_secs: u64) {
        self.metrics
            .service_uptime
            .get_or_create(&ServiceLabel {
                service: service.to_string(),
            })
            .set(uptime_secs as i64);
    }

    /// Increment request counter
    pub fn increment_requests(&self, operation: &str, status: &str) {
        self.metrics
            .requests_total
            .get_or_create(&OperationLabel {
                operation: operation.to_string(),
                status: status.to_string(),
            })
            .inc();
    }

    /// Observe request duration
    pub fn observe_request_duration(&self, operation: &str, status: &str, duration_secs: f64) {
        self.metrics
            .request_duration
            .get_or_create(&OperationLabel {
                operation: operation.to_string(),
                status: status.to_string(),
            })
            .observe(duration_secs);
    }

    /// Update active connections
    pub fn update_active_connections(&self, service: &str, count: i64) {
        self.metrics
            .active_connections
            .get_or_create(&ServiceLabel {
                service: service.to_string(),
            })
            .set(count);
    }

    /// Update memory usage
    pub fn update_memory_usage(&self, bytes: i64) {
        self.metrics.memory_usage_bytes.set(bytes);
    }

    /// Update CPU usage
    pub fn update_cpu_usage(&self, percent: f64) {
        self.metrics.cpu_usage_percent.set(percent as i64);
    }
}

impl Clone for MetricsAggregator {
    fn clone(&self) -> Self {
        Self {
            registry: Arc::clone(&self.registry),
            metrics: Arc::clone(&self.metrics),
        }
    }
}

impl Default for MetricsAggregator {
    fn default() -> Self {
        Self::new()
    }
}

/// Resource monitor for system metrics
pub struct ResourceMonitor {
    aggregator: MetricsAggregator,
}

impl ResourceMonitor {
    /// Create a new resource monitor
    pub fn new(aggregator: MetricsAggregator) -> Self {
        Self { aggregator }
    }

    /// Start monitoring system resources
    pub async fn start(&self) -> Result<()> {
        info!("Starting resource monitor");

        let aggregator = self.aggregator.clone();

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(10));

            loop {
                interval.tick().await;

                // Update system metrics
                if let Ok(memory) = Self::get_memory_usage() {
                    aggregator.update_memory_usage(memory as i64);
                }

                if let Ok(cpu) = Self::get_cpu_usage() {
                    aggregator.update_cpu_usage(cpu);
                }
            }
        });

        Ok(())
    }

    /// Get current memory usage in bytes
    fn get_memory_usage() -> Result<u64> {
        // This is a simple implementation
        // In production, use a proper system metrics library like sysinfo
        #[cfg(target_os = "linux")]
        {
            let status = std::fs::read_to_string("/proc/self/status")?;
            for line in status.lines() {
                if line.starts_with("VmRSS:") {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 2 {
                        if let Ok(kb) = parts[1].parse::<u64>() {
                            return Ok(kb * 1024);
                        }
                    }
                }
            }
        }

        Ok(0)
    }

    /// Get current CPU usage percentage
    fn get_cpu_usage() -> Result<f64> {
        // This is a placeholder
        // In production, use a proper system metrics library like sysinfo
        Ok(0.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_metrics_aggregator() {
        let aggregator = MetricsAggregator::new();

        // Update metrics
        aggregator.update_service_status("test", true);
        aggregator.update_service_health("test", true);
        aggregator.update_service_uptime("test", 100);
        aggregator.increment_requests("test_op", "success");
        aggregator.observe_request_duration("test_op", "success", 0.5);

        // Export metrics
        let exported = aggregator.export().await.unwrap();
        assert!(!exported.is_empty());
        assert!(exported.contains("service_status"));
    }

    #[test]
    fn test_service_label() {
        let label = ServiceLabel {
            service: "test".to_string(),
        };
        assert_eq!(label.service, "test");
    }

    #[test]
    fn test_operation_label() {
        let label = OperationLabel {
            operation: "test_op".to_string(),
            status: "success".to_string(),
        };
        assert_eq!(label.operation, "test_op");
        assert_eq!(label.status, "success");
    }
}
