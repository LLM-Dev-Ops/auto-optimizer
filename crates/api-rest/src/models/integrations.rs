//! Integration-related request/response models

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;
use validator::Validate;

/// Integration type
#[derive(Debug, Clone, Copy, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum IntegrationType {
    Jira,
    Anthropic,
    Webhook,
}

/// Create integration request
#[derive(Debug, Clone, Serialize, Deserialize, Validate, ToSchema)]
pub struct CreateIntegrationRequest {
    /// Integration name
    #[validate(length(min = 1, max = 100))]
    pub name: String,

    /// Integration type
    pub integration_type: IntegrationType,

    /// Configuration
    pub config: serde_json::Value,

    /// Whether the integration is enabled
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

fn default_enabled() -> bool {
    true
}

/// Update integration request
#[derive(Debug, Clone, Serialize, Deserialize, Validate, ToSchema)]
pub struct UpdateIntegrationRequest {
    /// Integration name
    #[serde(skip_serializing_if = "Option::is_none")]
    #[validate(length(min = 1, max = 100))]
    pub name: Option<String>,

    /// Configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config: Option<serde_json::Value>,

    /// Whether the integration is enabled
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
}

/// Integration response
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct IntegrationResponse {
    /// Integration ID
    pub id: Uuid,

    /// Integration name
    pub name: String,

    /// Integration type
    pub integration_type: IntegrationType,

    /// Whether the integration is enabled
    pub enabled: bool,

    /// Configuration (sensitive fields redacted)
    pub config: serde_json::Value,

    /// Created at
    pub created_at: DateTime<Utc>,

    /// Updated at
    pub updated_at: DateTime<Utc>,

    /// Last successful sync
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_sync_at: Option<DateTime<Utc>>,
}

/// Test integration request
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct TestIntegrationRequest {
    /// Test data
    #[serde(default)]
    pub test_data: serde_json::Value,
}

/// Test integration response
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct TestIntegrationResponse {
    /// Whether the test was successful
    pub success: bool,

    /// Test message
    pub message: String,

    /// Response data
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}
