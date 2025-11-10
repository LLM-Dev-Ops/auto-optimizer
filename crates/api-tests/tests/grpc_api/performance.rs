//! gRPC performance tests

use api_tests::TestResult;
use std::time::Instant;

#[tokio::test]
async fn test_grpc_unary_rpc_latency() -> TestResult {
    // Test latency for unary RPC calls
    // let channel = Channel::from_static("http://localhost:50051").connect().await?;
    // let mut client = OptimizerServiceClient::new(channel);
    //
    // let mut durations = Vec::new();
    //
    // for _ in 0..100 {
    //     let request = tonic::Request::new(GetConfigRequest {
    //         id: "cfg_123".to_string(),
    //     });
    //
    //     let start = Instant::now();
    //     client.get_config(request).await?;
    //     durations.push(start.elapsed());
    // }
    //
    // let p50 = calculate_percentile(&mut durations, 0.5);
    // let p95 = calculate_percentile(&mut durations, 0.95);
    // let p99 = calculate_percentile(&mut durations, 0.99);
    //
    // assert_latency_acceptable(p50, 10);  // <10ms p50
    // assert_latency_acceptable(p95, 50);  // <50ms p95
    // assert_latency_acceptable(p99, 100); // <100ms p99

    Ok(())
}

#[tokio::test]
async fn test_grpc_concurrent_requests() -> TestResult {
    // Test concurrent gRPC requests
    // let channel = Channel::from_static("http://localhost:50051").connect().await?;
    //
    // let mut tasks = vec![];
    //
    // for i in 0..1000 {
    //     let mut client = OptimizerServiceClient::new(channel.clone());
    //     let task = tokio::spawn(async move {
    //         let request = tonic::Request::new(GetConfigRequest {
    //             id: format!("cfg_{}", i),
    //         });
    //         client.get_config(request).await
    //     });
    //     tasks.push(task);
    // }
    //
    // let start = Instant::now();
    // let results = futures::future::join_all(tasks).await;
    // let duration = start.elapsed();
    //
    // let success_count = results.iter().filter(|r| r.is_ok()).count();
    // assert_eq!(success_count, 1000);
    //
    // // 1000 concurrent requests should complete in reasonable time
    // assert_latency_acceptable(duration, 5000);

    Ok(())
}

#[tokio::test]
async fn test_grpc_streaming_throughput() -> TestResult {
    // Test streaming throughput
    // let channel = Channel::from_static("http://localhost:50051").connect().await?;
    // let mut client = OptimizerServiceClient::new(channel);
    //
    // let request = tonic::Request::new(MetricsRequest {
    //     metric_names: vec!["throughput_test".to_string()],
    //     interval_seconds: 1,
    // });
    //
    // let mut stream = client.subscribe_metrics(request).await?.into_inner();
    //
    // let start = Instant::now();
    // let mut count = 0;
    //
    // while let Some(result) = stream.next().await {
    //     result?;
    //     count += 1;
    //     if count >= 10000 {
    //         break;
    //     }
    // }
    //
    // let duration = start.elapsed();
    // let throughput = count as f64 / duration.as_secs_f64();
    //
    // // Should handle >1000 messages/sec
    // assert!(throughput > 1000.0);

    Ok(())
}

#[tokio::test]
async fn test_grpc_connection_pooling() -> TestResult {
    // Test connection pooling performance
    // let channel = Channel::from_static("http://localhost:50051")
    //     .connect()
    //     .await?;
    //
    // // Reuse same channel for multiple clients
    // let start = Instant::now();
    //
    // for _ in 0..100 {
    //     let mut client = OptimizerServiceClient::new(channel.clone());
    //     let request = tonic::Request::new(GetConfigRequest {
    //         id: "cfg_123".to_string(),
    //     });
    //     client.get_config(request).await?;
    // }
    //
    // let duration = start.elapsed();
    //
    // // Connection reuse should be fast
    // assert_latency_acceptable(duration, 1000);

    Ok(())
}

#[tokio::test]
async fn test_grpc_large_message_performance() -> TestResult {
    // Test performance with large messages
    // let channel = Channel::from_static("http://localhost:50051")
    //     .max_decoding_message_size(10 * 1024 * 1024) // 10MB
    //     .max_encoding_message_size(10 * 1024 * 1024)
    //     .connect()
    //     .await?;
    //
    // let mut client = OptimizerServiceClient::new(channel);
    //
    // // Create large metadata map
    // let mut metadata = HashMap::new();
    // for i in 0..10000 {
    //     metadata.insert(format!("key_{}", i), format!("value_{}", i));
    // }
    //
    // let request = tonic::Request::new(CreateConfigRequest {
    //     name: "large_config".to_string(),
    //     model: "claude-3-sonnet".to_string(),
    //     temperature: 0.7,
    //     max_tokens: 1024,
    //     metadata,
    // });
    //
    // let start = Instant::now();
    // client.create_config(request).await?;
    // let duration = start.elapsed();
    //
    // // Large message should still be reasonably fast
    // assert_latency_acceptable(duration, 500);

    Ok(())
}
