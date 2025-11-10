//! Utility commands

use crate::{client::ApiClient, CliConfig, CliResult};
use clap::Subcommand;
use clap_complete::{generate, Shell};
use colored::Colorize;
use std::io;

#[derive(Debug, Subcommand)]
pub enum UtilCommand {
    /// Initialize CLI configuration
    Init {
        /// API URL
        #[arg(long, default_value = "http://localhost:8080")]
        api_url: String,

        /// API key
        #[arg(long)]
        api_key: Option<String>,

        /// Force overwrite existing configuration
        #[arg(short, long)]
        force: bool,
    },

    /// Generate shell completions
    Completions {
        /// Shell type
        #[arg(value_enum)]
        shell: Shell,
    },

    /// Run system diagnostics
    Doctor,
}

impl UtilCommand {
    pub async fn execute(&self, client: Option<&dyn ApiClient>) -> CliResult<()> {
        match self {
            UtilCommand::Init {
                api_url,
                api_key,
                force,
            } => self.init(api_url, api_key, *force).await,
            UtilCommand::Completions { shell } => self.completions(*shell),
            UtilCommand::Doctor => self.doctor(client).await,
        }
    }

    async fn init(&self, api_url: &str, api_key: &Option<String>, force: bool) -> CliResult<()> {
        println!("{}", "Initializing LLM Auto Optimizer CLI...".cyan());

        // Get config directory
        let config_dir = CliConfig::default_config_dir()
            .ok_or_else(|| crate::CliError::Config("Could not determine config directory".to_string()))?;

        let config_file = config_dir.join("config.yaml");

        // Check if config already exists
        if config_file.exists() && !force {
            println!(
                "{} Configuration already exists at {}",
                "!".yellow(),
                config_file.display()
            );
            println!("Use --force to overwrite");
            return Ok(());
        }

        // Create config directory
        std::fs::create_dir_all(&config_dir)?;

        // Create config
        let config = CliConfig {
            api_url: api_url.to_string(),
            api_key: api_key.clone(),
            ..Default::default()
        };

        // Save config
        config.save_to_file(&config_file)?;

        println!("{} Configuration created at {}", "✓".green(), config_file.display());
        println!("\nConfiguration:");
        println!("  API URL: {}", config.api_url);
        if let Some(key) = &config.api_key {
            println!("  API Key: {}...", &key[..key.len().min(8)]);
        }

        Ok(())
    }

    fn completions(&self, shell: Shell) -> CliResult<()> {
        // Note: This would need access to the clap Command from main.rs
        // For now, we'll print instructions
        println!("To generate completions, use:");
        println!("  llm-optimizer completions {}", shell);
        println!("\nThis should be called from the main binary, not the library.");
        Ok(())
    }

    async fn doctor(&self, client: Option<&dyn ApiClient>) -> CliResult<()> {
        println!("{}", "Running system diagnostics...\n".cyan().bold());

        // Check config file
        print!("Checking configuration file... ");
        if let Some(config_file) = CliConfig::default_config_file() {
            if config_file.exists() {
                println!("{}", "✓".green());
            } else {
                println!("{}", "✗ Not found".yellow());
                println!("  Run 'llm-optimizer init' to create configuration");
            }
        } else {
            println!("{}", "✗ Cannot determine config directory".red());
        }

        // Check API connectivity
        if let Some(client) = client {
            print!("Checking API connectivity... ");
            match client.health_check().await {
                Ok(health) => {
                    println!("{} (version: {})", "✓".green(), health.version);
                }
                Err(e) => {
                    println!("{}", "✗ Failed".red());
                    println!("  Error: {}", e);
                }
            }

            // Check service status
            print!("Checking service status... ");
            match client.get_service_status().await {
                Ok(status) => {
                    if status.running {
                        println!(
                            "{} (uptime: {}s, optimizations: {})",
                            "✓ Running".green(),
                            status.uptime_seconds,
                            status.active_optimizations
                        );
                    } else {
                        println!("{}", "✗ Not running".yellow());
                    }
                }
                Err(e) => {
                    println!("{}", "✗ Failed".red());
                    println!("  Error: {}", e);
                }
            }
        } else {
            println!("Skipping API checks (no client available)");
        }

        println!("\n{} Diagnostics complete", "✓".green());

        Ok(())
    }
}

