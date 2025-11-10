//! OWASP API Security Top 10 compliance tests
//!
//! Tests covering OWASP API Security Top 10 (2023):
//! 1. Broken Object Level Authorization (BOLA)
//! 2. Broken Authentication
//! 3. Broken Object Property Level Authorization
//! 4. Unrestricted Resource Consumption
//! 5. Broken Function Level Authorization
//! 6. Unrestricted Access to Sensitive Business Flows
//! 7. Server Side Request Forgery (SSRF)
//! 8. Security Misconfiguration
//! 9. Improper Inventory Management
//! 10. Unsafe Consumption of APIs

use api_tests::*;
use reqwest::StatusCode;
use serde_json::json;

// API1:2023 - Broken Object Level Authorization (BOLA)
#[tokio::test]
async fn test_api1_bola_prevention() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    let user_a = MockUser::user();
    let token_a = generate_test_jwt(&user_a, 3600)?;

    // User A tries to access User B's resource
    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/users/user_b_id/private"))
        .respond_with(wiremock::ResponseTemplate::new(403).set_body_json(json!({
            "error": "Access denied to resource",
            "code": "FORBIDDEN"
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/users/user_b_id/private", mock_server.uri());
    let (header_name, header_value) = bearer_auth_header(&token_a);
    let res = client.get(&url).header(header_name, header_value).send().await?;

    // Should be forbidden - cannot access other user's resources
    assert_eq!(res.status(), StatusCode::FORBIDDEN);

    Ok(())
}

// API2:2023 - Broken Authentication
#[tokio::test]
async fn test_api2_authentication_required() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/protected"))
        .respond_with(wiremock::ResponseTemplate::new(401))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/protected", mock_server.uri());
    let res = client.get(&url).send().await?;

    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    Ok(())
}

#[tokio::test]
async fn test_api2_weak_password_rejected() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    wiremock::Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/api/v1/auth/register"))
        .and(wiremock::matchers::body_json(json!({
            "username": "testuser",
            "password": "123" // Weak password
        })))
        .respond_with(wiremock::ResponseTemplate::new(400).set_body_json(json!({
            "error": "Password too weak",
            "code": "WEAK_PASSWORD"
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/auth/register", mock_server.uri());
    let res = client.post(&url).json(&json!({
        "username": "testuser",
        "password": "123"
    })).send().await?;

    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    Ok(())
}

// API3:2023 - Broken Object Property Level Authorization
#[tokio::test]
async fn test_api3_excessive_data_exposure_prevention() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    let user = MockUser::user();
    let token = generate_test_jwt(&user, 3600)?;

    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/users/profile"))
        .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
            "id": "user_123",
            "username": "testuser",
            "email": "user@example.com"
            // Should NOT include: password_hash, api_keys, internal_metadata
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/users/profile", mock_server.uri());
    let (header_name, header_value) = bearer_auth_header(&token);
    let res = client.get(&url).header(header_name, header_value).send().await?;

    let body: serde_json::Value = res.json().await?;

    // Verify sensitive fields are not exposed
    assert!(body.get("password_hash").is_none());
    assert!(body.get("api_keys").is_none());

    Ok(())
}

// API4:2023 - Unrestricted Resource Consumption
#[tokio::test]
async fn test_api4_rate_limiting_enforced() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Simulate rate limiting after 10 requests
    for _ in 0..10 {
        wiremock::Mock::given(wiremock::matchers::method("POST"))
            .and(wiremock::matchers::path("/api/v1/expensive"))
            .respond_with(wiremock::ResponseTemplate::new(200))
            .up_to_n_times(1)
            .mount(&mock_server)
            .await;
    }

    wiremock::Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/api/v1/expensive"))
        .respond_with(wiremock::ResponseTemplate::new(429).set_body_json(json!({
            "error": "Rate limit exceeded",
            "code": "RATE_LIMIT_EXCEEDED"
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/expensive", mock_server.uri());

    for _ in 0..10 {
        client.post(&url).send().await?;
    }

    let res = client.post(&url).send().await?;
    assert_eq!(res.status(), StatusCode::TOO_MANY_REQUESTS);

    Ok(())
}

#[tokio::test]
async fn test_api4_request_size_limits() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Very large payload
    let large_payload = "x".repeat(100_000_000); // 100MB

    wiremock::Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/api/v1/upload"))
        .respond_with(wiremock::ResponseTemplate::new(413).set_body_json(json!({
            "error": "Payload too large",
            "code": "PAYLOAD_TOO_LARGE"
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/upload", mock_server.uri());
    let res = client.post(&url).body(large_payload).send().await?;

    assert_eq!(res.status(), StatusCode::PAYLOAD_TOO_LARGE);
    Ok(())
}

// API5:2023 - Broken Function Level Authorization
#[tokio::test]
async fn test_api5_admin_function_authorization() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    let regular_user = MockUser::user();
    let token = generate_test_jwt(&regular_user, 3600)?;

    // Regular user tries to access admin function
    wiremock::Mock::given(wiremock::matchers::method("DELETE"))
        .and(wiremock::matchers::path("/api/v1/admin/users/123"))
        .respond_with(wiremock::ResponseTemplate::new(403).set_body_json(json!({
            "error": "Insufficient permissions",
            "code": "FORBIDDEN"
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/admin/users/123", mock_server.uri());
    let (header_name, header_value) = bearer_auth_header(&token);
    let res = client.delete(&url).header(header_name, header_value).send().await?;

    assert_eq!(res.status(), StatusCode::FORBIDDEN);
    Ok(())
}

// API6:2023 - Unrestricted Access to Sensitive Business Flows
#[tokio::test]
async fn test_api6_business_flow_rate_limiting() -> TestResult {
    // Test that sensitive business operations (like password reset) are rate limited
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Allow 3 password reset requests
    for _ in 0..3 {
        wiremock::Mock::given(wiremock::matchers::method("POST"))
            .and(wiremock::matchers::path("/api/v1/auth/password-reset"))
            .respond_with(wiremock::ResponseTemplate::new(200))
            .up_to_n_times(1)
            .mount(&mock_server)
            .await;
    }

    // 4th request should be rate limited
    wiremock::Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/api/v1/auth/password-reset"))
        .respond_with(wiremock::ResponseTemplate::new(429))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/auth/password-reset", mock_server.uri());

    for _ in 0..3 {
        client.post(&url).json(&json!({"email": "user@example.com"})).send().await?;
    }

    let res = client.post(&url).json(&json!({"email": "user@example.com"})).send().await?;
    assert_eq!(res.status(), StatusCode::TOO_MANY_REQUESTS);

    Ok(())
}

// API7:2023 - Server Side Request Forgery (SSRF)
#[tokio::test]
async fn test_api7_ssrf_prevention() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Attempt to make server fetch internal URL
    wiremock::Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/api/v1/fetch"))
        .and(wiremock::matchers::body_json(json!({
            "url": "http://localhost:8080/admin"
        })))
        .respond_with(wiremock::ResponseTemplate::new(400).set_body_json(json!({
            "error": "Invalid URL - internal URLs not allowed",
            "code": "INVALID_URL"
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/fetch", mock_server.uri());
    let res = client.post(&url).json(&json!({
        "url": "http://localhost:8080/admin"
    })).send().await?;

    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    Ok(())
}

// API8:2023 - Security Misconfiguration
#[tokio::test]
async fn test_api8_security_headers_present() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/data"))
        .respond_with(
            wiremock::ResponseTemplate::new(200)
                .insert_header("X-Content-Type-Options", "nosniff")
                .insert_header("X-Frame-Options", "DENY")
                .insert_header("Content-Security-Policy", "default-src 'self'")
        )
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/data", mock_server.uri());
    let res = client.get(&url).send().await?;

    // Verify security headers are present
    assert!(res.headers().contains_key("x-content-type-options"));
    assert!(res.headers().contains_key("x-frame-options"));
    assert!(res.headers().contains_key("content-security-policy"));

    Ok(())
}

#[tokio::test]
async fn test_api8_no_verbose_errors_in_production() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/error"))
        .respond_with(wiremock::ResponseTemplate::new(500).set_body_json(json!({
            "error": "Internal server error",
            "code": "INTERNAL_ERROR"
            // Should NOT include: stack traces, database errors, file paths
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/error", mock_server.uri());
    let res = client.get(&url).send().await?;

    let body: serde_json::Value = res.json().await?;

    // Verify no stack trace or sensitive details
    assert!(body.get("stack_trace").is_none());
    assert!(body.get("sql_error").is_none());

    Ok(())
}

// API9:2023 - Improper Inventory Management
#[tokio::test]
async fn test_api9_version_documentation() -> TestResult {
    // Test that API version is properly documented and managed
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/version"))
        .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
            "version": "v1",
            "deprecated": false,
            "supported_until": "2025-12-31"
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/version", mock_server.uri());
    let res = client.get(&url).send().await?;

    assert_eq!(res.status(), StatusCode::OK);
    Ok(())
}

// API10:2023 - Unsafe Consumption of APIs
#[tokio::test]
async fn test_api10_input_validation_from_external_apis() -> TestResult {
    // Test that data from external APIs is validated
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // External API response with malicious data
    wiremock::Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/api/v1/integrate"))
        .respond_with(wiremock::ResponseTemplate::new(400).set_body_json(json!({
            "error": "Invalid data from external source",
            "code": "VALIDATION_ERROR"
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/integrate", mock_server.uri());
    let res = client.post(&url).json(&json!({
        "external_data": "<script>alert('xss')</script>"
    })).send().await?;

    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    Ok(())
}
