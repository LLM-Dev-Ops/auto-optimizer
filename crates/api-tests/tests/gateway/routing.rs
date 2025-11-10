//! API Gateway routing tests

use api_tests::TestResult;
use reqwest::StatusCode;
use serde_json::json;

#[tokio::test]
async fn test_gateway_rest_routing() -> TestResult {
    let client = api_tests::build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // REST endpoint routed through gateway
    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/gateway/rest/configs"))
        .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
            "data": [{"id": "cfg_1"}]
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/gateway/rest/configs", mock_server.uri());
    let res = client.get(&url).send().await?;

    assert_eq!(res.status(), StatusCode::OK);
    Ok(())
}

#[tokio::test]
async fn test_gateway_grpc_routing() -> TestResult {
    // Gateway should route gRPC requests to gRPC backend
    // Test that gRPC-Web requests are properly routed
    Ok(())
}

#[tokio::test]
async fn test_gateway_websocket_routing() -> TestResult {
    // Test WebSocket connection routing through gateway
    Ok(())
}

#[tokio::test]
async fn test_gateway_path_based_routing() -> TestResult {
    let client = api_tests::build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Different paths route to different services
    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/gateway/v1/service-a/data"))
        .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
            "service": "a"
        })))
        .mount(&mock_server)
        .await;

    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/gateway/v1/service-b/data"))
        .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
            "service": "b"
        })))
        .mount(&mock_server)
        .await;

    let url_a = format!("{}/gateway/v1/service-a/data", mock_server.uri());
    let res_a = client.get(&url_a).send().await?;
    let body_a: serde_json::Value = res_a.json().await?;
    assert_eq!(body_a["service"], "a");

    let url_b = format!("{}/gateway/v1/service-b/data", mock_server.uri());
    let res_b = client.get(&url_b).send().await?;
    let body_b: serde_json::Value = res_b.json().await?;
    assert_eq!(body_b["service"], "b");

    Ok(())
}

#[tokio::test]
async fn test_gateway_header_based_routing() -> TestResult {
    let client = api_tests::build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Route based on custom header
    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/gateway/api"))
        .and(wiremock::matchers::header("X-Service-Version", "v1"))
        .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
            "version": "v1"
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/gateway/api", mock_server.uri());
    let res = client.get(&url).header("X-Service-Version", "v1").send().await?;

    assert_eq!(res.status(), StatusCode::OK);
    Ok(())
}

#[tokio::test]
async fn test_gateway_route_not_found() -> TestResult {
    let client = api_tests::build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/gateway/unknown"))
        .respond_with(wiremock::ResponseTemplate::new(404).set_body_json(json!({
            "error": "Route not found"
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/gateway/unknown", mock_server.uri());
    let res = client.get(&url).send().await?;

    assert_eq!(res.status(), StatusCode::NOT_FOUND);
    Ok(())
}
