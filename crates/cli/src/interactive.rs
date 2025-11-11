//! Interactive mode for CLI

use crate::{client::ApiClient, Formatter, CliResult};
use colored::Colorize;
use dialoguer::{theme::ColorfulTheme, Select};

/// Interactive mode main menu
pub async fn run_interactive_mode(
    client: &dyn ApiClient,
    formatter: &Formatter,
) -> CliResult<()> {
    loop {
        println!("\n{}", "=== LLM Auto Optimizer ===".cyan().bold());

        let options = vec![
            "Create Optimization",
            "List Optimizations",
            "View Metrics",
            "Manage Integrations",
            "Configuration",
            "System Status",
            "Exit",
        ];

        let selection = Select::with_theme(&ColorfulTheme::default())
            .with_prompt("Select an option")
            .items(&options)
            .default(0)
            .interact()
            .unwrap();

        match selection {
            0 => create_optimization_interactive(client, formatter).await?,
            1 => list_optimizations_interactive(client, formatter).await?,
            2 => view_metrics_interactive(client, formatter).await?,
            3 => manage_integrations_interactive(client, formatter).await?,
            4 => configuration_interactive(client, formatter).await?,
            5 => system_status_interactive(client, formatter).await?,
            6 => {
                println!("{}", "Goodbye!".green());
                break;
            }
            _ => {}
        }
    }

    Ok(())
}

async fn create_optimization_interactive(
    client: &dyn ApiClient,
    formatter: &Formatter,
) -> CliResult<()> {
    use crate::commands::optimize::OptimizeCommand;

    println!("\n{}", "Create Optimization".cyan().bold());

    let cmd = OptimizeCommand::Create {
        services: vec![],
        strategy: "cost-performance-scoring".to_string(),
        dry_run: false,
        interactive: true,
    };

    cmd.execute(client, formatter).await
}

async fn list_optimizations_interactive(
    client: &dyn ApiClient,
    formatter: &Formatter,
) -> CliResult<()> {
    use crate::commands::optimize::OptimizeCommand;

    println!("\n{}", "List Optimizations".cyan().bold());

    let cmd = OptimizeCommand::List {
        status: None,
        strategy: None,
        service: None,
        from: None,
        to: None,
    };

    cmd.execute(client, formatter).await
}

async fn view_metrics_interactive(
    client: &dyn ApiClient,
    formatter: &Formatter,
) -> CliResult<()> {
    println!("\n{}", "View Metrics".cyan().bold());

    let options = vec!["Performance", "Cost", "Quality", "Back"];

    let selection = Select::with_theme(&ColorfulTheme::default())
        .with_prompt("Select metric type")
        .items(&options)
        .default(0)
        .interact()
        .unwrap();

    match selection {
        0 => {
            use crate::commands::metrics::MetricsCommand;
            let cmd = MetricsCommand::Performance {
                service: None,
                from: None,
                to: None,
            };
            cmd.execute(client, formatter).await
        }
        1 => {
            use crate::commands::metrics::MetricsCommand;
            let cmd = MetricsCommand::Cost {
                service: None,
                from: None,
                to: None,
            };
            cmd.execute(client, formatter).await
        }
        2 => {
            use crate::commands::metrics::MetricsCommand;
            let cmd = MetricsCommand::Quality {
                service: None,
                from: None,
                to: None,
            };
            cmd.execute(client, formatter).await
        }
        _ => Ok(()),
    }
}

async fn manage_integrations_interactive(
    client: &dyn ApiClient,
    formatter: &Formatter,
) -> CliResult<()> {
    use crate::commands::integration::IntegrationCommand;

    println!("\n{}", "Manage Integrations".cyan().bold());

    let cmd = IntegrationCommand::List;
    cmd.execute(client, formatter).await
}

async fn configuration_interactive(
    client: &dyn ApiClient,
    formatter: &Formatter,
) -> CliResult<()> {
    use crate::commands::config::ConfigCommand;

    println!("\n{}", "Configuration".cyan().bold());

    let cmd = ConfigCommand::List;
    cmd.execute(client, formatter).await
}

async fn system_status_interactive(
    client: &dyn ApiClient,
    formatter: &Formatter,
) -> CliResult<()> {
    use crate::commands::admin::AdminCommand;

    println!("\n{}", "System Status".cyan().bold());

    let cmd = AdminCommand::Stats;
    cmd.execute(client, formatter).await
}
