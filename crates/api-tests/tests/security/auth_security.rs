//! Authentication and authorization security tests

use api_tests::*;
use reqwest::StatusCode;
use serde_json::json;

#[tokio::test]
async fn test_jwt_token_expiration() -> TestResult {
    let user = MockUser::admin();
    let expired_token = generate_test_jwt(&user, 0)?; // Expired immediately

    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/protected"))
        .respond_with(wiremock::ResponseTemplate::new(401).set_body_json(json!({
            "error": "Token expired",
            "code": "TOKEN_EXPIRED"
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/protected", mock_server.uri());
    let (header_name, header_value) = bearer_auth_header(&expired_token);
    let res = client.get(&url).header(header_name, header_value).send().await?;

    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    Ok(())
}

#[tokio::test]
async fn test_sql_injection_prevention() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Attempt SQL injection in query parameter
    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/users"))
        .and(wiremock::matchers::query_param("id", "1' OR '1'='1"))
        .respond_with(wiremock::ResponseTemplate::new(400).set_body_json(json!({
            "error": "Invalid input",
            "code": "VALIDATION_ERROR"
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/users?id=1' OR '1'='1", mock_server.uri());
    let res = client.get(&url).send().await?;

    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    Ok(())
}

#[tokio::test]
async fn test_xss_prevention() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Attempt XSS in request body
    wiremock::Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/api/v1/comments"))
        .respond_with(wiremock::ResponseTemplate::new(400).set_body_json(json!({
            "error": "Invalid content",
            "code": "VALIDATION_ERROR"
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/comments", mock_server.uri());
    let res = client.post(&url).json(&json!({
        "text": "<script>alert('XSS')</script>"
    })).send().await?;

    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    Ok(())
}

#[tokio::test]
async fn test_csrf_token_validation() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Request without CSRF token should fail
    wiremock::Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/api/v1/state-change"))
        .respond_with(wiremock::ResponseTemplate::new(403).set_body_json(json!({
            "error": "CSRF token missing",
            "code": "CSRF_ERROR"
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/state-change", mock_server.uri());
    let res = client.post(&url).send().await?;

    assert_eq!(res.status(), StatusCode::FORBIDDEN);
    Ok(())
}

#[tokio::test]
async fn test_password_brute_force_protection() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Allow 5 failed login attempts
    for _ in 0..5 {
        wiremock::Mock::given(wiremock::matchers::method("POST"))
            .and(wiremock::matchers::path("/api/v1/auth/login"))
            .respond_with(wiremock::ResponseTemplate::new(401))
            .up_to_n_times(1)
            .mount(&mock_server)
            .await;
    }

    // 6th attempt should be blocked
    wiremock::Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/api/v1/auth/login"))
        .respond_with(wiremock::ResponseTemplate::new(429).set_body_json(json!({
            "error": "Too many failed login attempts",
            "code": "RATE_LIMIT_EXCEEDED"
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/auth/login", mock_server.uri());

    for _ in 0..5 {
        client.post(&url).json(&json!({
            "username": "user",
            "password": "wrong"
        })).send().await?;
    }

    let res = client.post(&url).json(&json!({
        "username": "user",
        "password": "wrong"
    })).send().await?;

    assert_eq!(res.status(), StatusCode::TOO_MANY_REQUESTS);
    Ok(())
}

#[tokio::test]
async fn test_api_key_rotation() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Old API key should be rejected after rotation
    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/data"))
        .and(wiremock::matchers::header("X-API-Key", "old_api_key"))
        .respond_with(wiremock::ResponseTemplate::new(401).set_body_json(json!({
            "error": "Invalid API key",
            "code": "INVALID_API_KEY"
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/data", mock_server.uri());
    let res = client.get(&url).header("X-API-Key", "old_api_key").send().await?;

    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    Ok(())
}

#[tokio::test]
async fn test_privilege_escalation_prevention() -> TestResult {
    let user = MockUser::user();
    let token = generate_test_jwt(&user, 3600)?;

    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Attempt to modify own role to admin
    wiremock::Mock::given(wiremock::matchers::method("PUT"))
        .and(wiremock::matchers::path("/api/v1/users/me"))
        .and(wiremock::matchers::body_json(json!({
            "role": "admin"
        })))
        .respond_with(wiremock::ResponseTemplate::new(403).set_body_json(json!({
            "error": "Cannot modify own role",
            "code": "FORBIDDEN"
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/users/me", mock_server.uri());
    let (header_name, header_value) = bearer_auth_header(&token);
    let res = client
        .put(&url)
        .header(header_name, header_value)
        .json(&json!({"role": "admin"}))
        .send()
        .await?;

    assert_eq!(res.status(), StatusCode::FORBIDDEN);
    Ok(())
}
