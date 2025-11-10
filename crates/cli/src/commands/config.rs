//! Configuration management commands

use crate::{client::ApiClient, output::OutputWriter, CliResult};
use clap::Subcommand;
use colored::Colorize;
use std::path::PathBuf;

#[derive(Debug, Subcommand)]
pub enum ConfigCommand {
    /// Get configuration value
    Get {
        /// Configuration key
        key: String,
    },

    /// Set configuration value
    Set {
        /// Configuration key
        key: String,

        /// Configuration value (JSON format)
        value: String,
    },

    /// List all configurations
    List,

    /// Validate configuration
    Validate,

    /// Export configuration
    Export {
        /// Output file path
        #[arg(short, long)]
        output: Option<PathBuf>,
    },

    /// Import configuration
    Import {
        /// Input file path
        file: PathBuf,
    },
}

impl ConfigCommand {
    pub async fn execute(
        &self,
        client: &dyn ApiClient,
        formatter: &dyn OutputWriter,
    ) -> CliResult<()> {
        match self {
            ConfigCommand::Get { key } => self.get(client, formatter, key).await,
            ConfigCommand::Set { key, value } => self.set(client, formatter, key, value).await,
            ConfigCommand::List => self.list(client, formatter).await,
            ConfigCommand::Validate => self.validate(client).await,
            ConfigCommand::Export { output } => self.export(client, output).await,
            ConfigCommand::Import { file } => self.import(client, file).await,
        }
    }

    async fn get(
        &self,
        client: &dyn ApiClient,
        formatter: &dyn OutputWriter,
        key: &str,
    ) -> CliResult<()> {
        let config = client.get_config(key).await?;
        let output = formatter.write(&config)?;
        println!("{}", output);
        Ok(())
    }

    async fn set(
        &self,
        client: &dyn ApiClient,
        formatter: &dyn OutputWriter,
        key: &str,
        value: &str,
    ) -> CliResult<()> {
        let json_value: serde_json::Value = serde_json::from_str(value)?;
        let config = client.set_config(key, json_value).await?;

        println!("{} Configuration updated", "✓".green());
        let output = formatter.write(&config)?;
        println!("{}", output);

        Ok(())
    }

    async fn list(&self, client: &dyn ApiClient, formatter: &dyn OutputWriter) -> CliResult<()> {
        let configs = client.list_configs().await?;

        if configs.is_empty() {
            println!("{}", "No configurations found".yellow());
            return Ok(());
        }

        let output = formatter.write(&configs)?;
        println!("{}", output);

        println!("\n{} Found {} configuration(s)", "ℹ".blue(), configs.len());

        Ok(())
    }

    async fn validate(&self, client: &dyn ApiClient) -> CliResult<()> {
        println!("{}", "Validating configuration...".cyan());

        let result = client.validate_config().await?;

        if result.valid {
            println!("{} Configuration is valid", "✓".green());
        } else {
            println!("{} Configuration has errors:", "✗".red());
            for error in &result.errors {
                println!("  {} {}", "•".red(), error);
            }
        }

        if !result.warnings.is_empty() {
            println!("\n{} Warnings:", "⚠".yellow());
            for warning in &result.warnings {
                println!("  {} {}", "•".yellow(), warning);
            }
        }

        Ok(())
    }

    async fn export(&self, client: &dyn ApiClient, output: &Option<PathBuf>) -> CliResult<()> {
        println!("{}", "Exporting configuration...".cyan());

        let config = client.export_config().await?;

        if let Some(path) = output {
            std::fs::write(path, &config)?;
            println!("{} Configuration exported to {}", "✓".green(), path.display());
        } else {
            println!("{}", config);
        }

        Ok(())
    }

    async fn import(&self, client: &dyn ApiClient, file: &PathBuf) -> CliResult<()> {
        println!("{}", "Importing configuration...".cyan());

        let config = std::fs::read_to_string(file)?;
        client.import_config(&config).await?;

        println!("{} Configuration imported", "✓".green());

        Ok(())
    }
}
