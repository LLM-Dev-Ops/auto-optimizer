//! REST API rate limiting tests

use api_tests::*;
use reqwest::StatusCode;
use serde_json::json;
use std::time::Duration;

#[tokio::test]
async fn test_rate_limit_by_api_key() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // First 10 requests should succeed
    for i in 0..10 {
        wiremock::Mock::given(wiremock::matchers::method("GET"))
            .and(wiremock::matchers::path("/api/v1/data"))
            .and(wiremock::matchers::header("X-API-Key", MOCK_API_KEY))
            .respond_with(
                wiremock::ResponseTemplate::new(200)
                    .set_body_json(json!({"data": "success"}))
                    .insert_header("X-RateLimit-Limit", "10")
                    .insert_header("X-RateLimit-Remaining", format!("{}", 9 - i))
                    .insert_header("X-RateLimit-Reset", "1699660800")
            )
            .up_to_n_times(1)
            .mount(&mock_server)
            .await;
    }

    let url = format!("{}/api/v1/data", mock_server.uri());

    for _ in 0..10 {
        let res = client
            .get(&url)
            .header("X-API-Key", MOCK_API_KEY)
            .send()
            .await?;
        assert_eq!(res.status(), StatusCode::OK);
        assert!(res.headers().contains_key("X-RateLimit-Limit"));
    }

    // 11th request should be rate limited
    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/data"))
        .and(wiremock::matchers::header("X-API-Key", MOCK_API_KEY))
        .respond_with(
            wiremock::ResponseTemplate::new(429)
                .set_body_json(json!({
                    "error": "Rate limit exceeded",
                    "code": "RATE_LIMIT_EXCEEDED"
                }))
                .insert_header("X-RateLimit-Limit", "10")
                .insert_header("X-RateLimit-Remaining", "0")
                .insert_header("X-RateLimit-Reset", "1699660800")
                .insert_header("Retry-After", "60")
        )
        .mount(&mock_server)
        .await;

    let res = client
        .get(&url)
        .header("X-API-Key", MOCK_API_KEY)
        .send()
        .await?;
    assert_eq!(res.status(), StatusCode::TOO_MANY_REQUESTS);
    assert!(res.headers().contains_key("Retry-After"));

    Ok(())
}

#[tokio::test]
async fn test_rate_limit_by_ip_address() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Simulate rate limit by IP
    for i in 0..100 {
        wiremock::Mock::given(wiremock::matchers::method("GET"))
            .and(wiremock::matchers::path("/api/v1/public"))
            .respond_with(
                wiremock::ResponseTemplate::new(200)
                    .set_body_json(json!({"data": "success"}))
                    .insert_header("X-RateLimit-Limit", "100")
                    .insert_header("X-RateLimit-Remaining", format!("{}", 99 - i))
            )
            .up_to_n_times(1)
            .mount(&mock_server)
            .await;
    }

    let url = format!("{}/api/v1/public", mock_server.uri());

    for _ in 0..100 {
        let res = client.get(&url).send().await?;
        assert_eq!(res.status(), StatusCode::OK);
    }

    // 101st request should be rate limited
    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/public"))
        .respond_with(
            wiremock::ResponseTemplate::new(429)
                .set_body_json(json!({
                    "error": "Rate limit exceeded",
                    "code": "RATE_LIMIT_EXCEEDED"
                }))
        )
        .mount(&mock_server)
        .await;

    let res = client.get(&url).send().await?;
    assert_eq!(res.status(), StatusCode::TOO_MANY_REQUESTS);

    Ok(())
}

#[tokio::test]
async fn test_rate_limit_different_tiers() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Free tier: 10 requests/minute
    let free_key = "free_api_key";
    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/data"))
        .and(wiremock::matchers::header("X-API-Key", free_key))
        .respond_with(
            wiremock::ResponseTemplate::new(200)
                .insert_header("X-RateLimit-Limit", "10")
                .insert_header("X-RateLimit-Tier", "free")
        )
        .up_to_n_times(10)
        .mount(&mock_server)
        .await;

    // Premium tier: 1000 requests/minute
    let premium_key = "premium_api_key";
    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/data"))
        .and(wiremock::matchers::header("X-API-Key", premium_key))
        .respond_with(
            wiremock::ResponseTemplate::new(200)
                .insert_header("X-RateLimit-Limit", "1000")
                .insert_header("X-RateLimit-Tier", "premium")
        )
        .up_to_n_times(100)
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/data", mock_server.uri());

    // Test free tier
    let res = client.get(&url).header("X-API-Key", free_key).send().await?;
    assert_eq!(res.status(), StatusCode::OK);
    assert_eq!(res.headers().get("X-RateLimit-Limit").unwrap(), "10");

    // Test premium tier
    let res = client.get(&url).header("X-API-Key", premium_key).send().await?;
    assert_eq!(res.status(), StatusCode::OK);
    assert_eq!(res.headers().get("X-RateLimit-Limit").unwrap(), "1000");

    Ok(())
}

