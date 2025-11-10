//! Health service implementation

use crate::proto::health::*;
use tokio_stream::wrappers::ReceiverStream;
use tonic::{Request, Response, Status};
use tracing::debug;

#[derive(Debug, Clone, Default)]
pub struct HealthServiceImpl {}

impl HealthServiceImpl {
    pub fn new() -> Self {
        Self {}
    }
}

#[tonic::async_trait]
impl health_service_server::HealthService for HealthServiceImpl {
    async fn check(&self, _req: Request<HealthCheckRequest>) -> Result<Response<HealthCheckResponse>, Status> {
        debug!("Health check called");
        Ok(Response::new(HealthCheckResponse {
            status: HealthStatus::Serving as i32,
        }))
    }
    
    async fn detailed_health(&self, _req: Request<DetailedHealthRequest>) -> Result<Response<DetailedHealthResponse>, Status> {
        debug!("Detailed health check called");
        Ok(Response::new(DetailedHealthResponse {
            health: Some(SystemHealth {
                overall_status: HealthStatus::Serving as i32,
                components: vec![],
                checked_at: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
                version: env!("CARGO_PKG_VERSION").to_string(),
                uptime_seconds: 0,
            }),
        }))
    }
    
    async fn readiness(&self, _req: Request<ReadinessCheckRequest>) -> Result<Response<ReadinessCheckResponse>, Status> {
        debug!("Readiness check called");
        Ok(Response::new(ReadinessCheckResponse {
            ready: true,
            not_ready_reasons: vec![],
        }))
    }
    
    async fn liveness(&self, _req: Request<LivenessCheckRequest>) -> Result<Response<LivenessCheckResponse>, Status> {
        debug!("Liveness check called");
        Ok(Response::new(LivenessCheckResponse {
            alive: true,
        }))
    }
    
    type WatchStream = ReceiverStream<Result<HealthCheckResponse, Status>>;
    async fn watch(&self, _req: Request<HealthCheckRequest>) -> Result<Response<Self::WatchStream>, Status> {
        debug!("Health watch called");
        let (_, rx) = tokio::sync::mpsc::channel(100);
        Ok(Response::new(ReceiverStream::new(rx)))
    }
}
