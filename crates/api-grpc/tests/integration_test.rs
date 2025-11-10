//! Integration tests for gRPC API

use llm_optimizer_api_grpc::{GrpcServer, GrpcServerConfig};

#[tokio::test]
async fn test_server_creation() {
    let config = GrpcServerConfig::default();
    let server = GrpcServer::new(config).await;
    assert!(server.is_ok());
}

#[test]
fn test_config_defaults() {
    let config = GrpcServerConfig::default();
    assert_eq!(config.addr.port(), 50051);
    assert!(config.enable_reflection);
    assert!(config.enable_health);
}
