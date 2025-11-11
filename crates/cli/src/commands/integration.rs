//! Integration management commands

use crate::{client::{AddIntegrationRequest, ApiClient}, output::OutputWriter, Formatter, CliResult};
use clap::Subcommand;
use colored::Colorize;
use dialoguer::Confirm;

#[derive(Debug, Subcommand)]
pub enum IntegrationCommand {
    /// Add a new integration
    Add {
        /// Integration type
        #[arg(short, long)]
        integration_type: String,

        /// Integration name
        #[arg(short, long)]
        name: String,

        /// Configuration (JSON format)
        #[arg(short, long)]
        config: String,
    },

    /// List all integrations
    List,

    /// Test an integration
    Test {
        /// Integration ID
        id: String,
    },

    /// Remove an integration
    Remove {
        /// Integration ID
        id: String,

        /// Skip confirmation
        #[arg(short = 'y', long)]
        yes: bool,
    },
}

impl IntegrationCommand {
    pub async fn execute(
        &self,
        client: &dyn ApiClient,
        formatter: &Formatter,
    ) -> CliResult<()> {
        match self {
            IntegrationCommand::Add {
                integration_type,
                name,
                config,
            } => self.add(client, formatter, integration_type, name, config).await,
            IntegrationCommand::List => self.list(client, formatter).await,
            IntegrationCommand::Test { id } => self.test(client, formatter, id).await,
            IntegrationCommand::Remove { id, yes } => self.remove(client, id, *yes).await,
        }
    }

    async fn add(
        &self,
        client: &dyn ApiClient,
        formatter: &Formatter,
        integration_type: &str,
        name: &str,
        config: &str,
    ) -> CliResult<()> {
        println!("{}", "Adding integration...".cyan());

        let config_value: serde_json::Value = serde_json::from_str(config)?;

        let request = AddIntegrationRequest {
            integration_type: integration_type.to_string(),
            name: name.to_string(),
            config: config_value,
        };

        let integration = client.add_integration(request).await?;

        println!("{} Integration added", "✓".green());

        let output = formatter.write(&integration)?;
        println!("{}", output);

        Ok(())
    }

    async fn list(&self, client: &dyn ApiClient, formatter: &Formatter) -> CliResult<()> {
        let integrations = client.list_integrations().await?;

        if integrations.is_empty() {
            println!("{}", "No integrations found".yellow());
            return Ok(());
        }

        let output = formatter.write(&integrations)?;
        println!("{}", output);

        println!("\n{} Found {} integration(s)", "ℹ".blue(), integrations.len());

        Ok(())
    }

    async fn test(
        &self,
        client: &dyn ApiClient,
        formatter: &Formatter,
        id: &str,
    ) -> CliResult<()> {
        println!("{}", "Testing integration...".cyan());

        let result = client.test_integration(id).await?;

        if result.success {
            println!("{} Integration test passed", "✓".green());
        } else {
            println!("{} Integration test failed", "✗".red());
        }

        let output = formatter.write(&result)?;
        println!("{}", output);

        Ok(())
    }

    async fn remove(&self, client: &dyn ApiClient, id: &str, yes: bool) -> CliResult<()> {
        if !yes {
            let confirm = Confirm::new()
                .with_prompt(format!("Remove integration {}?", id))
                .default(false)
                .interact()
                .unwrap();

            if !confirm {
                println!("{}", "Removal cancelled".yellow());
                return Ok(());
            }
        }

        println!("{}", "Removing integration...".cyan());

        client.remove_integration(id).await?;

        println!("{} Integration removed", "✓".green());

        Ok(())
    }
}