#[tokio::test]
async fn test_rate_limit_headers_present() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/data"))
        .respond_with(
            wiremock::ResponseTemplate::new(200)
                .set_body_json(json!({"data": "test"}))
                .insert_header("X-RateLimit-Limit", "100")
                .insert_header("X-RateLimit-Remaining", "99")
                .insert_header("X-RateLimit-Reset", "1699660800")
        )
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/data", mock_server.uri());
    let res = client.get(&url).send().await?;

    assert_eq!(res.status(), StatusCode::OK);

    // Verify rate limit headers are present
    assert!(res.headers().contains_key("X-RateLimit-Limit"));
    assert!(res.headers().contains_key("X-RateLimit-Remaining"));
    assert!(res.headers().contains_key("X-RateLimit-Reset"));

    Ok(())
}

#[tokio::test]
async fn test_rate_limit_reset_window() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Exhaust rate limit
    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/data"))
        .respond_with(
            wiremock::ResponseTemplate::new(429)
                .set_body_json(json!({
                    "error": "Rate limit exceeded",
                    "code": "RATE_LIMIT_EXCEEDED"
                }))
                .insert_header("Retry-After", "1")
        )
        .up_to_n_times(1)
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/data", mock_server.uri());
    let res = client.get(&url).send().await?;
    assert_eq!(res.status(), StatusCode::TOO_MANY_REQUESTS);

    // Wait for rate limit to reset (simulate)
    tokio::time::sleep(Duration::from_secs(2)).await;

    // After reset, requests should work again
    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/data"))
        .respond_with(
            wiremock::ResponseTemplate::new(200)
                .set_body_json(json!({"data": "success"}))
                .insert_header("X-RateLimit-Remaining", "99")
        )
        .mount(&mock_server)
        .await;

    let res = client.get(&url).send().await?;
    assert_eq!(res.status(), StatusCode::OK);

    Ok(())
}

#[tokio::test]
async fn test_rate_limit_burst_protection() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Allow burst of 5 requests
    for i in 0..5 {
        wiremock::Mock::given(wiremock::matchers::method("POST"))
            .and(wiremock::matchers::path("/api/v1/process"))
            .respond_with(
                wiremock::ResponseTemplate::new(200)
                    .insert_header("X-RateLimit-Burst", "5")
                    .insert_header("X-RateLimit-Burst-Remaining", format!("{}", 4 - i))
            )
            .up_to_n_times(1)
            .mount(&mock_server)
            .await;
    }

    let url = format!("{}/api/v1/process", mock_server.uri());

    // Send burst of requests rapidly
    let mut tasks = vec![];
    for _ in 0..5 {
        let client = client.clone();
        let url = url.clone();
        tasks.push(tokio::spawn(async move {
            client.post(&url).json(&json!({"data": "test"})).send().await
        }));
    }

    let results = futures::future::join_all(tasks).await;
    let success_count = results
        .into_iter()
        .filter(|r| r.is_ok() && r.as_ref().unwrap().as_ref().unwrap().status() == StatusCode::OK)
        .count();

    // All requests in burst should succeed
    assert_eq!(success_count, 5);

    Ok(())
}

#[tokio::test]
async fn test_rate_limit_per_endpoint() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Different endpoints have different rate limits
    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/cheap"))
        .respond_with(
            wiremock::ResponseTemplate::new(200)
                .insert_header("X-RateLimit-Limit", "1000")
        )
        .mount(&mock_server)
        .await;

    wiremock::Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/api/v1/expensive"))
        .respond_with(
            wiremock::ResponseTemplate::new(200)
                .insert_header("X-RateLimit-Limit", "10")
        )
        .mount(&mock_server)
        .await;

    let cheap_url = format!("{}/api/v1/cheap", mock_server.uri());
    let expensive_url = format!("{}/api/v1/expensive", mock_server.uri());

    let cheap_res = client.get(&cheap_url).send().await?;
    assert_eq!(cheap_res.headers().get("X-RateLimit-Limit").unwrap(), "1000");

    let expensive_res = client.post(&expensive_url).send().await?;
    assert_eq!(expensive_res.headers().get("X-RateLimit-Limit").unwrap(), "10");

    Ok(())
}
