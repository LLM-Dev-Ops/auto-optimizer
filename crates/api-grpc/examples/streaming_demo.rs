//! Example demonstrating all streaming patterns

use futures::StreamExt;
use llm_optimizer_api_grpc::proto::optimization::*;
use tokio::sync::mpsc;
use tokio_stream::iter;
use tokio_stream::wrappers::ReceiverStream;
use tonic::transport::Channel;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    println!("=== gRPC Streaming Demo ===\n");

    let channel = Channel::from_static("http://localhost:50051")
        .connect()
        .await?;

    let mut client = optimization_service_client::OptimizationServiceClient::new(channel);

    // 1. Server Streaming: Subscribe to events
    println!("1. Server Streaming: Subscribing to optimization events...");

    let subscribe_request = SubscribeOptimizationEventsRequest {
        decision_ids: vec!["opt-123".to_string()],
        status_filter: vec![],
    };

    let mut event_stream = client
        .subscribe_optimization_events(subscribe_request)
        .await?
        .into_inner();

    // Spawn task to handle events
    let event_handler = tokio::spawn(async move {
        let mut count = 0;
        while let Some(result) = event_stream.next().await {
            match result {
                Ok(event) => {
                    println!("  [EVENT] Decision: {}, Status: {:?}", event.decision_id, event.status);
                    count += 1;
                    if count >= 3 {
                        break;
                    }
                }
                Err(e) => {
                    eprintln!("  [ERROR] {}", e);
                    break;
                }
            }
        }
        println!("  Server streaming completed\n");
    });

    // Give it some time to receive events
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
    event_handler.abort();

    // 2. Client Streaming: Batch create optimizations
    println!("2. Client Streaming: Batch creating optimizations...");

    let requests = vec![
        CreateOptimizationRequest {
            strategy: OptimizationStrategy::CostPerformanceScoring as i32,
            target_services: vec!["service-1".to_string()],
            changes: vec![],
            rationale: "Batch optimization 1".to_string(),
            expected_impact: Some(ExpectedImpact {
                cost_reduction_pct: 20.0,
                quality_delta_pct: 0.0,
                latency_delta_pct: 0.0,
                confidence: 0.8,
            }),
            constraints: vec![],
            auto_deploy: false,
        },
        CreateOptimizationRequest {
            strategy: OptimizationStrategy::AdaptiveParameterTuning as i32,
            target_services: vec!["service-2".to_string()],
            changes: vec![],
            rationale: "Batch optimization 2".to_string(),
            expected_impact: Some(ExpectedImpact {
                cost_reduction_pct: 15.0,
                quality_delta_pct: 5.0,
                latency_delta_pct: -10.0,
                confidence: 0.85,
            }),
            constraints: vec![],
            auto_deploy: false,
        },
        CreateOptimizationRequest {
            strategy: OptimizationStrategy::ReinforcementFeedback as i32,
            target_services: vec!["service-3".to_string()],
            changes: vec![],
            rationale: "Batch optimization 3".to_string(),
            expected_impact: Some(ExpectedImpact {
                cost_reduction_pct: 30.0,
                quality_delta_pct: -5.0,
                latency_delta_pct: 5.0,
                confidence: 0.9,
            }),
            constraints: vec![],
            auto_deploy: false,
        },
    ];

    let request_stream = iter(requests);
    let batch_response = client.batch_create_optimizations(request_stream).await?;
    let batch_result = batch_response.into_inner();

    println!("  Batch created {} optimizations", batch_result.successful);
    println!("  Failed: {}", batch_result.failed);
    println!("  Client streaming completed\n");

    // 3. Bidirectional Streaming: Interactive optimization session
    println!("3. Bidirectional Streaming: Starting interactive session...");

    let (tx, rx) = mpsc::channel(100);
    let outbound_stream = ReceiverStream::new(rx);

    let mut inbound_stream = client
        .optimization_session(outbound_stream)
        .await?
        .into_inner();

    // Send initial query
    println!("  Sending optimization query...");
    tx.send(OptimizationSessionMessage {
        message: Some(optimization_session_message::Message::Query(
            OptimizationQuery {
                target_services: vec!["api-gateway".to_string()],
                focus_areas: vec!["cost".to_string(), "performance".to_string()],
                context: [
                    ("current_cost".to_string(), "1000".to_string()),
                    ("target_cost".to_string(), "700".to_string()),
                ]
                .into_iter()
                .collect(),
            },
        )),
    })
    .await?;

    // Process responses
    let session_handler = tokio::spawn(async move {
        while let Some(result) = inbound_stream.next().await {
            match result {
                Ok(message) => {
                    if let Some(optimization_session_message::Message::Suggestion(suggestion)) =
                        message.message
                    {
                        println!("  [SUGGESTION] ID: {}", suggestion.suggestion_id);
                        println!("    Explanation: {}", suggestion.explanation);
                        println!("    Confidence: {}", suggestion.confidence_score);

                        // Send feedback
                        let _ = tx
                            .send(OptimizationSessionMessage {
                                message: Some(optimization_session_message::Message::Feedback(
                                    OptimizationFeedback {
                                        suggestion_id: suggestion.suggestion_id,
                                        accepted: true,
                                        feedback_text: "This looks great!".to_string(),
                                        adjustments: [("priority".to_string(), "high".to_string())]
                                            .into_iter()
                                            .collect(),
                                    },
                                )),
                            })
                            .await;

                        // End session after first suggestion
                        let _ = tx
                            .send(OptimizationSessionMessage {
                                message: Some(optimization_session_message::Message::Control(
                                    OptimizationSessionControl {
                                        r#type: optimization_session_control::ControlType::End as i32,
                                        session_id: "demo-session".to_string(),
                                    },
                                )),
                            })
                            .await;

                        break;
                    }
                }
                Err(e) => {
                    eprintln!("  [ERROR] {}", e);
                    break;
                }
            }
        }
        println!("  Bidirectional streaming completed\n");
    });

    // Wait for session to complete
    tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
    session_handler.abort();

    println!("=== Streaming Demo Complete ===");

    Ok(())
}
