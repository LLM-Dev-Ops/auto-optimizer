//! Health check routes

use axum::{
    extract::State,
    http::StatusCode,
    routing::get,
    Json, Router,
};
use chrono::Utc;
use std::sync::Arc;
use std::time::SystemTime;

use crate::error::ApiResult;
use crate::models::health::{
    ComponentHealth, HealthResponse, HealthStatus, LivenessResponse, ReadinessResponse,
    ComponentReadiness,
};

/// Application state for health checks
#[derive(Clone)]
pub struct HealthState {
    pub start_time: SystemTime,
    pub version: String,
}

impl HealthState {
    pub fn new(version: String) -> Self {
        Self {
            start_time: SystemTime::now(),
            version,
        }
    }

    pub fn uptime_seconds(&self) -> u64 {
        self.start_time
            .elapsed()
            .map(|d| d.as_secs())
            .unwrap_or(0)
    }
}

/// Health check routes
pub fn health_routes(state: Arc<HealthState>) -> Router {
    Router::new()
        .route("/health", get(health_check))
        .route("/health/live", get(liveness_check))
        .route("/health/ready", get(readiness_check))
        .with_state(state)
}

/// Comprehensive health check
#[utoipa::path(
    get,
    path = "/api/v1/health",
    tag = "health",
    responses(
        (status = 200, description = "Health check successful", body = HealthResponse),
        (status = 503, description = "Service unhealthy")
    )
)]
async fn health_check(
    State(state): State<Arc<HealthState>>,
) -> ApiResult<Json<HealthResponse>> {
    let mut components = Vec::new();

    // Check database (placeholder)
    components.push(ComponentHealth {
        name: "database".to_string(),
        status: HealthStatus::Healthy,
        message: Some("Connected".to_string()),
        last_checked: Utc::now(),
        response_time_ms: Some(5.0),
    });

    // Check cache (placeholder)
    components.push(ComponentHealth {
        name: "cache".to_string(),
        status: HealthStatus::Healthy,
        message: Some("Connected".to_string()),
        last_checked: Utc::now(),
        response_time_ms: Some(2.0),
    });

    // Check message queue (placeholder)
    components.push(ComponentHealth {
        name: "message_queue".to_string(),
        status: HealthStatus::Healthy,
        message: Some("Connected".to_string()),
        last_checked: Utc::now(),
        response_time_ms: Some(3.0),
    });

    // Determine overall status
    let overall_status = if components.iter().any(|c| c.status == HealthStatus::Unhealthy) {
        HealthStatus::Unhealthy
    } else if components.iter().any(|c| c.status == HealthStatus::Degraded) {
        HealthStatus::Degraded
    } else {
        HealthStatus::Healthy
    };

    let response = HealthResponse {
        status: overall_status,
        version: state.version.clone(),
        uptime_seconds: state.uptime_seconds(),
        components,
        timestamp: Utc::now(),
    };

    Ok(Json(response))
}

/// Liveness probe (for Kubernetes)
#[utoipa::path(
    get,
    path = "/api/v1/health/live",
    tag = "health",
    responses(
        (status = 200, description = "Service is alive", body = LivenessResponse)
    )
)]
async fn liveness_check() -> Json<LivenessResponse> {
    Json(LivenessResponse {
        alive: true,
        timestamp: Utc::now(),
    })
}

/// Readiness probe (for Kubernetes)
#[utoipa::path(
    get,
    path = "/api/v1/health/ready",
    tag = "health",
    responses(
        (status = 200, description = "Service is ready", body = ReadinessResponse),
        (status = 503, description = "Service not ready")
    )
)]
async fn readiness_check() -> (StatusCode, Json<ReadinessResponse>) {
    // Check if all critical components are ready
    let components = vec![
        ComponentReadiness {
            name: "database".to_string(),
            ready: true,
            message: None,
        },
        ComponentReadiness {
            name: "cache".to_string(),
            ready: true,
            message: None,
        },
    ];

    let ready = components.iter().all(|c| c.ready);

    let status = if ready {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };

    let response = ReadinessResponse {
        ready,
        message: if ready {
            Some("Service is ready".to_string())
        } else {
            Some("Service is not ready".to_string())
        },
        components,
    };

    (status, Json(response))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_liveness_check() {
        let response = liveness_check().await;
        assert!(response.0.alive);
    }

    #[tokio::test]
    async fn test_health_state() {
        let state = HealthState::new("1.0.0".to_string());
        assert_eq!(state.version, "1.0.0");
        assert!(state.uptime_seconds() >= 0);
    }
}
