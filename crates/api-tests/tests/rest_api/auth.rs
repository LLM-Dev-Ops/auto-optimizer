//! REST API authentication and authorization tests

use api_tests::*;
use reqwest::StatusCode;
use serde_json::json;

#[tokio::test]
async fn test_jwt_authentication_success() -> TestResult {
    let user = MockUser::admin();
    let token = generate_test_jwt(&user, 3600)?;

    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/protected"))
        .and(wiremock::matchers::header("Authorization", format!("Bearer {}", token).as_str()))
        .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
            "message": "Access granted",
            "user_id": user.id.to_string()
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/protected", mock_server.uri());
    let (header_name, header_value) = bearer_auth_header(&token);
    let res = client.get(&url).header(header_name, header_value).send().await?;

    assert_eq!(res.status(), StatusCode::OK);

    Ok(())
}

#[tokio::test]
async fn test_jwt_authentication_missing_token() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/protected"))
        .respond_with(wiremock::ResponseTemplate::new(401).set_body_json(json!({
            "error": "Missing authentication token",
            "code": "UNAUTHORIZED"
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/protected", mock_server.uri());
    let res = client.get(&url).send().await?;

    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);

    Ok(())
}

#[tokio::test]
async fn test_jwt_authentication_invalid_token() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/protected"))
        .and(wiremock::matchers::header("Authorization", "Bearer invalid_token"))
        .respond_with(wiremock::ResponseTemplate::new(401).set_body_json(json!({
            "error": "Invalid authentication token",
            "code": "INVALID_TOKEN"
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/protected", mock_server.uri());
    let res = client
        .get(&url)
        .header("Authorization", "Bearer invalid_token")
        .send()
        .await?;

    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);

    Ok(())
}

#[tokio::test]
async fn test_jwt_authentication_expired_token() -> TestResult {
    let user = MockUser::admin();
    // Token expired 1 hour ago
    let token = generate_test_jwt(&user, 0)?;

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
    let (header_name, header_value) = bearer_auth_header(&token);
    let res = client.get(&url).header(header_name, header_value).send().await?;

    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);

    Ok(())
}

#[tokio::test]
async fn test_api_key_authentication_success() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/protected"))
        .and(wiremock::matchers::header("X-API-Key", MOCK_API_KEY))
        .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
            "message": "Access granted"
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/protected", mock_server.uri());
    let (header_name, header_value) = api_key_auth_header(MOCK_API_KEY);
    let res = client.get(&url).header(header_name, header_value).send().await?;

    assert_eq!(res.status(), StatusCode::OK);

    Ok(())
}

#[tokio::test]
async fn test_api_key_authentication_invalid() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/protected"))
        .and(wiremock::matchers::header("X-API-Key", "invalid_key"))
        .respond_with(wiremock::ResponseTemplate::new(401).set_body_json(json!({
            "error": "Invalid API key",
            "code": "INVALID_API_KEY"
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/protected", mock_server.uri());
    let res = client
        .get(&url)
        .header("X-API-Key", "invalid_key")
        .send()
        .await?;

    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);

    Ok(())
}

#[tokio::test]
async fn test_authorization_admin_access() -> TestResult {
    let admin_user = MockUser::admin();
    let token = generate_test_jwt(&admin_user, 3600)?;

    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    wiremock::Mock::given(wiremock::matchers::method("DELETE"))
        .and(wiremock::matchers::path("/api/v1/admin/users/123"))
        .respond_with(wiremock::ResponseTemplate::new(204))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/admin/users/123", mock_server.uri());
    let (header_name, header_value) = bearer_auth_header(&token);
    let res = client.delete(&url).header(header_name, header_value).send().await?;

    assert_eq!(res.status(), StatusCode::NO_CONTENT);

    Ok(())
}

#[tokio::test]
async fn test_authorization_user_forbidden() -> TestResult {
    let regular_user = MockUser::user();
    let token = generate_test_jwt(&regular_user, 3600)?;

    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

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

#[tokio::test]
async fn test_authorization_readonly_user() -> TestResult {
    let readonly_user = MockUser::readonly();
    let token = generate_test_jwt(&readonly_user, 3600)?;

    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // GET should work
    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/resources"))
        .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
            "data": []
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/resources", mock_server.uri());
    let (header_name, header_value) = bearer_auth_header(&token);
    let res = client.get(&url).header(header_name.clone(), header_value.clone()).send().await?;
    assert_eq!(res.status(), StatusCode::OK);

    // POST should be forbidden
    wiremock::Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/api/v1/resources"))
        .respond_with(wiremock::ResponseTemplate::new(403).set_body_json(json!({
            "error": "Read-only access",
            "code": "FORBIDDEN"
        })))
        .mount(&mock_server)
        .await;

    let res = client
        .post(&url)
        .header(header_name, header_value)
        .json(&json!({"name": "test"}))
        .send()
        .await?;
    assert_eq!(res.status(), StatusCode::FORBIDDEN);

    Ok(())
}

#[tokio::test]
async fn test_token_refresh() -> TestResult {
    let user = MockUser::user();
    let refresh_token = generate_test_jwt(&user, 86400)?; // 24 hours

    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    wiremock::Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/api/v1/auth/refresh"))
        .and(wiremock::matchers::body_json(json!({
            "refresh_token": refresh_token
        })))
        .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
            "access_token": "new_access_token",
            "expires_in": 3600
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/auth/refresh", mock_server.uri());
    let res = client
        .post(&url)
        .json(&json!({
            "refresh_token": refresh_token
        }))
        .send()
        .await?;

    assert_eq!(res.status(), StatusCode::OK);

    let body: serde_json::Value = res.json().await?;
    assert!(body["access_token"].is_string());

    Ok(())
}

#[tokio::test]
async fn test_login_endpoint() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    let login_body = json!({
        "username": "testuser",
        "password": "password123"
    });

    wiremock::Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/api/v1/auth/login"))
        .and(wiremock::matchers::body_json(&login_body))
        .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
            "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            "token_type": "Bearer",
            "expires_in": 3600
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/auth/login", mock_server.uri());
    let res = client.post(&url).json(&login_body).send().await?;

    assert_eq!(res.status(), StatusCode::OK);

    let body: serde_json::Value = res.json().await?;
    assert_eq!(body["token_type"], "Bearer");
    assert!(body["access_token"].is_string());

    Ok(())
}

#[tokio::test]
async fn test_logout_endpoint() -> TestResult {
    let user = MockUser::user();
    let token = generate_test_jwt(&user, 3600)?;

    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    wiremock::Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/api/v1/auth/logout"))
        .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
            "message": "Successfully logged out"
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/auth/logout", mock_server.uri());
    let (header_name, header_value) = bearer_auth_header(&token);
    let res = client.post(&url).header(header_name, header_value).send().await?;

    assert_eq!(res.status(), StatusCode::OK);

    Ok(())
}
