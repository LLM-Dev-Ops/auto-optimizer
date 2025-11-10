//! Integration routes

use axum::{extract::{Path, State}, http::StatusCode, routing::{delete, get, post, put}, Json, Router};
use std::sync::Arc;
use uuid::Uuid;
use crate::error::{ApiError, ApiResult};
use crate::models::{integrations::*, common::{ApiResponse, PaginatedResponse, Pagination}};

#[derive(Clone)]
pub struct IntegrationService;

pub fn integrations_routes(service: Arc<IntegrationService>) -> Router {
    Router::new()
        .route("/integrations", post(create_integration))
        .route("/integrations", get(list_integrations))
        .route("/integrations/:id", get(get_integration))
        .route("/integrations/:id", put(update_integration))
        .route("/integrations/:id", delete(delete_integration))
        .route("/integrations/:id/test", post(test_integration))
        .with_state(service)
}

async fn create_integration(State(_): State<Arc<IntegrationService>>, Json(req): Json<CreateIntegrationRequest>) -> ApiResult<(StatusCode, Json<ApiResponse<IntegrationResponse>>)> {
    let response = IntegrationResponse {
        id: Uuid::new_v4(),
        name: req.name,
        integration_type: req.integration_type,
        enabled: req.enabled,
        config: serde_json::json!({}),
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
        last_sync_at: None,
    };
    Ok((StatusCode::CREATED, Json(ApiResponse::new(response))))
}

async fn list_integrations(State(_): State<Arc<IntegrationService>>) -> ApiResult<Json<PaginatedResponse<IntegrationResponse>>> {
    Ok(Json(PaginatedResponse::new(vec![], 0, &Pagination::default())))
}

async fn get_integration(State(_): State<Arc<IntegrationService>>, Path(_id): Path<Uuid>) -> ApiResult<Json<ApiResponse<IntegrationResponse>>> {
    Err(ApiError::NotFound("Integration not found".into()))
}

async fn update_integration(State(_): State<Arc<IntegrationService>>, Path(_id): Path<Uuid>, Json(_): Json<UpdateIntegrationRequest>) -> ApiResult<Json<ApiResponse<IntegrationResponse>>> {
    Err(ApiError::NotFound("Integration not found".into()))
}

async fn delete_integration(State(_): State<Arc<IntegrationService>>, Path(_id): Path<Uuid>) -> ApiResult<StatusCode> {
    Ok(StatusCode::NO_CONTENT)
}

async fn test_integration(State(_): State<Arc<IntegrationService>>, Path(_id): Path<Uuid>, Json(_): Json<TestIntegrationRequest>) -> ApiResult<Json<ApiResponse<TestIntegrationResponse>>> {
    let response = TestIntegrationResponse {
        success: true,
        message: "Integration test successful".to_string(),
        data: None,
    };
    Ok(Json(ApiResponse::new(response)))
}
