//! Optimization operation commands

use crate::{
    client::{
        ApiClient, ConstraintInput, CreateOptimizationRequest, DeployOptimizationRequest,
        ListOptimizationsQuery, RollbackOptimizationRequest,
    },
    output::OutputWriter,
    Formatter,
    CliResult,
};
use clap::Subcommand;
use colored::Colorize;
use dialoguer::{Confirm, Input, Select};
use indicatif::{ProgressBar, ProgressStyle};
use serde_json::json;
use std::time::Duration;

#[derive(Debug, Subcommand)]
pub enum OptimizeCommand {
    /// Create a new optimization
    Create {
        /// Target services (comma-separated)
        #[arg(short, long, value_delimiter = ',')]
        services: Vec<String>,

        /// Optimization strategy
        #[arg(short = 'S', long, default_value = "cost-performance-scoring")]
        strategy: String,

        /// Dry run (don't actually deploy)
        #[arg(short, long)]
        dry_run: bool,

        /// Interactive mode
        #[arg(short, long)]
        interactive: bool,
    },

    /// List optimizations
    List {
        /// Filter by status
        #[arg(short, long)]
        status: Option<String>,

        /// Filter by strategy
        #[arg(short = 'S', long)]
        strategy: Option<String>,

        /// Filter by service
        #[arg(short = 'v', long)]
        service: Option<String>,

        /// Date range start
        #[arg(long)]
        from: Option<String>,

        /// Date range end
        #[arg(long)]
        to: Option<String>,
    },

    /// Get optimization details
    Get {
        /// Optimization ID
        id: String,
    },

    /// Deploy an optimization
    Deploy {
        /// Optimization ID
        id: String,

        /// Gradual rollout
        #[arg(short, long)]
        gradual: bool,

        /// Rollout percentage (0-100)
        #[arg(short, long, default_value = "10.0")]
        percentage: f64,

        /// Skip confirmation
        #[arg(short = 'y', long)]
        yes: bool,
    },

    /// Rollback an optimization
    Rollback {
        /// Optimization ID
        id: String,

        /// Reason for rollback
        #[arg(short, long)]
        reason: Option<String>,

        /// Skip confirmation
        #[arg(short = 'y', long)]
        yes: bool,
    },

    /// Cancel an optimization
    Cancel {
        /// Optimization ID
        id: String,

        /// Skip confirmation
        #[arg(short = 'y', long)]
        yes: bool,
    },
}

impl OptimizeCommand {
    pub async fn execute(
        &self,
        client: &dyn ApiClient,
        formatter: &Formatter,
    ) -> CliResult<()> {
        match self {
            OptimizeCommand::Create {
                services,
                strategy,
                dry_run,
                interactive,
            } => {
                self.create(client, formatter, services, strategy, *dry_run, *interactive)
                    .await
            }
            OptimizeCommand::List {
                status,
                strategy,
                service,
                from,
                to,
            } => {
                self.list(client, formatter, status, strategy, service, from, to)
                    .await
            }
            OptimizeCommand::Get { id } => self.get(client, formatter, id).await,
            OptimizeCommand::Deploy {
                id,
                gradual,
                percentage,
                yes,
            } => {
                self.deploy(client, formatter, id, *gradual, *percentage, *yes)
                    .await
            }
            OptimizeCommand::Rollback { id, reason, yes } => {
                self.rollback(client, formatter, id, reason, *yes).await
            }
            OptimizeCommand::Cancel { id, yes } => self.cancel(client, formatter, id, *yes).await,
        }
    }

    async fn create(
        &self,
        client: &dyn ApiClient,
        formatter: &Formatter,
        services: &[String],
        strategy: &str,
        dry_run: bool,
        interactive: bool,
    ) -> CliResult<()> {
        let (services, strategy, dry_run) = if interactive {
            self.interactive_create(services, strategy, dry_run)?
        } else {
            (services.to_vec(), strategy.to_string(), dry_run)
        };

        println!(
            "{}",
            "Creating optimization...".cyan()
        );

        let pb = ProgressBar::new_spinner();
        pb.set_style(
            ProgressStyle::default_spinner()
                .template("{spinner:.green} {msg}")
                .unwrap(),
        );
        pb.set_message("Analyzing configuration...");
        pb.enable_steady_tick(Duration::from_millis(100));

        let request = CreateOptimizationRequest {
            target_services: services.clone(),
            strategy: strategy.clone(),
            config: json!({}),
            constraints: vec![],
            dry_run,
        };

        let optimization = client.create_optimization(request).await?;
        pb.finish_and_clear();

        println!("{} Optimization created", "✓".green());
        println!();

        let output = formatter.write(&optimization)?;
        println!("{}", output);

        if dry_run {
            println!("\n{} This was a dry run - no changes were deployed", "ℹ".blue());
        }

        Ok(())
    }

