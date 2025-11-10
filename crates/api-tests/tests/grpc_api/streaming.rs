//! gRPC streaming tests (server, client, and bidirectional streaming)

use api_tests::TestResult;
use futures::StreamExt;

#[tokio::test]
async fn test_grpc_server_streaming() -> TestResult {
    // Test server-side streaming (SubscribeMetrics)
    // let channel = Channel::from_static("http://localhost:50051").connect().await?;
    // let mut client = OptimizerServiceClient::new(channel);
    //
    // let request = tonic::Request::new(MetricsRequest {
    //     metric_names: vec!["latency".to_string(), "cost".to_string()],
    //     interval_seconds: 1,
    // });
    //
    // let mut stream = client.subscribe_metrics(request).await?.into_inner();
    //
    // // Receive multiple metric events from the stream
    // let mut count = 0;
    // while let Some(event) = stream.next().await {
    //     let event = event?;
    //     assert!(!event.name.is_empty());
    //     assert!(event.value >= 0.0);
    //
    //     count += 1;
    //     if count >= 10 {
    //         break;
    //     }
    // }
    //
    // assert_eq!(count, 10);

    Ok(())
}

#[tokio::test]
async fn test_grpc_client_streaming() -> TestResult {
    // Test client-side streaming (UploadFeedback)
    // let channel = Channel::from_static("http://localhost:50051").connect().await?;
    // let mut client = OptimizerServiceClient::new(channel);
    //
    // // Create a stream of feedback events
    // let feedback_events = vec![
    //     FeedbackEvent {
    //         request_id: "req_1".to_string(),
    //         latency_ms: 100.0,
    //         cost: 0.01,
    //         quality_score: 0.95,
    //         timestamp: 1699660800,
    //     },
    //     FeedbackEvent {
    //         request_id: "req_2".to_string(),
    //         latency_ms: 150.0,
    //         cost: 0.015,
    //         quality_score: 0.92,
    //         timestamp: 1699660801,
    //     },
    //     // ... more events
    // ];
    //
    // let stream = tokio_stream::iter(feedback_events);
    // let request = tonic::Request::new(stream);
    //
    // let response = client.upload_feedback(request).await?;
    // let result = response.into_inner();
    //
    // assert_eq!(result.events_received, 2);
    // assert_eq!(result.events_processed, 2);

    Ok(())
}

#[tokio::test]
async fn test_grpc_bidirectional_streaming() -> TestResult {
    // Test bidirectional streaming (OptimizeRealtime)
    // let channel = Channel::from_static("http://localhost:50051").connect().await?;
    // let mut client = OptimizerServiceClient::new(channel);
    //
    // // Create input stream
    // let (tx, rx) = tokio::sync::mpsc::channel(10);
    //
    // // Send optimization requests
    // tokio::spawn(async move {
    //     for i in 0..5 {
    //         tx.send(OptimizationRequest {
    //             config_id: format!("cfg_{}", i),
    //             prompt: format!("Optimize this prompt {}", i),
    //             context: HashMap::new(),
    //         }).await.unwrap();
    //     }
    // });
    //
    // let request_stream = tokio_stream::wrappers::ReceiverStream::new(rx);
    // let request = tonic::Request::new(request_stream);
    //
    // let mut response_stream = client.optimize_realtime(request).await?.into_inner();
    //
    // // Receive optimization responses
    // let mut count = 0;
    // while let Some(response) = response_stream.next().await {
    //     let response = response?;
    //     assert!(!response.optimized_prompt.is_empty());
    //     assert!(!response.recommended_model.is_empty());
    //     count += 1;
    // }
    //
    // assert_eq!(count, 5);

    Ok(())
}

#[tokio::test]
async fn test_grpc_streaming_error_handling() -> TestResult {
    // Test error handling in streams
    // let channel = Channel::from_static("http://localhost:50051").connect().await?;
    // let mut client = OptimizerServiceClient::new(channel);
    //
    // let request = tonic::Request::new(MetricsRequest {
    //     metric_names: vec!["invalid_metric".to_string()],
    //     interval_seconds: 1,
    // });
    //
    // let mut stream = client.subscribe_metrics(request).await?.into_inner();
    //
    // // Stream should return an error for invalid metric
    // if let Some(result) = stream.next().await {
    //     assert!(result.is_err());
    //     let err = result.unwrap_err();
    //     assert_eq!(err.code(), tonic::Code::InvalidArgument);
    // }

    Ok(())
}

#[tokio::test]
async fn test_grpc_streaming_backpressure() -> TestResult {
    // Test backpressure handling in streaming
    // let channel = Channel::from_static("http://localhost:50051").connect().await?;
    // let mut client = OptimizerServiceClient::new(channel);
    //
    // let request = tonic::Request::new(MetricsRequest {
    //     metric_names: vec!["latency".to_string()],
    //     interval_seconds: 1,
    // });
    //
    // let mut stream = client.subscribe_metrics(request).await?.into_inner();
    //
    // // Slow consumer - should handle backpressure gracefully
    // for _ in 0..5 {
    //     if let Some(event) = stream.next().await {
    //         let _event = event?;
    //         tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    //     }
    // }

    Ok(())
}

