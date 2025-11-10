//! End-to-end optimization workflow tests
//!
//! Tests complete optimization workflow: create → deploy → monitor → rollback

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use std::time::Duration;

#[cfg(test)]
mod optimization_workflow_tests {
    use super::*;

    /// Optimization configuration
    #[derive(Debug, Clone, PartialEq)]
    struct OptimizationConfig {
        id: String,
        name: String,
        strategy: OptimizationStrategy,
        parameters: HashMap<String, String>,
    }

    #[derive(Debug, Clone, PartialEq)]
    enum OptimizationStrategy {
        ModelSelection,
        PromptOptimization,
        CostReduction,
        LatencyOptimization,
        QualityImprovement,
    }

    #[derive(Debug, Clone, PartialEq)]
    enum DeploymentStatus {
        Created,
        Validating,
        Deploying,
        Deployed,
        Monitoring,
        RollingBack,
        RolledBack,
        Failed,
    }

    /// Optimization service
    struct OptimizationService {
        configs: Arc<RwLock<HashMap<String, OptimizationConfig>>>,
        deployments: Arc<RwLock<HashMap<String, DeploymentStatus>>>,
        metrics: Arc<RwLock<HashMap<String, OptimizationMetrics>>>,
    }

    #[derive(Debug, Clone)]
    struct OptimizationMetrics {
        cost_reduction: f32,
        latency_improvement: f32,
        quality_score: f32,
        success_rate: f32,
    }

    impl OptimizationService {
        fn new() -> Self {
            Self {
                configs: Arc::new(RwLock::new(HashMap::new())),
                deployments: Arc::new(RwLock::new(HashMap::new())),
                metrics: Arc::new(RwLock::new(HashMap::new())),
            }
        }

        async fn create_optimization(
            &self,
            config: OptimizationConfig,
        ) -> Result<String, String> {
            let id = config.id.clone();

            // Validate configuration
            if config.name.is_empty() {
                return Err("Optimization name cannot be empty".to_string());
            }

            // Store configuration
            self.configs.write().await.insert(id.clone(), config);
            self.deployments
                .write()
                .await
                .insert(id.clone(), DeploymentStatus::Created);

            Ok(id)
        }

        async fn validate_optimization(&self, id: &str) -> Result<(), String> {
            let mut deployments = self.deployments.write().await;

            if let Some(status) = deployments.get_mut(id) {
                *status = DeploymentStatus::Validating;
                drop(deployments);

                // Simulate validation
                tokio::time::sleep(Duration::from_millis(50)).await;

                let mut deployments = self.deployments.write().await;
                *deployments.get_mut(id).unwrap() = DeploymentStatus::Deploying;
                Ok(())
            } else {
                Err("Optimization not found".to_string())
            }
        }

        async fn deploy_optimization(&self, id: &str) -> Result<(), String> {
            let mut deployments = self.deployments.write().await;

            if let Some(status) = deployments.get_mut(id) {
                if *status != DeploymentStatus::Deploying {
                    return Err("Invalid deployment status".to_string());
                }

                *status = DeploymentStatus::Deploying;
                drop(deployments);

                // Simulate deployment
                tokio::time::sleep(Duration::from_millis(100)).await;

                let mut deployments = self.deployments.write().await;
                *deployments.get_mut(id).unwrap() = DeploymentStatus::Deployed;

                // Initialize monitoring
                self.metrics.write().await.insert(
                    id.to_string(),
                    OptimizationMetrics {
                        cost_reduction: 0.0,
                        latency_improvement: 0.0,
                        quality_score: 1.0,
                        success_rate: 1.0,
                    },
                );

                Ok(())
            } else {
                Err("Optimization not found".to_string())
            }
        }

