//! gRPC server implementation with TLS and HTTP/2 support

use crate::auth::TokenManager;
use crate::error::{ApiError, Result};
use crate::interceptors::{LoggingInterceptor, RateLimitConfig, RateLimitInterceptor};
use crate::services::*;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast;
use tonic::transport::{Certificate, Identity, Server, ServerTlsConfig};
use tracing::{info, warn};

/// TLS configuration
#[derive(Debug, Clone)]
pub struct TlsConfig {
    /// Path to server certificate
    pub cert_path: PathBuf,
    /// Path to server private key
    pub key_path: PathBuf,
    /// Path to CA certificate for client verification (mTLS)
    pub ca_cert_path: Option<PathBuf>,
    /// Require client certificates (mTLS)
    pub require_client_cert: bool,
}

impl TlsConfig {
    /// Load TLS identity from files
    pub fn load_identity(&self) -> Result<Identity> {
        let cert = std::fs::read(&self.cert_path)
            .map_err(|e| ApiError::Configuration(format!("Failed to read cert: {}", e)))?;

        let key = std::fs::read(&self.key_path)
            .map_err(|e| ApiError::Configuration(format!("Failed to read key: {}", e)))?;

        Identity::from_pem(cert, key)
    }

    /// Load CA certificate for client verification
    pub fn load_ca_cert(&self) -> Result<Option<Certificate>> {
        if let Some(ref ca_path) = self.ca_cert_path {
            let ca_cert = std::fs::read(ca_path)
                .map_err(|e| ApiError::Configuration(format!("Failed to read CA cert: {}", e)))?;

            Ok(Some(Certificate::from_pem(ca_cert)))
        } else {
            Ok(None)
        }
    }
}

/// gRPC server configuration
#[derive(Debug, Clone)]
pub struct GrpcServerConfig {
    /// Server bind address
    pub addr: SocketAddr,
    /// TLS configuration (optional)
    pub tls: Option<TlsConfig>,
    /// JWT secret for authentication
    pub jwt_secret: String,
    /// JWT issuer
    pub jwt_issuer: String,
    /// Rate limit configuration
    pub rate_limit: RateLimitConfig,
    /// Enable gRPC reflection
    pub enable_reflection: bool,
    /// Enable health checking
    pub enable_health: bool,
    /// Request timeout
    pub request_timeout: Duration,
    /// Maximum concurrent connections
    pub max_concurrent_connections: usize,
    /// TCP keepalive interval
    pub tcp_keepalive: Option<Duration>,
    /// TCP nodelay
    pub tcp_nodelay: bool,
}

impl Default for GrpcServerConfig {
    fn default() -> Self {
        Self {
            addr: "0.0.0.0:50051".parse().unwrap(),
            tls: None,
            jwt_secret: "change-me-in-production".to_string(),
            jwt_issuer: "llm-optimizer".to_string(),
            rate_limit: RateLimitConfig::default(),
            enable_reflection: true,
            enable_health: true,
            request_timeout: Duration::from_secs(30),
            max_concurrent_connections: 1000,
            tcp_keepalive: Some(Duration::from_secs(60)),
            tcp_nodelay: true,
        }
    }
}

/// gRPC server
pub struct GrpcServer {
    config: GrpcServerConfig,
    token_manager: Arc<TokenManager>,
    shutdown_tx: broadcast::Sender<()>,
}

impl GrpcServer {
    /// Create a new gRPC server
    pub async fn new(config: GrpcServerConfig) -> Result<Self> {
        let token_manager = Arc::new(TokenManager::new(
            config.jwt_secret.as_bytes(),
            config.jwt_issuer.clone(),
        ));

        let (shutdown_tx, _) = broadcast::channel(1);

        Ok(Self {
            config,
            token_manager,
            shutdown_tx,
        })
    }

    /// Get a shutdown signal receiver
    pub fn shutdown_signal(&self) -> broadcast::Receiver<()> {
        self.shutdown_tx.subscribe()
    }

