//! Configuration routes

use axum::{extract::{Path, State}, http::StatusCode, routing::{get, post, put}, Json, Router};
use std::sync::Arc;
use crate::error::{ApiError, ApiResult};
use crate::models::{config::*, common::ApiResponse};

#[derive(Clone)]
pub struct ConfigService;

pub fn config_routes(service: Arc<ConfigService>) -> Router {
    Router::new()
        .route("/config/:key", get(get_config))
        .route("/config/:key", put(update_config))
        .route("/config/batch", post(batch_update_config))
        .with_state(service)
}

async fn get_config(State(_): State<Arc<ConfigService>>, Path(key): Path<String>) -> ApiResult<Json<ApiResponse<ConfigResponse>>> {
    Err(ApiError::NotFound(format!("Config key not found: {}", key)))
}

async fn update_config(State(_): State<Arc<ConfigService>>, Path(_): Path<String>, Json(_): Json<UpdateConfigRequest>) -> ApiResult<Json<ApiResponse<ConfigResponse>>> {
    Err(ApiError::NotFound("Not implemented".into()))
}

async fn batch_update_config(State(_): State<Arc<ConfigService>>, Json(_): Json<BatchUpdateConfigRequest>) -> ApiResult<Json<ApiResponse<Vec<ConfigResponse>>>> {
    Ok(Json(ApiResponse::new(vec![])))
}