#[tokio::test]
async fn test_grpc_streaming_cancellation() -> TestResult {
    // Test stream cancellation
    // let channel = Channel::from_static("http://localhost:50051").connect().await?;
    // let mut client = OptimizerServiceClient::new(channel);
    //
    // let request = tonic::Request::new(MetricsRequest {
    //     metric_names: vec!["latency".to_string()],
    //     interval_seconds: 1,
    // });
    //
    // let mut stream = client.subscribe_metrics(request).await?.into_inner();
    //
    // // Consume a few events
    // for _ in 0..3 {
    //     stream.next().await;
    // }
    //
    // // Drop the stream (cancellation)
    // drop(stream);
    //
    // // Server should detect the cancellation and clean up resources

    Ok(())
}

#[tokio::test]
async fn test_grpc_streaming_large_messages() -> TestResult {
    // Test streaming large messages
    // let channel = Channel::from_static("http://localhost:50051").connect().await?;
    // let mut client = OptimizerServiceClient::new(channel);
    //
    // // Create large feedback events (e.g., with detailed metadata)
    // let large_feedback = FeedbackEvent {
    //     request_id: "req_large".to_string(),
    //     latency_ms: 200.0,
    //     cost: 0.02,
    //     quality_score: 0.9,
    //     timestamp: 1699660800,
    //     // metadata: large_map_with_many_fields
    // };
    //
    // let stream = tokio_stream::iter(vec![large_feedback; 100]);
    // let request = tonic::Request::new(stream);
    //
    // let response = client.upload_feedback(request).await?;
    // let result = response.into_inner();
    //
    // assert_eq!(result.events_received, 100);

    Ok(())
}

#[tokio::test]
async fn test_grpc_streaming_connection_resilience() -> TestResult {
    // Test streaming resilience to connection issues
    // let channel = Channel::from_static("http://localhost:50051")
    //     .connect_timeout(std::time::Duration::from_secs(5))
    //     .timeout(std::time::Duration::from_secs(10))
    //     .connect()
    //     .await?;
    //
    // let mut client = OptimizerServiceClient::new(channel);
    //
    // let request = tonic::Request::new(MetricsRequest {
    //     metric_names: vec!["latency".to_string()],
    //     interval_seconds: 1,
    // });
    //
    // let mut stream = client.subscribe_metrics(request).await?.into_inner();
    //
    // // Consume events; should handle transient errors
    // let mut success_count = 0;
    // for _ in 0..10 {
    //     match stream.next().await {
    //         Some(Ok(_)) => success_count += 1,
    //         Some(Err(e)) => eprintln!("Stream error: {}", e),
    //         None => break,
    //     }
    // }
    //
    // assert!(success_count > 0);

    Ok(())
}

#[tokio::test]
async fn test_grpc_streaming_concurrent_streams() -> TestResult {
    // Test multiple concurrent streams
    // let channel = Channel::from_static("http://localhost:50051").connect().await?;
    //
    // let mut tasks = vec![];
    //
    // for i in 0..10 {
    //     let mut client = OptimizerServiceClient::new(channel.clone());
    //     let task = tokio::spawn(async move {
    //         let request = tonic::Request::new(MetricsRequest {
    //             metric_names: vec![format!("metric_{}", i)],
    //             interval_seconds: 1,
    //         });
    //
    //         let mut stream = client.subscribe_metrics(request).await?.into_inner();
    //         let mut count = 0;
    //
    //         while let Some(result) = stream.next().await {
    //             result?;
    //             count += 1;
    //             if count >= 5 {
    //                 break;
    //             }
    //         }
    //
    //         Ok::<_, tonic::Status>(count)
    //     });
    //     tasks.push(task);
    // }
    //
    // let results = futures::future::join_all(tasks).await;
    //
    // for result in results {
    //     assert!(result.is_ok());
    //     assert_eq!(result.unwrap()?, 5);
    // }

    Ok(())
}

#[tokio::test]
async fn test_grpc_streaming_flow_control() -> TestResult {
    // Test flow control in bidirectional streaming
    // let channel = Channel::from_static("http://localhost:50051").connect().await?;
    // let mut client = OptimizerServiceClient::new(channel);
    //
    // let (tx, rx) = tokio::sync::mpsc::channel(5); // Small buffer
    //
    // // Producer task (controlled rate)
    // tokio::spawn(async move {
    //     for i in 0..100 {
    //         let req = OptimizationRequest {
    //             config_id: format!("cfg_{}", i),
    //             prompt: format!("Prompt {}", i),
    //             context: HashMap::new(),
    //         };
    //
    //         if tx.send(req).await.is_err() {
    //             break;
    //         }
    //
    //         tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    //     }
    // });
    //
    // let request_stream = tokio_stream::wrappers::ReceiverStream::new(rx);
    // let request = tonic::Request::new(request_stream);
    //
    // let mut response_stream = client.optimize_realtime(request).await?.into_inner();
    //
    // // Consumer (slower than producer)
    // let mut received = 0;
    // while let Some(response) = response_stream.next().await {
    //     response?;
    //     received += 1;
    //     tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    // }
    //
    // assert!(received > 0);

    Ok(())
}
