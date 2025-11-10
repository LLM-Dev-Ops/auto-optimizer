//! Default configuration values

use figment::providers::Serialized;
use figment::Provider;
use serde::{Deserialize, Serialize};

/// Default configuration provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Defaults;

impl Defaults {
    /// Create a Figment provider with default values
    pub fn provider() -> impl Provider {
        Serialized::defaults(super::Config::default())
    }
}