    /// Trigger shutdown
    pub fn shutdown(&self) -> Result<()> {
        self.shutdown_tx
            .send(())
            .map_err(|e| ApiError::Internal(format!("Failed to send shutdown signal: {}", e)))?;
        Ok(())
    }

    /// Build and configure the server
    async fn build_server(&self) -> Result<tonic::transport::server::Router> {
        let mut server = Server::builder()
            .timeout(self.config.request_timeout)
            .concurrency_limit_per_connection(256)
            .tcp_keepalive(self.config.tcp_keepalive)
            .tcp_nodelay(self.config.tcp_nodelay);

        // Configure TLS if enabled
        if let Some(ref tls_config) = self.config.tls {
            info!("Configuring TLS");

            let identity = tls_config.load_identity()?;
            let mut tls = ServerTlsConfig::new().identity(identity);

            // Configure mTLS if required
            if let Some(ca_cert) = tls_config.load_ca_cert()? {
                info!("Enabling mutual TLS (mTLS)");
                tls = tls.client_ca_root(ca_cert);
            }

            server = server.tls_config(tls)
                .map_err(|e| ApiError::Configuration(format!("Failed to configure TLS: {}", e)))?;
        } else {
            warn!("Running without TLS - not recommended for production");
        }

        Ok(server)
    }

    /// Serve the gRPC API
    pub async fn serve(self) -> Result<()> {
        info!("Starting gRPC server on {}", self.config.addr);

        let server = self.build_server().await?;

        // Create interceptors
        let logging = LoggingInterceptor::new("grpc-api");
        let ratelimit = RateLimitInterceptor::new(self.config.rate_limit.clone());

        // Create services
        let optimization_service = optimization::OptimizationServiceImpl::new();
        let config_service = config::ConfigServiceImpl::new();
        let metrics_service = metrics::MetricsServiceImpl::new();
        let integrations_service = integrations::IntegrationServiceImpl::new();
        let health_service = health::HealthServiceImpl::new();
        let admin_service = admin::AdminServiceImpl::new();

        // Build router with services
        let mut router = server;

        // Add optimization service
        router = router.add_service(
            crate::proto::optimization::optimization_service_server::OptimizationServiceServer::new(
                optimization_service,
            ),
        );

        // Add config service
        router = router.add_service(
            crate::proto::config::config_service_server::ConfigServiceServer::new(config_service),
        );

        // Add metrics service
        router = router.add_service(
            crate::proto::metrics::metrics_service_server::MetricsServiceServer::new(
                metrics_service,
            ),
        );

        // Add integrations service
        router = router.add_service(
            crate::proto::integrations::integration_service_server::IntegrationServiceServer::new(
                integrations_service,
            ),
        );

        // Add health service
        if self.config.enable_health {
            router = router.add_service(
                crate::proto::health::health_service_server::HealthServiceServer::new(
                    health_service,
                ),
            );
        }

        // Add admin service
        router = router.add_service(
            crate::proto::admin::admin_service_server::AdminServiceServer::new(admin_service),
        );

        // Add reflection if enabled
        if self.config.enable_reflection {
            info!("gRPC reflection enabled");
            // Reflection will be added when we have the file descriptor sets
        }

        info!("gRPC server listening on {}", self.config.addr);

        // Serve with graceful shutdown
        let mut shutdown_rx = self.shutdown_signal();

        router
            .serve_with_shutdown(self.config.addr, async move {
                let _ = shutdown_rx.recv().await;
                info!("Shutdown signal received, stopping gRPC server");
            })
            .await
            .map_err(|e| ApiError::Internal(format!("Server error: {}", e)))?;

        info!("gRPC server stopped");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = GrpcServerConfig::default();
        assert_eq!(config.addr.port(), 50051);
        assert!(config.enable_reflection);
        assert!(config.enable_health);
    }

    #[tokio::test]
    async fn test_server_creation() {
        let config = GrpcServerConfig::default();
        let server = GrpcServer::new(config).await;
        assert!(server.is_ok());
    }
}