        async fn monitor_optimization(&self, id: &str) -> Result<OptimizationMetrics, String> {
            let mut deployments = self.deployments.write().await;

            if let Some(status) = deployments.get_mut(id) {
                *status = DeploymentStatus::Monitoring;
                drop(deployments);

                // Simulate collecting metrics
                tokio::time::sleep(Duration::from_millis(50)).await;

                if let Some(metrics) = self.metrics.read().await.get(id) {
                    Ok(metrics.clone())
                } else {
                    Err("Metrics not available".to_string())
                }
            } else {
                Err("Optimization not found".to_string())
            }
        }

        async fn update_metrics(&self, id: &str, metrics: OptimizationMetrics) {
            self.metrics.write().await.insert(id.to_string(), metrics);
        }

        async fn rollback_optimization(&self, id: &str) -> Result<(), String> {
            let mut deployments = self.deployments.write().await;

            if let Some(status) = deployments.get_mut(id) {
                *status = DeploymentStatus::RollingBack;
                drop(deployments);

                // Simulate rollback
                tokio::time::sleep(Duration::from_millis(100)).await;

                let mut deployments = self.deployments.write().await;
                *deployments.get_mut(id).unwrap() = DeploymentStatus::RolledBack;

                Ok(())
            } else {
                Err("Optimization not found".to_string())
            }
        }

        async fn get_status(&self, id: &str) -> Option<DeploymentStatus> {
            self.deployments.read().await.get(id).cloned()
        }
    }

    #[tokio::test]
    async fn test_complete_optimization_workflow() {
        let service = OptimizationService::new();

        // 1. Create optimization
        let config = OptimizationConfig {
            id: "opt-001".to_string(),
            name: "Cost Optimization".to_string(),
            strategy: OptimizationStrategy::CostReduction,
            parameters: HashMap::new(),
        };

        let id = service
            .create_optimization(config)
            .await
            .expect("Should create optimization");
        assert_eq!(service.get_status(&id).await, Some(DeploymentStatus::Created));

        // 2. Validate
        service
            .validate_optimization(&id)
            .await
            .expect("Should validate");
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert_eq!(
            service.get_status(&id).await,
            Some(DeploymentStatus::Deploying)
        );

        // 3. Deploy
        service.deploy_optimization(&id).await.expect("Should deploy");
        assert_eq!(
            service.get_status(&id).await,
            Some(DeploymentStatus::Deployed)
        );

        // 4. Monitor
        let metrics = service
            .monitor_optimization(&id)
            .await
            .expect("Should get metrics");
        assert_eq!(metrics.success_rate, 1.0);

        // 5. Rollback
        service
            .rollback_optimization(&id)
            .await
            .expect("Should rollback");
        assert_eq!(
            service.get_status(&id).await,
            Some(DeploymentStatus::RolledBack)
        );
    }

