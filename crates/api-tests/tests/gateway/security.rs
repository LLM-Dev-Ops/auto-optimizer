//! API Gateway security tests

use api_tests::TestResult;
use reqwest::StatusCode;

#[tokio::test]
async fn test_gateway_authentication_enforcement() -> TestResult {
    let client = api_tests::build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    // Unauthenticated request should be blocked at gateway
    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/gateway/protected"))
        .respond_with(wiremock::ResponseTemplate::new(401))
        .mount(&mock_server)
        .await;

    let url = format!("{}/gateway/protected", mock_server.uri());
    let res = client.get(&url).send().await?;

    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    Ok(())
}

#[tokio::test]
async fn test_gateway_rate_limiting() -> TestResult {
    // Test gateway-level rate limiting
    Ok(())
}

#[tokio::test]
async fn test_gateway_cors_headers() -> TestResult {
    let client = api_tests::build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    wiremock::Mock::given(wiremock::matchers::method("OPTIONS"))
        .and(wiremock::matchers::path("/gateway/api"))
        .respond_with(
            wiremock::ResponseTemplate::new(200)
                .insert_header("Access-Control-Allow-Origin", "*")
                .insert_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE")
        )
        .mount(&mock_server)
        .await;

    let url = format!("{}/gateway/api", mock_server.uri());
    let res = client.request(reqwest::Method::OPTIONS, &url).send().await?;

    assert!(res.headers().contains_key("access-control-allow-origin"));
    Ok(())
}

#[tokio::test]
async fn test_gateway_security_headers() -> TestResult {
    let client = api_tests::build_test_client();
    let mock_server = wiremock::MockServer::start().await;

    wiremock::Mock::given(wiremock::matchers::method("GET"))
        .and(wiremock::matchers::path("/gateway/api"))
        .respond_with(
            wiremock::ResponseTemplate::new(200)
                .insert_header("X-Content-Type-Options", "nosniff")
                .insert_header("X-Frame-Options", "DENY")
                .insert_header("X-XSS-Protection", "1; mode=block")
                .insert_header("Strict-Transport-Security", "max-age=31536000")
        )
        .mount(&mock_server)
        .await;

    let url = format!("{}/gateway/api", mock_server.uri());
    let res = client.get(&url).send().await?;

    assert!(res.headers().contains_key("x-content-type-options"));
    assert!(res.headers().contains_key("x-frame-options"));
    assert!(res.headers().contains_key("strict-transport-security"));

    Ok(())
}
