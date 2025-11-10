//! Metrics-related request/response models

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use validator::Validate;

use llm_optimizer_types::metrics::{AggregationType, PerformanceMetrics, CostMetrics, QualityMetrics};

/// Query metrics request
#[derive(Debug, Clone, Serialize, Deserialize, Validate, ToSchema)]
pub struct QueryMetricsRequest {
    /// Metric name
    #[validate(length(min = 1))]
    pub metric_name: String,

    /// Start time
    pub from: DateTime<Utc>,

    /// End time
    pub to: DateTime<Utc>,

    /// Aggregation type
    #[serde(default)]
    pub aggregation: Option<AggregationType>,

    /// Service filter
    #[serde(skip_serializing_if = "Option::is_none")]
    pub service: Option<String>,

    /// Tags filter
    #[serde(default)]
    pub tags: std::collections::HashMap<String, String>,
}

/// Metrics response
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct MetricsResponse {
    /// Metric name
    pub metric_name: String,

    /// Data points
    pub data_points: Vec<MetricDataPoint>,

    /// Summary statistics
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<MetricSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct MetricDataPoint {
    pub timestamp: DateTime<Utc>,
    pub value: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<std::collections::HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct MetricSummary {
    pub count: u64,
    pub sum: f64,
    pub min: f64,
    pub max: f64,
    pub avg: f64,
}

/// Performance metrics response
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct PerformanceMetricsResponse {
    pub avg_latency_ms: f64,
    pub p50_latency_ms: f64,
    pub p95_latency_ms: f64,
    pub p99_latency_ms: f64,
    pub error_rate: f64,
    pub throughput_qps: f64,
    pub total_requests: u64,
    pub period_start: DateTime<Utc>,
    pub period_end: DateTime<Utc>,
}

impl From<PerformanceMetrics> for PerformanceMetricsResponse {
    fn from(m: PerformanceMetrics) -> Self {
        Self {
            avg_latency_ms: m.avg_latency_ms,
            p50_latency_ms: m.p50_latency_ms,
            p95_latency_ms: m.p95_latency_ms,
            p99_latency_ms: m.p99_latency_ms,
            error_rate: m.error_rate,
            throughput_qps: m.throughput_qps,
            total_requests: m.total_requests,
            period_start: m.period_start,
            period_end: m.period_end,
        }
    }
}

/// Cost metrics response
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CostMetricsResponse {
    pub total_cost: f64,
    pub avg_cost_per_request: f64,
    pub total_tokens: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub period_start: DateTime<Utc>,
    pub period_end: DateTime<Utc>,
}

impl From<CostMetrics> for CostMetricsResponse {
    fn from(m: CostMetrics) -> Self {
        Self {
            total_cost: m.total_cost,
            avg_cost_per_request: m.avg_cost_per_request,
            total_tokens: m.total_tokens,
            input_tokens: m.input_tokens,
            output_tokens: m.output_tokens,
            period_start: m.period_start,
            period_end: m.period_end,
        }
    }
}

/// Quality metrics response
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct QualityMetricsResponse {
    pub overall_score: f64,
    pub accuracy: f64,
    pub relevance: f64,
    pub coherence: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_satisfaction: Option<f64>,
    pub period_start: DateTime<Utc>,
    pub period_end: DateTime<Utc>,
}

impl From<QualityMetrics> for QualityMetricsResponse {
    fn from(m: QualityMetrics) -> Self {
        Self {
            overall_score: m.overall_score,
            accuracy: m.accuracy,
            relevance: m.relevance,
            coherence: m.coherence,
            user_satisfaction: m.user_satisfaction,
            period_start: m.period_start,
            period_end: m.period_end,
        }
    }
}
