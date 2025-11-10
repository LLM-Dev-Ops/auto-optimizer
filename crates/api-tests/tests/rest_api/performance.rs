//! REST API performance tests

use api_tests::*;
use reqwest::StatusCode;
use serde_json::json;
use std::time::{Duration, Instant};

#[tokio::test]
async fn test_endpoint_response_latency() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/fast"))
        .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
            "data": "response"
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/fast", mock_server.uri());

    let start = Instant::now();
    let res = client.get(&url).send().await?;
    let duration = start.elapsed();

    assert_eq!(res.status(), StatusCode::OK);

    // Response should be fast (< 100ms for mock server)
    assert_latency_acceptable(duration, 100);

    Ok(())
}

#[tokio::test]
async fn test_concurrent_requests_performance() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/data"))
        .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
            "data": "test"
        })))
        .expect(100)
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/data", mock_server.uri());
    let start = Instant::now();

    // Send 100 concurrent requests
    let mut tasks = vec![];
    for _ in 0..100 {
        let client = client.clone();
        let url = url.clone();
        tasks.push(tokio::spawn(async move {
            client.get(&url).send().await
        }));
    }

    let results = futures::future::join_all(tasks).await;
    let duration = start.elapsed();

    // All requests should succeed
    let success_count = results
        .into_iter()
        .filter(|r| r.is_ok() && r.as_ref().unwrap().as_ref().unwrap().status() == StatusCode::OK)
        .count();

    assert_eq!(success_count, 100);

    // 100 concurrent requests should complete in reasonable time (< 5s for mock)
    assert_latency_acceptable(duration, 5000);

    Ok(())
}

#[tokio::test]
async fn test_large_payload_performance() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Create a large payload (1MB of data)
    let large_data = "x".repeat(1024 * 1024);
    let large_body = json!({
        "data": large_data
    });

    wiremock::Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/api/v1/upload"))
        .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
            "status": "uploaded",
            "size": 1048576
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/upload", mock_server.uri());

    let start = Instant::now();
    let res = client.post(&url).json(&large_body).send().await?;
    let duration = start.elapsed();

    assert_eq!(res.status(), StatusCode::OK);

    // Large payload should still be processed quickly in mock
    assert_latency_acceptable(duration, 1000);

    Ok(())
}

#[tokio::test]
async fn test_pagination_performance() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Test fetching multiple pages
    for page in 1..=10 {
        wiremock::Mock::given(wiremock::matchers::method("GET"))
            .and(wiremock::matchers::path("/api/v1/items"))
            .and(wiremock::matchers::query_param("page", page.to_string()))
            .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
                "data": vec![json!({"id": 1}); 100],
                "page": page,
                "total_pages": 10
            })))
            .mount(&mock_server)
            .await;
    }

    let start = Instant::now();

    // Fetch all pages sequentially
    for page in 1..=10 {
        let url = format!("{}/api/v1/items?page={}", mock_server.uri(), page);
        let res = client.get(&url).send().await?;
        assert_eq!(res.status(), StatusCode::OK);
    }

    let duration = start.elapsed();

    // Fetching 10 pages should be reasonably fast
    assert_latency_acceptable(duration, 2000);

    Ok(())
}

#[tokio::test]
async fn test_streaming_response_performance() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Simulate streaming data
    let streaming_data = (0..1000)
        .map(|i| format!("chunk_{}\n", i))
        .collect::<String>();

    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/stream"))
        .respond_with(
            wiremock::ResponseTemplate::new(200)
                .set_body_string(streaming_data)
                .insert_header("content-type", "text/event-stream")
        )
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/stream", mock_server.uri());

    let start = Instant::now();
    let res = client.get(&url).send().await?;
    let duration = start.elapsed();

    assert_eq!(res.status(), StatusCode::OK);

    // Stream should start quickly
    assert_latency_acceptable(duration, 500);

    Ok(())
}

#[tokio::test]
async fn test_p50_p95_p99_latency() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/latency"))
        .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
            "data": "test"
        })))
        .expect(100)
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/latency", mock_server.uri());

    // Make 100 requests and measure latency
    let mut durations = Vec::new();
    for _ in 0..100 {
        let start = Instant::now();
        let res = client.get(&url).send().await?;
        let duration = start.elapsed();

        assert_eq!(res.status(), StatusCode::OK);
        durations.push(duration);
    }

    // Calculate percentiles
    let p50 = calculate_percentile(&mut durations, 0.5);
    let p95 = calculate_percentile(&mut durations, 0.95);
    let p99 = calculate_percentile(&mut durations, 0.99);

    println!("Latency p50: {:?}", p50);
    println!("Latency p95: {:?}", p95);
    println!("Latency p99: {:?}", p99);

    // All percentiles should be acceptable for mock server
    assert_latency_acceptable(p50, 50);
    assert_latency_acceptable(p95, 100);
    assert_latency_acceptable(p99, 200);

    Ok(())
}

#[tokio::test]
async fn test_connection_reuse_performance() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/keepalive"))
        .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
            "data": "test"
        })))
        .expect(50)
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/keepalive", mock_server.uri());

    // First request (cold start)
    let start = Instant::now();
    client.get(&url).send().await?;
    let first_request_duration = start.elapsed();

    // Subsequent requests (should reuse connection)
    let mut subsequent_durations = Vec::new();
    for _ in 0..49 {
        let start = Instant::now();
        client.get(&url).send().await?;
        subsequent_durations.push(start.elapsed());
    }

    let avg_subsequent = subsequent_durations.iter().sum::<Duration>() / subsequent_durations.len() as u32;

    println!("First request: {:?}", first_request_duration);
    println!("Average subsequent: {:?}", avg_subsequent);

    // Subsequent requests should be faster or equal (connection reuse)
    // For mock server, this might not be significant, but test the pattern
    assert!(avg_subsequent <= first_request_duration + Duration::from_millis(10));

    Ok(())
}

#[tokio::test]
async fn test_timeout_handling() -> TestResult {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(100))
        .build()?;

    let mock_server = wiremock::MockServer::start().await;

    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/slow"))
        .respond_with(
            wiremock::ResponseTemplate::new(200)
                .set_delay(Duration::from_secs(1))
                .set_body_json(json!({"data": "slow"}))
        )
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/slow", mock_server.uri());

    let result = client.get(&url).send().await;

    // Request should timeout
    assert!(result.is_err());

    Ok(())
}

#[tokio::test]
async fn test_compression_performance() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Large compressible data
    let compressible_data = "a".repeat(100000);

    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/compressed"))
        .and(wiremock::matchers::header("accept-encoding", wiremock::matchers::any()))
        .respond_with(
            wiremock::ResponseTemplate::new(200)
                .set_body_json(json!({
                    "data": compressible_data
                }))
                .insert_header("content-encoding", "gzip")
        )
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/compressed", mock_server.uri());

    let start = Instant::now();
    let res = client.get(&url).send().await?;
    let duration = start.elapsed();

    assert_eq!(res.status(), StatusCode::OK);

    // Compressed response should be fast
    assert_latency_acceptable(duration, 500);

    Ok(())
}
