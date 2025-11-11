//! LLM Auto Optimizer CLI Library
//!
//! This library provides the core functionality for the LLM Auto Optimizer CLI tool.

pub mod client;
pub mod commands;
pub mod interactive;
pub mod output;

pub use client::{ApiClient, ClientConfig};
pub use output::{Formatter, OutputFormat, OutputWriter};

use thiserror::Error;

/// CLI error types
#[derive(Debug, Error)]
pub enum CliError {
    #[error("API error: {0}")]
    Api(String),

    #[error("Configuration error: {0}")]
    Config(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(String),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Authentication failed: {0}")]
    AuthenticationFailed(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Operation failed: {0}")]
    OperationFailed(String),
}

impl From<serde_json::Error> for CliError {
    fn from(err: serde_json::Error) -> Self {
        CliError::Serialization(err.to_string())
    }
}

impl From<serde_yaml::Error> for CliError {
    fn from(err: serde_yaml::Error) -> Self {
        CliError::Serialization(err.to_string())
    }
}

impl From<csv::Error> for CliError {
    fn from(err: csv::Error) -> Self {
        CliError::Serialization(err.to_string())
    }
}

impl<W> From<csv::IntoInnerError<W>> for CliError {
    fn from(err: csv::IntoInnerError<W>) -> Self {
        CliError::Serialization(err.to_string())
    }
}

impl From<std::string::FromUtf8Error> for CliError {
    fn from(err: std::string::FromUtf8Error) -> Self {
        CliError::Serialization(err.to_string())
    }
}

/// Result type for CLI operations
pub type CliResult<T> = Result<T, CliError>;

/// CLI configuration
#[derive(Debug, Clone)]
pub struct CliConfig {
    /// API base URL
    pub api_url: String,

    /// gRPC endpoint
    pub grpc_endpoint: Option<String>,

    /// API key for authentication
    pub api_key: Option<String>,

    /// Request timeout in seconds
    pub timeout: u64,

    /// Output format
    pub output_format: OutputFormat,

    /// Enable verbose output
    pub verbose: bool,

    /// Configuration file path
    pub config_file: Option<std::path::PathBuf>,
}

impl Default for CliConfig {
    fn default() -> Self {
        Self {
            api_url: "http://localhost:8080".to_string(),
            grpc_endpoint: Some("http://localhost:50051".to_string()),
            api_key: None,
            timeout: 30,
            output_format: OutputFormat::Table,
            verbose: false,
            config_file: None,
        }
    }
}

impl CliConfig {
    /// Load configuration from file
    pub fn from_file(path: &std::path::Path) -> CliResult<Self> {
        let contents = std::fs::read_to_string(path)?;
        let config: CliConfig = serde_yaml::from_str(&contents)?;
        Ok(config)
    }

    /// Save configuration to file
    pub fn save_to_file(&self, path: &std::path::Path) -> CliResult<()> {
        let contents = serde_yaml::to_string(self)
            .map_err(|e| CliError::Serialization(e.to_string()))?;
        std::fs::write(path, contents)?;
        Ok(())
    }

    /// Get default config directory
    pub fn default_config_dir() -> Option<std::path::PathBuf> {
        dirs::config_dir().map(|d| d.join("llm-optimizer"))
    }

    /// Get default config file path
    pub fn default_config_file() -> Option<std::path::PathBuf> {
        Self::default_config_dir().map(|d| d.join("config.yaml"))
    }
}

impl serde::Serialize for CliConfig {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("CliConfig", 6)?;
        state.serialize_field("api_url", &self.api_url)?;
        state.serialize_field("grpc_endpoint", &self.grpc_endpoint)?;
        state.serialize_field("api_key", &self.api_key)?;
        state.serialize_field("timeout", &self.timeout)?;
        state.serialize_field("output_format", &self.output_format.to_string())?;
        state.serialize_field("verbose", &self.verbose)?;
        state.end()
    }
}

impl<'de> serde::Deserialize<'de> for CliConfig {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        use serde::de::{self, MapAccess, Visitor};
        use std::fmt;

        #[derive(serde::Deserialize)]
        #[serde(field_identifier, rename_all = "snake_case")]
        enum Field {
            ApiUrl,
            GrpcEndpoint,
            ApiKey,
            Timeout,
            OutputFormat,
            Verbose,
        }

        struct CliConfigVisitor;

        impl<'de> Visitor<'de> for CliConfigVisitor {
            type Value = CliConfig;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("struct CliConfig")
            }

            fn visit_map<V>(self, mut map: V) -> Result<CliConfig, V::Error>
            where
                V: MapAccess<'de>,
            {
                let mut api_url = None;
                let mut grpc_endpoint = None;
                let mut api_key = None;
                let mut timeout = None;
                let mut output_format = None;
                let mut verbose = None;

                while let Some(key) = map.next_key()? {
                    match key {
                        Field::ApiUrl => {
                            api_url = Some(map.next_value()?);
                        }
                        Field::GrpcEndpoint => {
                            grpc_endpoint = Some(map.next_value()?);
                        }
                        Field::ApiKey => {
                            api_key = Some(map.next_value()?);
                        }
                        Field::Timeout => {
                            timeout = Some(map.next_value()?);
                        }
                        Field::OutputFormat => {
                            let s: String = map.next_value()?;
                            output_format = Some(s.parse().map_err(de::Error::custom)?);
                        }
                        Field::Verbose => {
                            verbose = Some(map.next_value()?);
                        }
                    }
                }

                Ok(CliConfig {
                    api_url: api_url.unwrap_or_else(|| "http://localhost:8080".to_string()),
                    grpc_endpoint,
                    api_key,
                    timeout: timeout.unwrap_or(30),
                    output_format: output_format.unwrap_or(OutputFormat::Table),
                    verbose: verbose.unwrap_or(false),
                    config_file: None,
                })
            }
        }

        deserializer.deserialize_struct(
            "CliConfig",
            &["api_url", "grpc_endpoint", "api_key", "timeout", "output_format", "verbose"],
            CliConfigVisitor,
        )
    }
}
