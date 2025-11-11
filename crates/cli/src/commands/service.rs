//! Service management commands

use crate::{client::ApiClient, output::OutputWriter, Formatter, CliResult};
use clap::Subcommand;
use colored::Colorize;

#[derive(Debug, Subcommand)]
pub enum ServiceCommand {
    /// Start the LLM Auto Optimizer service
    Start,

    /// Stop the service
    Stop,

    /// Restart the service
    Restart,

    /// Get service status
    Status,

    /// Tail service logs
    #[command(name = "logs")]
    Logs {
        /// Number of lines to show
        #[arg(short = 'n', long, default_value = "100")]
        lines: usize,

        /// Follow log output
        #[arg(short, long)]
        follow: bool,
    },
}

impl ServiceCommand {
    pub async fn execute(
        &self,
        client: &dyn ApiClient,
        formatter: &Formatter,
    ) -> CliResult<()> {
        match self {
            ServiceCommand::Start => self.start(client).await,
            ServiceCommand::Stop => self.stop(client).await,
            ServiceCommand::Restart => self.restart(client).await,
            ServiceCommand::Status => self.status(client, formatter).await,
            ServiceCommand::Logs { lines, follow } => self.logs(*lines, *follow).await,
        }
    }

    async fn start(&self, client: &dyn ApiClient) -> CliResult<()> {
        println!("{}", "Starting service...".cyan());

        let response = client.start_service().await?;

        if response.status == "started" {
            println!("{} {}", "✓".green(), response.message.green());
        } else {
            println!("{} {}", "!".yellow(), response.message);
        }

        Ok(())
    }

    async fn stop(&self, client: &dyn ApiClient) -> CliResult<()> {
        println!("{}", "Stopping service...".cyan());

        let response = client.stop_service().await?;

        if response.status == "stopped" {
            println!("{} {}", "✓".green(), response.message.green());
        } else {
            println!("{} {}", "!".yellow(), response.message);
        }

        Ok(())
    }

    async fn restart(&self, client: &dyn ApiClient) -> CliResult<()> {
        println!("{}", "Restarting service...".cyan());

        let response = client.restart_service().await?;

        if response.status == "restarted" {
            println!("{} {}", "✓".green(), response.message.green());
        } else {
            println!("{} {}", "!".yellow(), response.message);
        }

        Ok(())
    }

    async fn status(
        &self,
        client: &dyn ApiClient,
        formatter: &Formatter,
    ) -> CliResult<()> {
        let status = client.get_service_status().await?;

        let output = formatter.write(&status)?;
        println!("{}", output);

        if status.running {
            println!("\n{} Service is running", "✓".green());
        } else {
            println!("\n{} Service is not running", "✗".red());
        }

        Ok(())
    }

    async fn logs(&self, lines: usize, follow: bool) -> CliResult<()> {
        if follow {
            println!("{}", "Following logs (Ctrl+C to stop)...".cyan());
            // In a real implementation, this would stream logs from the service
            println!("{}", "Log streaming not yet implemented".yellow());
        } else {
            println!("{}", format!("Showing last {} log lines...", lines).cyan());
            // In a real implementation, this would fetch logs from the service
            println!("{}", "Log fetching not yet implemented".yellow());
        }

        Ok(())
    }
}
