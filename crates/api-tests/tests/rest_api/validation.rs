//! REST API request/response validation tests

use api_tests::*;
use reqwest::StatusCode;
use serde_json::json;

#[tokio::test]
async fn test_request_schema_validation_required_fields() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Missing required field
    let invalid_body = json!({
        "description": "Missing name field"
    });

    wiremock::Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/api/v1/configs"))
        .respond_with(wiremock::ResponseTemplate::new(400).set_body_json(json!({
            "error": "Validation failed",
            "code": "VALIDATION_ERROR",
            "details": [
                {
                    "field": "name",
                    "message": "Field is required"
                }
            ]
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/configs", mock_server.uri());
    let res = client.post(&url).json(&invalid_body).send().await?;

    assert_eq!(res.status(), StatusCode::BAD_REQUEST);

    let body: serde_json::Value = res.json().await?;
    assert_eq!(body["code"], "VALIDATION_ERROR");

    Ok(())
}

#[tokio::test]
async fn test_request_schema_validation_field_types() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Wrong type for field
    let invalid_body = json!({
        "name": "test",
        "count": "not_a_number"
    });

    wiremock::Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/api/v1/configs"))
        .respond_with(wiremock::ResponseTemplate::new(400).set_body_json(json!({
            "error": "Validation failed",
            "code": "VALIDATION_ERROR",
            "details": [
                {
                    "field": "count",
                    "message": "Expected integer, got string"
                }
            ]
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/configs", mock_server.uri());
    let res = client.post(&url).json(&invalid_body).send().await?;

    assert_eq!(res.status(), StatusCode::BAD_REQUEST);

    Ok(())
}

#[tokio::test]
async fn test_request_schema_validation_value_constraints() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Temperature out of range
    let invalid_body = json!({
        "model": "claude-3-sonnet",
        "temperature": 2.5  // Should be 0.0-1.0
    });

    wiremock::Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/api/v1/configs"))
        .respond_with(wiremock::ResponseTemplate::new(400).set_body_json(json!({
            "error": "Validation failed",
            "code": "VALIDATION_ERROR",
            "details": [
                {
                    "field": "temperature",
                    "message": "Value must be between 0.0 and 1.0"
                }
            ]
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/configs", mock_server.uri());
    let res = client.post(&url).json(&invalid_body).send().await?;

    assert_eq!(res.status(), StatusCode::BAD_REQUEST);

    Ok(())
}

#[tokio::test]
async fn test_request_schema_validation_string_length() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // String too long
    let long_string = "a".repeat(1001);
    let invalid_body = json!({
        "name": long_string
    });

    wiremock::Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/api/v1/configs"))
        .respond_with(wiremock::ResponseTemplate::new(400).set_body_json(json!({
            "error": "Validation failed",
            "code": "VALIDATION_ERROR",
            "details": [
                {
                    "field": "name",
                    "message": "String length must be at most 1000 characters"
                }
            ]
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/configs", mock_server.uri());
    let res = client.post(&url).json(&invalid_body).send().await?;

    assert_eq!(res.status(), StatusCode::BAD_REQUEST);

    Ok(())
}

#[tokio::test]
async fn test_request_schema_validation_enum_values() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Invalid enum value
    let invalid_body = json!({
        "model": "invalid-model-name"
    });

    wiremock::Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/api/v1/configs"))
        .respond_with(wiremock::ResponseTemplate::new(400).set_body_json(json!({
            "error": "Validation failed",
            "code": "VALIDATION_ERROR",
            "details": [
                {
                    "field": "model",
                    "message": "Invalid value. Allowed: claude-3-opus, claude-3-sonnet, claude-3-haiku"
                }
            ]
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/configs", mock_server.uri());
    let res = client.post(&url).json(&invalid_body).send().await?;

    assert_eq!(res.status(), StatusCode::BAD_REQUEST);

    Ok(())
}

#[tokio::test]
async fn test_request_content_type_validation() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    wiremock::Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/api/v1/configs"))
        .and(wiremock::matchers::header("content-type", "text/plain"))
        .respond_with(wiremock::ResponseTemplate::new(415).set_body_json(json!({
            "error": "Unsupported media type",
            "code": "UNSUPPORTED_MEDIA_TYPE",
            "message": "Expected application/json"
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/configs", mock_server.uri());
    let res = client
        .post(&url)
        .header("content-type", "text/plain")
        .body("plain text")
        .send()
        .await?;

    assert_eq!(res.status(), StatusCode::UNSUPPORTED_MEDIA_TYPE);

    Ok(())
}

#[tokio::test]
async fn test_response_schema_validation() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/configs/cfg_123"))
        .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
            "id": "cfg_123",
            "name": "test_config",
            "model": "claude-3-sonnet",
            "temperature": 0.7,
            "max_tokens": 1024,
            "created_at": "2025-11-10T00:00:00Z",
            "updated_at": "2025-11-10T00:00:00Z"
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/configs/cfg_123", mock_server.uri());
    let res = client.get(&url).send().await?;

    assert_eq!(res.status(), StatusCode::OK);

    let body: serde_json::Value = res.json().await?;

    // Validate response has expected fields
    assert!(body.get("id").is_some());
    assert!(body.get("name").is_some());
    assert!(body.get("model").is_some());
    assert!(body.get("temperature").is_some());
    assert!(body.get("created_at").is_some());

    // Validate field types
    assert!(body["id"].is_string());
    assert!(body["temperature"].is_f64() || body["temperature"].is_i64());

    Ok(())
}

#[tokio::test]
async fn test_malformed_json_request() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    wiremock::Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/api/v1/configs"))
        .respond_with(wiremock::ResponseTemplate::new(400).set_body_json(json!({
            "error": "Invalid JSON",
            "code": "INVALID_JSON"
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/configs", mock_server.uri());
    let res = client
        .post(&url)
        .header("content-type", "application/json")
        .body("{invalid json")
        .send()
        .await?;

    assert_eq!(res.status(), StatusCode::BAD_REQUEST);

    Ok(())
}

#[tokio::test]
async fn test_query_parameter_validation() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Invalid page number
    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/configs"))
        .and(wiremock::matchers::query_param("page", "-1"))
        .respond_with(wiremock::ResponseTemplate::new(400).set_body_json(json!({
            "error": "Validation failed",
            "code": "VALIDATION_ERROR",
            "details": [
                {
                    "field": "page",
                    "message": "Must be a positive integer"
                }
            ]
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/configs?page=-1", mock_server.uri());
    let res = client.get(&url).send().await?;

    assert_eq!(res.status(), StatusCode::BAD_REQUEST);

    Ok(())
}

#[tokio::test]
async fn test_uuid_validation() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Invalid UUID format
    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/api/v1/configs/not-a-uuid"))
        .respond_with(wiremock::ResponseTemplate::new(400).set_body_json(json!({
            "error": "Invalid UUID format",
            "code": "INVALID_UUID"
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/configs/not-a-uuid", mock_server.uri());
    let res = client.get(&url).send().await?;

    assert_eq!(res.status(), StatusCode::BAD_REQUEST);

    Ok(())
}

#[tokio::test]
async fn test_nested_object_validation() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    let invalid_body = json!({
        "name": "test",
        "config": {
            "model": "claude-3-sonnet",
            "parameters": {
                "temperature": "invalid"  // Should be number
            }
        }
    });

    wiremock::Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/api/v1/configs"))
        .respond_with(wiremock::ResponseTemplate::new(400).set_body_json(json!({
            "error": "Validation failed",
            "code": "VALIDATION_ERROR",
            "details": [
                {
                    "field": "config.parameters.temperature",
                    "message": "Expected number, got string"
                }
            ]
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/configs", mock_server.uri());
    let res = client.post(&url).json(&invalid_body).send().await?;

    assert_eq!(res.status(), StatusCode::BAD_REQUEST);

    Ok(())
}

#[tokio::test]
async fn test_array_validation() -> TestResult {
    let client = build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    let invalid_body = json!({
        "name": "test",
        "tags": ["valid", 123, "also valid"]  // Mixed types not allowed
    });

    wiremock::Mock::given(wiremock::matchers::method("POST"))
        .and(wiremock::matchers::path("/api/v1/configs"))
        .respond_with(wiremock::ResponseTemplate::new(400).set_body_json(json!({
            "error": "Validation failed",
            "code": "VALIDATION_ERROR",
            "details": [
                {
                    "field": "tags[1]",
                    "message": "Expected string, got number"
                }
            ]
        })))
        .mount(&mock_server)
        .await;

    let url = format!("{}/api/v1/configs", mock_server.uri());
    let res = client.post(&url).json(&invalid_body).send().await?;

    assert_eq!(res.status(), StatusCode::BAD_REQUEST);

    Ok(())
}
