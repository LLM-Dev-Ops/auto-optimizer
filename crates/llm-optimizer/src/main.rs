//! LLM Auto Optimizer - Main Service Binary
//!
//! Production-ready main service with enterprise-grade quality.
//! This binary orchestrates all components of the LLM Auto Optimizer system.

use anyhow::{Context, Result};
use clap::Parser;
use llm_optimizer::{
    config::Config,
    health::{HealthMonitor, HealthMonitorConfig},
    metrics::{MetricsAggregator, ResourceMonitor},
    service::{
        CollectorService, GrpcApiService, IntegrationsService, ProcessorService, RestApiService,
        ServiceManager, ServiceManagerConfig, StorageService,
    },
    signals::SignalHandler,
};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{error, info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

/// Command line arguments
#[derive(Debug, Parser)]
#[command(name = "llm-optimizer")]
#[command(about = "LLM Auto Optimizer - Production-ready optimization service", long_about = None)]
#[command(version)]
struct Cli {
    /// Path to configuration file
    #[arg(short, long, value_name = "FILE")]
    config: Option<PathBuf>,

    /// Override log level
    #[arg(short, long, value_name = "LEVEL")]
    log_level: Option<String>,

    /// Enable JSON logging
    #[arg(long)]
    json_logs: bool,

    /// Validate configuration and exit
    #[arg(long)]
    validate_config: bool,

    /// Print default configuration and exit
    #[arg(long)]
    print_default_config: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    // Parse command line arguments
    let cli = Cli::parse();

    // Print default config if requested
    if cli.print_default_config {
        let default_config = Config::default();
        let yaml = serde_yaml::to_string(&default_config)?;
        println!("{}", yaml);
        return Ok(());
    }

    // Load configuration
    let config = Config::load(cli.config.clone())
        .context("Failed to load configuration")?;

    // Validate configuration if requested
    if cli.validate_config {
        config.validate().context("Configuration validation failed")?;
        println!("Configuration is valid");
        return Ok(());
    }

    // Initialize observability
    init_observability(&config, &cli)?;

    info!("Starting LLM Auto Optimizer v{}", env!("CARGO_PKG_VERSION"));
    info!("Environment: {}", config.service.environment);

    // Create shared state
    let config = Arc::new(RwLock::new(config));

    // Initialize metrics aggregator
    let metrics = Arc::new(MetricsAggregator::new());

    // Initialize health monitor
    let health_monitor = Arc::new(HealthMonitor::new(HealthMonitorConfig::default()));

    // Initialize signal handler
    let signal_handler = SignalHandler::new();
    let mut shutdown_rx = signal_handler.subscribe_shutdown();
    let mut reload_rx = signal_handler.subscribe_reload();

    // Start signal handler
    signal_handler.listen().await?;

    // Initialize service manager
    let service_manager = Arc::new(ServiceManager::new(ServiceManagerConfig::default()));

    // Create and register services
    info!("Initializing services");

    let config_guard = config.read().await;

    // Storage service (no dependencies)
    if true {
        let storage_config = llm_optimizer::service::storage::StorageServiceConfig {
            storage_config: llm_optimizer_processor::StorageConfig::default(),
        };
        let storage_service = Box::new(StorageService::new(storage_config));
        service_manager.add_service(storage_service).await;
        health_monitor.register_service("storage".to_string()).await;
    }

    // Collector service (no dependencies)
    if config_guard.collector.enabled {
        let collector_config = llm_optimizer::service::collector::CollectorServiceConfig {
            collector_config: llm_optimizer_collector::FeedbackCollectorConfig::default(),
        };
        let collector_service = Box::new(CollectorService::new(collector_config));
        service_manager.add_service(collector_service).await;
        health_monitor.register_service("collector".to_string()).await;
    }

    // Integrations service (no dependencies)
    if true {
        let integrations_config = llm_optimizer::service::integrations::IntegrationsServiceConfig {
            jira_config: None,
            anthropic_config: None,
        };
        let integrations_service = Box::new(IntegrationsService::new(integrations_config));
        service_manager.add_service(integrations_service).await;
        health_monitor.register_service("integrations".to_string()).await;
    }

    // Processor service (depends on collector and storage)
    if config_guard.processor.enabled {
        let processor_config = llm_optimizer::service::processor::ProcessorServiceConfig {
            processor_config: llm_optimizer_processor::StreamProcessorConfig::default(),
        };
        let processor_service = Box::new(ProcessorService::new(processor_config));
        service_manager.add_service(processor_service).await;
        health_monitor.register_service("processor".to_string()).await;
    }

    // REST API service (depends on processor and storage)
    if config_guard.rest_api.enabled {
        let rest_api_config = llm_optimizer::service::rest_api::RestApiServiceConfig {
            server_config: llm_optimizer_api_rest::ServerConfig {
                host: config_guard.service.host.clone(),
                port: config_guard.rest_api.port,
                timeout_secs: config_guard.rest_api.timeout_secs,
                ..Default::default()
            },
        };
        let rest_api_service = Box::new(RestApiService::new(rest_api_config));
        service_manager.add_service(rest_api_service).await;
        health_monitor.register_service("rest-api".to_string()).await;
    }

    // gRPC API service (depends on processor and storage)
    if config_guard.grpc_api.enabled {
        let grpc_api_config = llm_optimizer::service::grpc_api::GrpcApiServiceConfig {
            server_config: llm_optimizer_api_grpc::GrpcServerConfig {
                host: config_guard.service.host.clone(),
                port: config_guard.grpc_api.port,
                ..Default::default()
            },
        };
        let grpc_api_service = Box::new(GrpcApiService::new(grpc_api_config));
        service_manager.add_service(grpc_api_service).await;
        health_monitor.register_service("grpc-api".to_string()).await;
    }

    drop(config_guard);

    // Start all services
    info!("Starting all services");
    service_manager
        .start_all()
        .await
        .context("Failed to start services")?;

    // Start resource monitoring
    let resource_monitor = ResourceMonitor::new((*metrics).clone());
    resource_monitor.start().await?;

    // Start metrics HTTP server
    let metrics_clone = Arc::clone(&metrics);
    let config_guard = config.read().await;
    let metrics_addr: SocketAddr = format!("0.0.0.0:{}", config_guard.observability.metrics_port)
        .parse()
        .context("Invalid metrics address")?;
    drop(config_guard);

    tokio::spawn(async move {
        if let Err(e) = metrics_clone.serve(metrics_addr).await {
            error!("Metrics server error: {}", e);
        }
    });

    // Start health monitoring
    let service_manager_clone = Arc::clone(&service_manager);
    let health_monitor_clone = Arc::clone(&health_monitor);
    tokio::spawn(async move {
        if let Err(e) = service_manager_clone.run_health_monitoring().await {
            error!("Health monitoring error: {}", e);
        }
    });

    info!("LLM Auto Optimizer is running");
    info!("REST API: http://{}:{}",
        config.read().await.service.host,
        config.read().await.rest_api.port
    );
    info!("gRPC API: {}:{}",
        config.read().await.service.host,
        config.read().await.grpc_api.port
    );
    info!("Metrics: http://0.0.0.0:{}/metrics",
        config.read().await.observability.metrics_port
    );

    // Main event loop
    loop {
        tokio::select! {
            // Handle shutdown signal
            _ = shutdown_rx.recv() => {
                info!("Shutdown signal received, stopping services");
                break;
            }

            // Handle reload signal
            _ = reload_rx.recv() => {
                info!("Reload signal received");

                if let Some(config_path) = &cli.config {
                    let mut config_guard = config.write().await;
                    match config_guard.reload(config_path).await {
                        Ok(()) => {
                            info!("Configuration reloaded successfully");
                        }
                        Err(e) => {
                            error!("Failed to reload configuration: {}", e);
                        }
                    }
                } else {
                    warn!("Cannot reload configuration: no config file specified");
                }
            }
        }
    }

    // Graceful shutdown
    info!("Initiating graceful shutdown");

    service_manager
        .stop_all()
        .await
        .context("Error during shutdown")?;

    // Get final health report
    let health_report = health_monitor.get_health_report().await;
    info!("Final health report: {} services tracked", health_report.len());

    info!("LLM Auto Optimizer shutdown complete");

    Ok(())
}

/// Initialize observability (logging and tracing)
fn init_observability(config: &Config, cli: &Cli) -> Result<()> {
    // Determine log level
    let log_level = cli
        .log_level
        .as_ref()
        .unwrap_or(&config.observability.log_level);

    // Build environment filter
    let env_filter = EnvFilter::try_from_default_env()
        .or_else(|_| EnvFilter::try_new(log_level))
        .context("Invalid log level")?;

    // Build subscriber
    if cli.json_logs || config.observability.json_logging {
        // JSON logging for production
        tracing_subscriber::registry()
            .with(env_filter)
            .with(tracing_subscriber::fmt::layer().json())
            .init();
    } else {
        // Pretty logging for development
        tracing_subscriber::registry()
            .with(env_filter)
            .with(tracing_subscriber::fmt::layer().pretty())
            .init();
    }

    info!("Observability initialized with log level: {}", log_level);

    Ok(())
}
