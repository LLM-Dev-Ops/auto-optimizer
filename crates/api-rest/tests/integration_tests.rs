//! Integration tests for the REST API

use axum::http::StatusCode;
use axum_test::TestServer;
use llm_optimizer_api_rest::{build_app, ServerConfig};
use serde_json::json;

fn test_server() -> TestServer {
    let config = ServerConfig::default();
    let app = build_app(config);
    TestServer::new(app).unwrap()
}

#[tokio::test]
async fn test_health_check() {
    let server = test_server();
    let response = server.get("/health").await;

    assert_eq!(response.status_code(), StatusCode::OK);
    let body: serde_json::Value = response.json();
    assert!(body.get("status").is_some());
    assert!(body.get("version").is_some());
}

#[tokio::test]
async fn test_liveness_check() {
    let server = test_server();
    let response = server.get("/health/live").await;

    assert_eq!(response.status_code(), StatusCode::OK);
    let body: serde_json::Value = response.json();
    assert_eq!(body["alive"], true);
}

#[tokio::test]
async fn test_readiness_check() {
    let server = test_server();
    let response = server.get("/health/ready").await;

    assert_eq!(response.status_code(), StatusCode::OK);
    let body: serde_json::Value = response.json();
    assert!(body.get("ready").is_some());
}

#[tokio::test]
async fn test_swagger_ui() {
    let server = test_server();
    let response = server.get("/swagger-ui").await;

    // Should redirect or return swagger UI
    assert!(response.status_code().is_success() || response.status_code().is_redirection());
}

#[tokio::test]
async fn test_unauthorized_access() {
    let server = test_server();
    let response = server.get("/api/v1/optimize").await;

    // Should require authentication
    assert_eq!(response.status_code(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_create_optimization_without_auth() {
    let server = test_server();
    let payload = json!({
        "target_services": ["test-service"],
        "strategy": "cost_performance_scoring",
        "config": {},
        "constraints": [],
        "dry_run": false
    });

    let response = server.post("/api/v1/optimize").json(&payload).await;

    // Should require authentication
    assert_eq!(response.status_code(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_cors_headers() {
    let server = test_server();
    let response = server
        .options("/api/v1/optimize")
        .add_header("Origin".parse().unwrap(), "http://localhost:3000".parse().unwrap())
        .await;

    // CORS preflight should succeed
    assert!(response.status_code().is_success() || response.status_code() == StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn test_not_found() {
    let server = test_server();
    let response = server.get("/api/v1/nonexistent").await;

    assert_eq!(response.status_code(), StatusCode::NOT_FOUND);
}
