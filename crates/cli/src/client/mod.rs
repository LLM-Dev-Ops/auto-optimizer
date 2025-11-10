//! API client implementations

pub mod rest;

pub use rest::RestClient;

use crate::{CliError, CliResult};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Client configuration
#[derive(Debug, Clone)]
pub struct ClientConfig {
    pub base_url: String,
    pub api_key: Option<String>,
    pub timeout: Duration,
}

/// Unified API client interface
#[async_trait]
pub trait ApiClient: Send + Sync {
    /// Health check
    async fn health_check(&self) -> CliResult<HealthResponse>;

    /// Service operations
    async fn start_service(&self) -> CliResult<ServiceResponse>;
    async fn stop_service(&self) -> CliResult<ServiceResponse>;
    async fn restart_service(&self) -> CliResult<ServiceResponse>;
    async fn get_service_status(&self) -> CliResult<ServiceStatusResponse>;

    /// Optimization operations
    async fn create_optimization(
        &self,
        request: CreateOptimizationRequest,
    ) -> CliResult<OptimizationResponse>;
    async fn list_optimizations(
        &self,
        query: ListOptimizationsQuery,
    ) -> CliResult<Vec<OptimizationResponse>>;
    async fn get_optimization(&self, id: &str) -> CliResult<OptimizationResponse>;
    async fn deploy_optimization(
        &self,
        id: &str,
        request: DeployOptimizationRequest,
    ) -> CliResult<OptimizationResponse>;
    async fn rollback_optimization(
        &self,
        id: &str,
        request: RollbackOptimizationRequest,
    ) -> CliResult<OptimizationResponse>;
    async fn cancel_optimization(&self, id: &str) -> CliResult<OptimizationResponse>;

    /// Configuration operations
    async fn get_config(&self, key: &str) -> CliResult<ConfigValue>;
    async fn set_config(&self, key: &str, value: serde_json::Value) -> CliResult<ConfigValue>;
    async fn list_configs(&self) -> CliResult<Vec<ConfigEntry>>;
    async fn validate_config(&self) -> CliResult<ValidationResult>;
    async fn export_config(&self) -> CliResult<String>;
    async fn import_config(&self, config: &str) -> CliResult<()>;

    /// Metrics operations
    async fn query_metrics(&self, query: MetricsQuery) -> CliResult<MetricsResponse>;
    async fn get_performance_metrics(&self, query: PerformanceQuery)
        -> CliResult<PerformanceMetrics>;
    async fn get_cost_metrics(&self, query: CostQuery) -> CliResult<CostMetrics>;
    async fn get_quality_metrics(&self, query: QualityQuery) -> CliResult<QualityMetrics>;
    async fn export_metrics(&self, query: ExportMetricsQuery) -> CliResult<String>;

    /// Integration operations
    async fn add_integration(&self, request: AddIntegrationRequest)
        -> CliResult<IntegrationResponse>;
    async fn list_integrations(&self) -> CliResult<Vec<IntegrationResponse>>;
    async fn test_integration(&self, id: &str) -> CliResult<TestIntegrationResponse>;
    async fn remove_integration(&self, id: &str) -> CliResult<()>;

    /// Admin operations
    async fn get_stats(&self) -> CliResult<SystemStats>;
    async fn flush_cache(&self) -> CliResult<CacheFlushResponse>;
    async fn get_detailed_health(&self) -> CliResult<DetailedHealthResponse>;
    async fn get_version(&self) -> CliResult<VersionInfo>;
}

// Request/Response types

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceResponse {
    pub status: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceStatusResponse {
    pub running: bool,
    pub uptime_seconds: u64,
    pub version: String,
    pub active_optimizations: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateOptimizationRequest {
    pub target_services: Vec<String>,
    pub strategy: String,
    pub config: serde_json::Value,
    pub constraints: Vec<ConstraintInput>,
    pub dry_run: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConstraintInput {
    pub constraint_type: String,
    pub value: serde_json::Value,
    pub hard: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationResponse {
    pub id: String,
    pub target_services: Vec<String>,
    pub strategy: String,
    pub status: String,
    pub changes: Vec<ConfigurationChange>,
    pub expected_impact: ExpectedImpact,
    pub actual_impact: Option<ActualImpact>,
    pub rationale: String,
    pub created_at: String,
    pub deployed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigurationChange {
    pub parameter: String,
    pub old_value: Option<serde_json::Value>,
    pub new_value: serde_json::Value,
    pub change_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExpectedImpact {
    pub cost_reduction_pct: f64,
    pub quality_delta_pct: f64,
    pub latency_delta_pct: f64,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActualImpact {
    pub cost_reduction_pct: f64,
    pub quality_delta_pct: f64,
    pub latency_delta_pct: f64,
    pub requests_affected: u64,
    pub measured_from: String,
    pub measured_until: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListOptimizationsQuery {
    pub status: Option<String>,
    pub strategy: Option<String>,
    pub service: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeployOptimizationRequest {
    pub gradual: bool,
    pub rollout_percentage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollbackOptimizationRequest {
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigValue {
    pub key: String,
    pub value: serde_json::Value,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigEntry {
    pub key: String,
    pub value: serde_json::Value,
    pub description: Option<String>,
    pub default_value: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsQuery {
    pub metric_names: Vec<String>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub aggregation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsResponse {
    pub metrics: Vec<MetricData>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricData {
    pub name: String,
    pub values: Vec<MetricValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricValue {
    pub timestamp: String,
    pub value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceQuery {
    pub service: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceMetrics {
    pub avg_latency_ms: f64,
    pub p50_latency_ms: f64,
    pub p95_latency_ms: f64,
    pub p99_latency_ms: f64,
    pub throughput_rps: f64,
    pub error_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostQuery {
    pub service: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostMetrics {
    pub total_cost: f64,
    pub cost_per_request: f64,
    pub cost_breakdown: Vec<CostBreakdown>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostBreakdown {
    pub category: String,
    pub cost: f64,
    pub percentage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QualityQuery {
    pub service: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QualityMetrics {
    pub avg_quality_score: f64,
    pub quality_distribution: Vec<QualityBucket>,
    pub total_requests: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QualityBucket {
    pub score_range: String,
    pub count: u64,
    pub percentage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportMetricsQuery {
    pub format: String,
    pub from: Option<String>,
    pub to: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddIntegrationRequest {
    pub integration_type: String,
    pub name: String,
    pub config: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntegrationResponse {
    pub id: String,
    pub integration_type: String,
    pub name: String,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestIntegrationResponse {
    pub success: bool,
    pub message: String,
    pub details: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemStats {
    pub uptime_seconds: u64,
    pub total_optimizations: u64,
    pub active_optimizations: u64,
    pub total_cost_saved: f64,
    pub memory_usage_bytes: u64,
    pub cpu_usage_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheFlushResponse {
    pub entries_flushed: u64,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetailedHealthResponse {
    pub status: String,
    pub version: String,
    pub components: Vec<ComponentHealth>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentHealth {
    pub name: String,
    pub status: String,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionInfo {
    pub version: String,
    pub build_date: String,
    pub commit_hash: String,
    pub rust_version: String,
}