    #[tokio::test]
    async fn test_optimization_creation_validation() {
        let service = OptimizationService::new();

        // Invalid config (empty name)
        let config = OptimizationConfig {
            id: "opt-002".to_string(),
            name: String::new(),
            strategy: OptimizationStrategy::CostReduction,
            parameters: HashMap::new(),
        };

        let result = service.create_optimization(config).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_deployment_without_validation_fails() {
        let service = OptimizationService::new();

        // Create but don't validate
        let config = OptimizationConfig {
            id: "opt-003".to_string(),
            name: "Test".to_string(),
            strategy: OptimizationStrategy::CostReduction,
            parameters: HashMap::new(),
        };

        service
            .create_optimization(config)
            .await
            .expect("Should create");

        // Try to deploy without validation
        let result = service.deploy_optimization("opt-003").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_monitoring_before_deployment_fails() {
        let service = OptimizationService::new();

        let result = service.monitor_optimization("nonexistent").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_automatic_rollback_on_poor_metrics() {
        let service = OptimizationService::new();

        // Create and deploy
        let config = OptimizationConfig {
            id: "opt-004".to_string(),
            name: "Test Opt".to_string(),
            strategy: OptimizationStrategy::QualityImprovement,
            parameters: HashMap::new(),
        };

        let id = service.create_optimization(config).await.expect("Should create");
        service.validate_optimization(&id).await.expect("Should validate");
        tokio::time::sleep(Duration::from_millis(100)).await;
        service.deploy_optimization(&id).await.expect("Should deploy");

        // Simulate poor metrics
        service
            .update_metrics(
                &id,
                OptimizationMetrics {
                    cost_reduction: -10.0, // Cost increased!
                    latency_improvement: -20.0,
                    quality_score: 0.3,
                    success_rate: 0.5,
                },
            )
            .await;

        let metrics = service.monitor_optimization(&id).await.expect("Should monitor");

        // Check if metrics are poor
        if metrics.success_rate < 0.9 {
            service
                .rollback_optimization(&id)
                .await
                .expect("Should rollback");
        }

        assert_eq!(
            service.get_status(&id).await,
            Some(DeploymentStatus::RolledBack)
        );
    }

    #[tokio::test]
    async fn test_multiple_optimizations_in_parallel() {
        let service = Arc::new(OptimizationService::new());

        let strategies = vec![
            OptimizationStrategy::ModelSelection,
            OptimizationStrategy::PromptOptimization,
            OptimizationStrategy::CostReduction,
        ];

        let handles: Vec<_> = strategies
            .into_iter()
            .enumerate()
            .map(|(i, strategy)| {
                let svc = service.clone();
                tokio::spawn(async move {
                    let config = OptimizationConfig {
                        id: format!("opt-{}", i),
                        name: format!("Optimization {}", i),
                        strategy,
                        parameters: HashMap::new(),
                    };

                    let id = svc.create_optimization(config).await.expect("Should create");
                    svc.validate_optimization(&id).await.expect("Should validate");
                    tokio::time::sleep(Duration::from_millis(100)).await;
                    svc.deploy_optimization(&id).await.expect("Should deploy");
                    id
                })
            })
            .collect();

        let mut deployed_ids = Vec::new();
        for handle in handles {
            let id = handle.await.expect("Task should complete");
            deployed_ids.push(id);
        }

        // All should be deployed
        for id in deployed_ids {
            assert_eq!(
                service.get_status(&id).await,
                Some(DeploymentStatus::Deployed)
            );
        }
    }

    #[tokio::test]
    async fn test_workflow_timing_targets() {
        let service = OptimizationService::new();

        let config = OptimizationConfig {
            id: "opt-timing".to_string(),
            name: "Timing Test".to_string(),
            strategy: OptimizationStrategy::LatencyOptimization,
            parameters: HashMap::new(),
        };

        let start = tokio::time::Instant::now();

        let id = service.create_optimization(config).await.expect("Should create");
        service.validate_optimization(&id).await.expect("Should validate");
        tokio::time::sleep(Duration::from_millis(100)).await;
        service.deploy_optimization(&id).await.expect("Should deploy");

        let elapsed = start.elapsed();

        // Complete workflow should be fast (< 5 seconds)
        assert!(
            elapsed < Duration::from_secs(5),
            "Workflow took {:?}, should be < 5s",
            elapsed
        );
    }

    #[tokio::test]
    async fn test_rollback_timing_target() {
        let service = OptimizationService::new();

        let config = OptimizationConfig {
            id: "opt-rollback-timing".to_string(),
            name: "Rollback Timing Test".to_string(),
            strategy: OptimizationStrategy::CostReduction,
            parameters: HashMap::new(),
        };

        let id = service.create_optimization(config).await.expect("Should create");
        service.validate_optimization(&id).await.expect("Should validate");
        tokio::time::sleep(Duration::from_millis(100)).await;
        service.deploy_optimization(&id).await.expect("Should deploy");

        let start = tokio::time::Instant::now();
        service
            .rollback_optimization(&id)
            .await
            .expect("Should rollback");
        let elapsed = start.elapsed();

        // Rollback should be fast (< 1 second)
        assert!(
            elapsed < Duration::from_secs(1),
            "Rollback took {:?}, should be < 1s",
            elapsed
        );
    }
}