    fn interactive_create(
        &self,
        services: &[String],
        strategy: &str,
        dry_run: bool,
    ) -> CliResult<(Vec<String>, String, bool)> {
        println!("{}", "Interactive Optimization Creation".cyan().bold());
        println!();

        let services = if services.is_empty() {
            let input: String = Input::new()
                .with_prompt("Target services (comma-separated)")
                .interact_text()
                .unwrap();
            input.split(',').map(|s| s.trim().to_string()).collect()
        } else {
            services.to_vec()
        };

        let strategies = vec![
            "cost-performance-scoring",
            "quality-preserving",
            "aggressive-cost-reduction",
            "balanced",
        ];

        let strategy_idx = Select::new()
            .with_prompt("Select optimization strategy")
            .items(&strategies)
            .default(0)
            .interact()
            .unwrap();

        let strategy = strategies[strategy_idx].to_string();

        let dry_run = Confirm::new()
            .with_prompt("Perform dry run?")
            .default(dry_run)
            .interact()
            .unwrap();

        Ok((services, strategy, dry_run))
    }

    async fn list(
        &self,
        client: &dyn ApiClient,
        formatter: &Formatter,
        status: &Option<String>,
        strategy: &Option<String>,
        service: &Option<String>,
        from: &Option<String>,
        to: &Option<String>,
    ) -> CliResult<()> {
        let query = ListOptimizationsQuery {
            status: status.clone(),
            strategy: strategy.clone(),
            service: service.clone(),
            from: from.clone(),
            to: to.clone(),
        };

        let optimizations = client.list_optimizations(query).await?;

        if optimizations.is_empty() {
            println!("{}", "No optimizations found".yellow());
            return Ok(());
        }

        let output = formatter.write(&optimizations)?;
        println!("{}", output);

        println!(
            "\n{} Found {} optimization(s)",
            "ℹ".blue(),
            optimizations.len()
        );

        Ok(())
    }

    async fn get(
        &self,
        client: &dyn ApiClient,
        formatter: &Formatter,
        id: &str,
    ) -> CliResult<()> {
        let optimization = client.get_optimization(id).await?;

        let output = formatter.write(&optimization)?;
        println!("{}", output);

        Ok(())
    }

    async fn deploy(
        &self,
        client: &dyn ApiClient,
        formatter: &Formatter,
        id: &str,
        gradual: bool,
        percentage: f64,
        yes: bool,
    ) -> CliResult<()> {
        if !yes {
            let confirm = Confirm::new()
                .with_prompt(format!(
                    "Deploy optimization {}? This will affect production traffic.",
                    id
                ))
                .default(false)
                .interact()
                .unwrap();

            if !confirm {
                println!("{}", "Deployment cancelled".yellow());
                return Ok(());
            }
        }

        println!("{}", "Deploying optimization...".cyan());

        let pb = ProgressBar::new_spinner();
        pb.set_style(
            ProgressStyle::default_spinner()
                .template("{spinner:.green} {msg}")
                .unwrap(),
        );
        pb.set_message("Applying configuration changes...");
        pb.enable_steady_tick(Duration::from_millis(100));

        let request = DeployOptimizationRequest {
            gradual,
            rollout_percentage: percentage,
        };

        let optimization = client.deploy_optimization(id, request).await?;
        pb.finish_and_clear();

        println!("{} Optimization deployed", "✓".green());
        println!();

        let output = formatter.write(&optimization)?;
        println!("{}", output);

        Ok(())
    }

    async fn rollback(
        &self,
        client: &dyn ApiClient,
        formatter: &Formatter,
        id: &str,
        reason: &Option<String>,
        yes: bool,
    ) -> CliResult<()> {
        if !yes {
            let confirm = Confirm::new()
                .with_prompt(format!("Rollback optimization {}?", id))
                .default(false)
                .interact()
                .unwrap();

            if !confirm {
                println!("{}", "Rollback cancelled".yellow());
                return Ok(());
            }
        }

        let reason = if let Some(r) = reason {
            r.clone()
        } else {
            Input::new()
                .with_prompt("Reason for rollback")
                .interact_text()
                .unwrap()
        };

        println!("{}", "Rolling back optimization...".cyan());

        let pb = ProgressBar::new_spinner();
        pb.set_style(
            ProgressStyle::default_spinner()
                .template("{spinner:.green} {msg}")
                .unwrap(),
        );
        pb.set_message("Reverting configuration changes...");
        pb.enable_steady_tick(Duration::from_millis(100));

        let request = RollbackOptimizationRequest { reason };

        let optimization = client.rollback_optimization(id, request).await?;
        pb.finish_and_clear();

        println!("{} Optimization rolled back", "✓".green());
        println!();

        let output = formatter.write(&optimization)?;
        println!("{}", output);

        Ok(())
    }

    async fn cancel(
        &self,
        client: &dyn ApiClient,
        formatter: &Formatter,
        id: &str,
        yes: bool,
    ) -> CliResult<()> {
        if !yes {
            let confirm = Confirm::new()
                .with_prompt(format!("Cancel optimization {}?", id))
                .default(false)
                .interact()
                .unwrap();

            if !confirm {
                println!("{}", "Cancellation aborted".yellow());
                return Ok(());
            }
        }

        println!("{}", "Cancelling optimization...".cyan());

        let optimization = client.cancel_optimization(id).await?;

        println!("{} Optimization cancelled", "✓".green());
        println!();

        let output = formatter.write(&optimization)?;
        println!("{}", output);

        Ok(())
    }
}
