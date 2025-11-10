//! Metrics and analytics commands

use crate::{
    client::{ApiClient, CostQuery, ExportMetricsQuery, MetricsQuery, PerformanceQuery, QualityQuery},
    output::OutputWriter,
    CliResult,
};
use clap::Subcommand;
use colored::Colorize;
use std::path::PathBuf;

#[derive(Debug, Subcommand)]
pub enum MetricsCommand {
    /// Query metrics
    Query {
        /// Metric names (comma-separated)
        #[arg(short, long, value_delimiter = ',')]
        metrics: Vec<String>,

        /// Date range start
        #[arg(long)]
        from: Option<String>,

        /// Date range end
        #[arg(long)]
        to: Option<String>,

        /// Aggregation method
        #[arg(short, long)]
        aggregation: Option<String>,
    },

    /// Get performance metrics
    Performance {
        /// Filter by service
        #[arg(short, long)]
        service: Option<String>,

        /// Date range start
        #[arg(long)]
        from: Option<String>,

        /// Date range end
        #[arg(long)]
        to: Option<String>,
    },

    /// Get cost analysis
    Cost {
        /// Filter by service
        #[arg(short, long)]
        service: Option<String>,

        /// Date range start
        #[arg(long)]
        from: Option<String>,

        /// Date range end
        #[arg(long)]
        to: Option<String>,
    },

    /// Get quality metrics
    Quality {
        /// Filter by service
        #[arg(short, long)]
        service: Option<String>,

        /// Date range start
        #[arg(long)]
        from: Option<String>,

        /// Date range end
        #[arg(long)]
        to: Option<String>,
    },

    /// Export metrics data
    Export {
        /// Export format (csv, json, yaml)
        #[arg(short, long, default_value = "csv")]
        format: String,

        /// Output file path
        #[arg(short, long)]
        output: Option<PathBuf>,

        /// Date range start
        #[arg(long)]
        from: Option<String>,

        /// Date range end
        #[arg(long)]
        to: Option<String>,
    },
}

impl MetricsCommand {
    pub async fn execute(
        &self,
        client: &dyn ApiClient,
        formatter: &dyn OutputWriter,
    ) -> CliResult<()> {
        match self {
            MetricsCommand::Query {
                metrics,
                from,
                to,
                aggregation,
            } => self.query(client, formatter, metrics, from, to, aggregation).await,
            MetricsCommand::Performance { service, from, to } => {
                self.performance(client, formatter, service, from, to).await
            }
            MetricsCommand::Cost { service, from, to } => {
                self.cost(client, formatter, service, from, to).await
            }
            MetricsCommand::Quality { service, from, to } => {
                self.quality(client, formatter, service, from, to).await
            }
            MetricsCommand::Export {
                format,
                output,
                from,
                to,
            } => self.export(client, format, output, from, to).await,
        }
    }

    async fn query(
        &self,
        client: &dyn ApiClient,
        formatter: &dyn OutputWriter,
        metrics: &[String],
        from: &Option<String>,
        to: &Option<String>,
        aggregation: &Option<String>,
    ) -> CliResult<()> {
        let query = MetricsQuery {
            metric_names: metrics.to_vec(),
            from: from.clone(),
            to: to.clone(),
            aggregation: aggregation.clone(),
        };

        let response = client.query_metrics(query).await?;

        let output = formatter.write(&response)?;
        println!("{}", output);

        Ok(())
    }

    async fn performance(
        &self,
        client: &dyn ApiClient,
        formatter: &dyn OutputWriter,
        service: &Option<String>,
        from: &Option<String>,
        to: &Option<String>,
    ) -> CliResult<()> {
        let query = PerformanceQuery {
            service: service.clone(),
            from: from.clone(),
            to: to.clone(),
        };

        let metrics = client.get_performance_metrics(query).await?;

        let output = formatter.write(&metrics)?;
        println!("{}", output);

        // Show summary
        println!("\n{}", "Performance Summary:".cyan().bold());
        println!("  Avg Latency: {:.2} ms", metrics.avg_latency_ms);
        println!("  P95 Latency: {:.2} ms", metrics.p95_latency_ms);
        println!("  P99 Latency: {:.2} ms", metrics.p99_latency_ms);
        println!("  Throughput:  {:.2} req/s", metrics.throughput_rps);
        println!("  Error Rate:  {:.2}%", metrics.error_rate * 100.0);

        Ok(())
    }

    async fn cost(
        &self,
        client: &dyn ApiClient,
        formatter: &dyn OutputWriter,
        service: &Option<String>,
        from: &Option<String>,
        to: &Option<String>,
    ) -> CliResult<()> {
        let query = CostQuery {
            service: service.clone(),
            from: from.clone(),
            to: to.clone(),
        };

        let metrics = client.get_cost_metrics(query).await?;

        let output = formatter.write(&metrics)?;
        println!("{}", output);

        // Show summary
        println!("\n{}", "Cost Summary:".cyan().bold());
        println!("  Total Cost:      ${:.2}", metrics.total_cost);
        println!("  Cost per Request: ${:.4}", metrics.cost_per_request);

        if !metrics.cost_breakdown.is_empty() {
            println!("\n  Breakdown:");
            for item in &metrics.cost_breakdown {
                println!("    {}: ${:.2} ({:.1}%)", item.category, item.cost, item.percentage);
            }
        }

        Ok(())
    }

    async fn quality(
        &self,
        client: &dyn ApiClient,
        formatter: &dyn OutputWriter,
        service: &Option<String>,
        from: &Option<String>,
        to: &Option<String>,
    ) -> CliResult<()> {
        let query = QualityQuery {
            service: service.clone(),
            from: from.clone(),
            to: to.clone(),
        };

        let metrics = client.get_quality_metrics(query).await?;

        let output = formatter.write(&metrics)?;
        println!("{}", output);

        // Show summary
        println!("\n{}", "Quality Summary:".cyan().bold());
        println!("  Avg Quality Score: {:.2}", metrics.avg_quality_score);
        println!("  Total Requests:    {}", metrics.total_requests);

        if !metrics.quality_distribution.is_empty() {
            println!("\n  Distribution:");
            for bucket in &metrics.quality_distribution {
                println!("    {}: {} ({:.1}%)", bucket.score_range, bucket.count, bucket.percentage);
            }
        }

        Ok(())
    }

    async fn export(
        &self,
        client: &dyn ApiClient,
        format: &str,
        output: &Option<PathBuf>,
        from: &Option<String>,
        to: &Option<String>,
    ) -> CliResult<()> {
        println!("{}", "Exporting metrics...".cyan());

        let query = ExportMetricsQuery {
            format: format.to_string(),
            from: from.clone(),
            to: to.clone(),
        };

        let data = client.export_metrics(query).await?;

        if let Some(path) = output {
            std::fs::write(path, &data)?;
            println!("{} Metrics exported to {}", "✓".green(), path.display());
        } else {
            println!("{}", data);
        }

        Ok(())
    }
}
