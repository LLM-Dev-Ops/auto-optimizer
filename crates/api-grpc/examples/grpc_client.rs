//! Example gRPC client demonstrating all service interactions

use llm_optimizer_api_grpc::proto::optimization::*;
use tonic::metadata::MetadataValue;
use tonic::transport::Channel;
use tonic::Request;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    println!("Connecting to gRPC server at http://localhost:50051...");

    // Connect to server
    let channel = Channel::from_static("http://localhost:50051")
        .connect()
        .await?;

    let mut client = optimization_service_client::OptimizationServiceClient::new(channel);

    // Example: Create an optimization
    println!("\n=== Creating Optimization ===");
    let create_request = CreateOptimizationRequest {
        strategy: OptimizationStrategy::CostPerformanceScoring as i32,
        target_services: vec!["example-service".to_string()],
        changes: vec![ConfigurationChange {
            parameter: "model".to_string(),
            old_value: "claude-3-opus-20240229".to_string(),
            new_value: "claude-3-haiku-20240307".to_string(),
            change_type: ChangeType::Replace as i32,
        }],
        rationale: "Reduce costs by 50% with minimal quality impact".to_string(),
        expected_impact: Some(ExpectedImpact {
            cost_reduction_pct: 50.0,
            quality_delta_pct: -5.0,
            latency_delta_pct: 10.0,
            confidence: 0.85,
        }),
        constraints: vec![Constraint {
            constraint_type: "min_quality".to_string(),
            value: "0.8".to_string(),
            hard: true,
        }],
        auto_deploy: false,
    };

    // Add authentication (in production, use real JWT)
    let mut request = Request::new(create_request);
    let token = "demo-token";
    request.metadata_mut().insert(
        "authorization",
        MetadataValue::from_str(&format!("Bearer {}", token))?,
    );

    let response = client.create_optimization(request).await?;
    let decision = response.into_inner().decision.unwrap();

    println!("Created optimization with ID: {}", decision.id);
    println!("Status: {:?}", decision.status);
    println!("Expected cost reduction: {}%", decision.expected_impact.as_ref().unwrap().cost_reduction_pct);

    // Example: Get optimization details
    println!("\n=== Getting Optimization Details ===");
    let get_request = GetOptimizationRequest {
        decision_id: decision.id.clone(),
    };

    let response = client.get_optimization(get_request).await?;
    let retrieved_decision = response.into_inner().decision.unwrap();

    println!("Retrieved optimization: {}", retrieved_decision.id);
    println!("Rationale: {}", retrieved_decision.rationale);

    // Example: List optimizations
    println!("\n=== Listing Optimizations ===");
    let list_request = ListOptimizationsRequest {
        status_filter: vec![],
        strategy_filter: vec![],
        time_range: None,
        pagination: Some(llm_optimizer_api_grpc::proto::common::PageRequest {
            page: 1,
            page_size: 10,
            sort_by: "created_at".to_string(),
            ascending: false,
        }),
    };

    let response = client.list_optimizations(list_request).await?;
    let list_response = response.into_inner();

    println!(
        "Found {} optimizations",
        list_response.pagination.as_ref().unwrap().total_items
    );

    // Example: Validate optimization
    println!("\n=== Validating Optimization ===");
    let validate_request = ValidateOptimizationRequest {
        decision_id: decision.id.clone(),
        dry_run: true,
    };

    let response = client.validate_optimization(validate_request).await?;
    let validation = response.into_inner().validation.unwrap();

    println!("Validation result: {}", if validation.valid { "✓ PASSED" } else { "✗ FAILED" });
    if !validation.warnings.is_empty() {
        println!("Warnings:");
        for warning in &validation.warnings {
            println!("  - {}", warning);
        }
    }

    // Example: Deploy optimization
    if validation.valid {
        println!("\n=== Deploying Optimization ===");
        let deploy_request = DeployOptimizationRequest {
            decision_id: decision.id.clone(),
            force: false,
            canary: true,
            canary_percentage: 10.0,
        };

        let response = client.deploy_optimization(deploy_request).await?;
        let deploy_response = response.into_inner();

        println!("Deployment initiated");
        println!("Deployment ID: {}", deploy_response.deployment_id);
        println!("Status: {:?}", deploy_response.decision.unwrap().status);
    }

    println!("\n=== Client Example Complete ===");

    Ok(())
}
