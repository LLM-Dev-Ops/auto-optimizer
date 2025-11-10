//! Admin-related request/response models

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use validator::Validate;

/// System statistics
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct SystemStats {
    /// Total optimizations
    pub total_optimizations: u64,

    /// Active optimizations
    pub active_optimizations: u64,

    /// Total cost savings
    pub total_cost_savings: f64,

    /// Total requests processed
    pub total_requests_processed: u64,

    /// Average latency
    pub avg_latency_ms: f64,

    /// System uptime
    pub uptime_seconds: u64,

    /// Timestamp
    pub timestamp: DateTime<Utc>,
}

/// Flush cache request
#[derive(Debug, Clone, Serialize, Deserialize, Validate, ToSchema)]
pub struct FlushCacheRequest {
    /// Cache key pattern (optional, flushes all if not specified)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pattern: Option<String>,
}

/// Flush cache response
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct FlushCacheResponse {
    /// Number of keys flushed
    pub keys_flushed: u64,

    /// Success message
    pub message: String,
}

/// Create API key request
#[derive(Debug, Clone, Serialize, Deserialize, Validate, ToSchema)]
pub struct CreateApiKeyRequest {
    /// Key name/description
    #[validate(length(min = 1, max = 100))]
    pub name: String,

    /// Roles for the API key
    #[validate(length(min = 1))]
    pub roles: Vec<String>,

    /// Expiration time (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<DateTime<Utc>>,
}

/// API key response
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ApiKeyResponse {
    /// API key (only shown once during creation)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,

    /// Key ID
    pub id: String,

    /// Key name
    pub name: String,

    /// Roles
    pub roles: Vec<String>,

    /// Created at
    pub created_at: DateTime<Utc>,

    /// Expires at
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<DateTime<Utc>>,

    /// Last used
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_used_at: Option<DateTime<Utc>>,
}

/// Audit log entry
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct AuditLogEntry {
    /// Log ID
    pub id: String,

    /// User ID
    pub user_id: String,

    /// Action performed
    pub action: String,

    /// Resource type
    pub resource_type: String,

    /// Resource ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource_id: Option<String>,

    /// Request details
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,

    /// IP address
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ip_address: Option<String>,

    /// Timestamp
    pub timestamp: DateTime<Utc>,
}

/// Query audit logs request
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct QueryAuditLogsRequest {
    /// Filter by user ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,

    /// Filter by action
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,

    /// Filter by resource type
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource_type: Option<String>,

    /// Start date
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<DateTime<Utc>>,

    /// End date
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to: Option<DateTime<Utc>>,
}
