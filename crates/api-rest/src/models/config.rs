//! Configuration-related request/response models

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use validator::Validate;

/// Get configuration request
#[derive(Debug, Clone, Serialize, Deserialize, Validate, ToSchema)]
pub struct GetConfigRequest {
    /// Configuration key
    #[validate(length(min = 1))]
    pub key: String,
}

/// Update configuration request
#[derive(Debug, Clone, Serialize, Deserialize, Validate, ToSchema)]
pub struct UpdateConfigRequest {
    /// Configuration key
    #[validate(length(min = 1))]
    pub key: String,

    /// Configuration value
    pub value: serde_json::Value,
}

/// Configuration response
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ConfigResponse {
    /// Configuration key
    pub key: String,

    /// Configuration value
    pub value: serde_json::Value,

    /// Last updated timestamp
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

/// Batch configuration update
#[derive(Debug, Clone, Serialize, Deserialize, Validate, ToSchema)]
pub struct BatchUpdateConfigRequest {
    /// Configuration updates
    #[validate(length(min = 1))]
    pub updates: Vec<ConfigUpdate>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Validate, ToSchema)]
pub struct ConfigUpdate {
    #[validate(length(min = 1))]
    pub key: String,
    pub value: serde_json::Value,
}
