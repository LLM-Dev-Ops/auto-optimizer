//! Admin operation commands

use crate::{client::ApiClient, output::OutputWriter, CliResult};
use clap::Subcommand;
use colored::Colorize;
use dialoguer::Confirm;

#[derive(Debug, Subcommand)]
pub enum AdminCommand {
    /// Get system statistics
    Stats,

    /// Flush cache
    #[command(name = "cache")]
    CacheFlush {
        /// Skip confirmation
        #[arg(short = 'y', long)]
        yes: bool,
    },

    /// Detailed health check
    Health,

    /// Get version information
    Version,
}

impl AdminCommand {
    pub async fn execute(
        &self,
        client: &dyn ApiClient,
        formatter: &dyn OutputWriter,
    ) -> CliResult<()> {
        match self {
            AdminCommand::Stats => self.stats(client, formatter).await,
            AdminCommand::CacheFlush { yes } => self.cache_flush(client, formatter, *yes).await,
            AdminCommand::Health => self.health(client, formatter).await,
            AdminCommand::Version => self.version(client, formatter).await,
        }
    }

    async fn stats(&self, client: &dyn ApiClient, formatter: &dyn OutputWriter) -> CliResult<()> {
        let stats = client.get_stats().await?;

        let output = formatter.write(&stats)?;
        println!("{}", output);

        // Show summary
        println!("\n{}", "System Summary:".cyan().bold());
        println!("  Uptime:               {} seconds", stats.uptime_seconds);
        println!("  Total Optimizations:  {}", stats.total_optimizations);
        println!("  Active Optimizations: {}", stats.active_optimizations);
        println!("  Total Cost Saved:     ${:.2}", stats.total_cost_saved);
        println!("  Memory Usage:         {:.2} MB", stats.memory_usage_bytes as f64 / 1024.0 / 1024.0);
        println!("  CPU Usage:            {:.1}%", stats.cpu_usage_percent);

        Ok(())
    }

    async fn cache_flush(
        &self,
        client: &dyn ApiClient,
        formatter: &dyn OutputWriter,
        yes: bool,
    ) -> CliResult<()> {
        if !yes {
            let confirm = Confirm::new()
                .with_prompt("Flush all caches? This may temporarily affect performance.")
                .default(false)
                .interact()
                .unwrap();

            if !confirm {
                println!("{}", "Cache flush cancelled".yellow());
                return Ok(());
            }
        }

        println!("{}", "Flushing cache...".cyan());

        let result = client.flush_cache().await?;

        println!("{} Cache flushed", "✓".green());

        let output = formatter.write(&result)?;
        println!("{}", output);

        Ok(())
    }

    async fn health(&self, client: &dyn ApiClient, formatter: &dyn OutputWriter) -> CliResult<()> {
        let health = client.get_detailed_health().await?;

        let output = formatter.write(&health)?;
        println!("{}", output);

        // Show component status
        println!("\n{}", "Component Health:".cyan().bold());
        for component in &health.components {
            let status_icon = match component.status.as_str() {
                "healthy" => "✓".green(),
                "degraded" => "⚠".yellow(),
                "unhealthy" => "✗".red(),
                _ => "?".white(),
            };

            print!("  {} {}", status_icon, component.name);
            if let Some(msg) = &component.message {
                print!(" - {}", msg);
            }
            println!();
        }

        Ok(())
    }

    async fn version(
        &self,
        client: &dyn ApiClient,
        formatter: &dyn OutputWriter,
    ) -> CliResult<()> {
        let version = client.get_version().await?;

        let output = formatter.write(&version)?;
        println!("{}", output);

        println!("\n{}", "Version Information:".cyan().bold());
        println!("  Version:      {}", version.version);
        println!("  Build Date:   {}", version.build_date);
        println!("  Commit Hash:  {}", version.commit_hash);
        println!("  Rust Version: {}", version.rust_version);

        Ok(())
    }
}
