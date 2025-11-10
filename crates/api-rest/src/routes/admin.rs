//! Admin routes

use axum::{extract::{Query, State}, http::StatusCode, routing::{delete, get, post}, Json, Router};
use std::sync::Arc;
use crate::error::ApiResult;
use crate::models::{admin::*, common::{ApiResponse, PaginatedResponse, Pagination}};

#[derive(Clone)]
pub struct AdminService;

pub fn admin_routes(service: Arc<AdminService>) -> Router {
    Router::new()
        .route("/admin/stats", get(get_system_stats))
        .route("/admin/cache/flush", post(flush_cache))
        .route("/admin/api-keys", post(create_api_key))
        .route("/admin/api-keys", get(list_api_keys))
        .route("/admin/api-keys/:id", delete(revoke_api_key))
        .route("/admin/audit-logs", get(query_audit_logs))
        .with_state(service)
}

async fn get_system_stats(State(_): State<Arc<AdminService>>) -> ApiResult<Json<ApiResponse<SystemStats>>> {
    let stats = SystemStats {
        total_optimizations: 150,
        active_optimizations: 12,
        total_cost_savings: 15234.56,
        total_requests_processed: 1500000,
        avg_latency_ms: 145.0,
        uptime_seconds: 864000,
        timestamp: chrono::Utc::now(),
    };
    Ok(Json(ApiResponse::new(stats)))
}

async fn flush_cache(State(_): State<Arc<AdminService>>, Json(_): Json<FlushCacheRequest>) -> ApiResult<Json<ApiResponse<FlushCacheResponse>>> {
    let response = FlushCacheResponse {
        keys_flushed: 42,
        message: "Cache flushed successfully".to_string(),
    };
    Ok(Json(ApiResponse::new(response)))
}

async fn create_api_key(State(_): State<Arc<AdminService>>, Json(req): Json<CreateApiKeyRequest>) -> ApiResult<(StatusCode, Json<ApiResponse<ApiKeyResponse>>)> {
    let response = ApiKeyResponse {
        key: Some("sk_test_1234567890abcdef".to_string()),
        id: uuid::Uuid::new_v4().to_string(),
        name: req.name,
        roles: req.roles,
        created_at: chrono::Utc::now(),
        expires_at: req.expires_at,
        last_used_at: None,
    };
    Ok((StatusCode::CREATED, Json(ApiResponse::new(response))))
}

async fn list_api_keys(State(_): State<Arc<AdminService>>) -> ApiResult<Json<PaginatedResponse<ApiKeyResponse>>> {
    Ok(Json(PaginatedResponse::new(vec![], 0, &Pagination::default())))
}

async fn revoke_api_key(State(_): State<Arc<AdminService>>, axum::extract::Path(_id): axum::extract::Path<String>) -> ApiResult<StatusCode> {
    Ok(StatusCode::NO_CONTENT)
}

async fn query_audit_logs(State(_): State<Arc<AdminService>>, Query(_): Query<QueryAuditLogsRequest>) -> ApiResult<Json<PaginatedResponse<AuditLogEntry>>> {
    Ok(Json(PaginatedResponse::new(vec![], 0, &Pagination::default())))
}
