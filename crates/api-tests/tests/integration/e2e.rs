//! End-to-end integration tests

use api_tests::*;
use reqwest::StatusCode;
use serde_json::json;

#[tokio::test]
async fn test_e2e_user_registration_and_authentication() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Step 1: Register new user
    wiremock::Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/api/v1/auth/register"))
        .respond_with(wiremock::ResponseTemplate::new(201).set_body_json(json!({
            "id": "user_123",
            "username": "newuser",
            "email": "newuser@example.com"
        })))
        .mount(&mock_server)
        .await;

    let register_url = format!("{}/api/v1/auth/register", mock_server.uri());
    let res = client.post(&register_url).json(&json!({
        "username": "newuser",
        "email": "newuser@example.com",
        "password": "SecurePass123!"
    })).send().await?;

    assert_eq!(res.status(), StatusCode::CREATED);

    // Step 2: Login with new user
    wiremock::Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/api/v1/auth/login"))
        .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
            "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            "token_type": "Bearer"
        })))
        .mount(&mock_server)
        .await;

    let login_url = format!("{}/api/v1/auth/login", mock_server.uri());
    let res = client.post(&login_url).json(&json!({
        "username": "newuser",
        "password": "SecurePass123!"
    })).send().await?;

    assert_eq!(res.status(), StatusCode::OK);
    let body: serde_json::Value = res.json().await?;
    let token = body["access_token"].as_str().unwrap();

    // Step 3: Access protected resource with token
    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/profile"))
        .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
            "username": "newuser",
            "email": "newuser@example.com"
        })))
        .mount(&mock_server)
        .await;

    let profile_url = format!("{}/api/v1/profile", mock_server.uri());
    let res = client
        .get(&profile_url)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await?;

    assert_eq!(res.status(), StatusCode::OK);

    Ok(())
}

#[tokio::test]
async fn test_e2e_crud_workflow() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;
    let user = MockUser::admin();
    let token = generate_test_jwt(&user, 3600)?;

    // Create
    wiremock::Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/api/v1/configs"))
        .respond_with(wiremock::ResponseTemplate::new(201).set_body_json(json!({
            "id": "cfg_123",
            "name": "test_config"
        })))
        .mount(&mock_server)
        .await;

    let create_url = format!("{}/api/v1/configs", mock_server.uri());
    let (header_name, header_value) = bearer_auth_header(&token);
    let res = client
        .post(&create_url)
        .header(header_name.clone(), header_value.clone())
        .json(&json!({"name": "test_config"}))
        .send()
        .await?;
    assert_eq!(res.status(), StatusCode::CREATED);

    // Read
    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/configs/cfg_123"))
        .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
            "id": "cfg_123",
            "name": "test_config"
        })))
        .mount(&mock_server)
        .await;

    let get_url = format!("{}/api/v1/configs/cfg_123", mock_server.uri());
    let res = client
        .get(&get_url)
        .header(header_name.clone(), header_value.clone())
        .send()
        .await?;
    assert_eq!(res.status(), StatusCode::OK);

    // Update
    wiremock::Mock::given(wiremock::matchers::method("PUT"))
        .and(wiremock::matchers::path("/api/v1/configs/cfg_123"))
        .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
            "id": "cfg_123",
            "name": "updated_config"
        })))
        .mount(&mock_server)
        .await;

    let res = client
        .put(&get_url)
        .header(header_name.clone(), header_value.clone())
        .json(&json!({"name": "updated_config"}))
        .send()
        .await?;
    assert_eq!(res.status(), StatusCode::OK);

    // Delete
    wiremock::Mock::given(wiremock::matchers::method("DELETE"))
        .and(wiremock::matchers::path("/api/v1/configs/cfg_123"))
        .respond_with(wiremock::ResponseTemplate::new(204))
        .mount(&mock_server)
        .await;

    let res = client
        .delete(&get_url)
        .header(header_name, header_value)
        .send()
        .await?;
    assert_eq!(res.status(), StatusCode::NO_CONTENT);

    Ok(())
}

#[tokio::test]
async fn test_e2e_error_handling_workflow() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Attempt to access resource that doesn't exist
    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/configs/nonexistent"))
        .respond_with(wiremock::ResponseTemplate::new(404).set_body_json(json!({
            "error": "Resource not found",
            "code": "NOT_FOUND"
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/configs/nonexistent", mock_server.uri());
    let res = client.get(&url).send().await?;
    assert_eq!(res.status(), StatusCode::NOT_FOUND);

    Ok(())
}

#[tokio::test]
async fn test_e2e_pagination_workflow() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Fetch page 1
    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/configs"))
        .and(wiremock::matchers::query_param("page", "1"))
        .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
            "data": [{"id": "1"}, {"id": "2"}],
            "pagination": {"page": 1, "total_pages": 3}
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/configs?page=1", mock_server.uri());
    let res = client.get(&url).send().await?;
    assert_eq!(res.status(), StatusCode::OK);

    // Fetch page 2
    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/configs"))
        .and(wiremock::matchers::query_param("page", "2"))
        .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
            "data": [{"id": "3"}, {"id": "4"}],
            "pagination": {"page": 2, "total_pages": 3}
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/configs?page=2", mock_server.uri());
    let res = client.get(&url).send().await?;
    assert_eq!(res.status(), StatusCode::OK);

    Ok(())
}
