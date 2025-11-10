//! REST API client implementation

use super::*;
use crate::{CliError, CliResult};
use async_trait::async_trait;
use reqwest::{Client, RequestBuilder};
use serde::de::DeserializeOwned;

/// REST API client
pub struct RestClient {
    client: Client,
    config: ClientConfig,
}

impl RestClient {
    /// Create a new REST client
    pub fn new(config: ClientConfig) -> CliResult<Self> {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            reqwest::header::CONTENT_TYPE,
            reqwest::header::HeaderValue::from_static("application/json"),
        );

        if let Some(api_key) = &config.api_key {
            headers.insert(
                reqwest::header::AUTHORIZATION,
                reqwest::header::HeaderValue::from_str(&format!("Bearer {}", api_key))
                    .map_err(|e| CliError::Config(format!("Invalid API key: {}", e)))?,
            );
        }

        let client = Client::builder()
            .timeout(config.timeout)
            .default_headers(headers)
            .build()?;

        Ok(Self { client, config })
    }

    /// Make a GET request
    async fn get<T: DeserializeOwned>(&self, path: &str) -> CliResult<T> {
        let url = format!("{}{}", self.config.base_url, path);
        let response = self.client.get(&url).send().await?;
        self.handle_response(response).await
    }

    /// Make a POST request
    async fn post<B: Serialize, T: DeserializeOwned>(&self, path: &str, body: &B) -> CliResult<T> {
        let url = format!("{}{}", self.config.base_url, path);
        let response = self.client.post(&url).json(body).send().await?;
        self.handle_response(response).await
    }

    /// Make a PUT request
    async fn put<B: Serialize, T: DeserializeOwned>(&self, path: &str, body: &B) -> CliResult<T> {
        let url = format!("{}{}", self.config.base_url, path);
        let response = self.client.put(&url).json(body).send().await?;
        self.handle_response(response).await
    }

    /// Make a DELETE request
    async fn delete<T: DeserializeOwned>(&self, path: &str) -> CliResult<T> {
        let url = format!("{}{}", self.config.base_url, path);
        let response = self.client.delete(&url).send().await?;
        self.handle_response(response).await
    }

    /// Make a DELETE request without response body
    async fn delete_no_content(&self, path: &str) -> CliResult<()> {
        let url = format!("{}{}", self.config.base_url, path);
        let response = self.client.delete(&url).send().await?;

        if response.status().is_success() {
            Ok(())
        } else {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            Err(self.map_error(status, &error_text))
        }
    }

    /// Handle API response
    async fn handle_response<T: DeserializeOwned>(&self, response: reqwest::Response) -> CliResult<T> {
        let status = response.status();

        if status.is_success() {
            let body = response.json::<T>().await?;
            Ok(body)
        } else {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            Err(self.map_error(status, &error_text))
        }
    }

    /// Map HTTP status code to CLI error
    fn map_error(&self, status: reqwest::StatusCode, message: &str) -> CliError {
        match status {
            reqwest::StatusCode::NOT_FOUND => CliError::NotFound(message.to_string()),
            reqwest::StatusCode::UNAUTHORIZED => CliError::AuthenticationFailed(message.to_string()),
            reqwest::StatusCode::FORBIDDEN => CliError::PermissionDenied(message.to_string()),
            reqwest::StatusCode::BAD_REQUEST => CliError::InvalidInput(message.to_string()),
            _ => CliError::Api(format!("HTTP {}: {}", status, message)),
        }
    }
}

#[async_trait]
impl ApiClient for RestClient {
    async fn health_check(&self) -> CliResult<HealthResponse> {
        self.get("/health").await
    }

    async fn start_service(&self) -> CliResult<ServiceResponse> {
        self.post("/admin/service/start", &()).await
    }

    async fn stop_service(&self) -> CliResult<ServiceResponse> {
        self.post("/admin/service/stop", &()).await
    }

    async fn restart_service(&self) -> CliResult<ServiceResponse> {
        self.post("/admin/service/restart", &()).await
    }

    async fn get_service_status(&self) -> CliResult<ServiceStatusResponse> {
        self.get("/admin/service/status").await
    }

    async fn create_optimization(
        &self,
        request: CreateOptimizationRequest,
    ) -> CliResult<OptimizationResponse> {
        self.post("/api/v1/optimizations", &request).await
    }

    async fn list_optimizations(
        &self,
        query: ListOptimizationsQuery,
    ) -> CliResult<Vec<OptimizationResponse>> {
        let mut url = "/api/v1/optimizations".to_string();
        let mut params = vec![];

        if let Some(status) = &query.status {
            params.push(format!("status={}", status));
        }
        if let Some(strategy) = &query.strategy {
            params.push(format!("strategy={}", strategy));
        }
        if let Some(service) = &query.service {
            params.push(format!("service={}", service));
        }
        if let Some(from) = &query.from {
            params.push(format!("from={}", from));
        }
        if let Some(to) = &query.to {
            params.push(format!("to={}", to));
        }

        if !params.is_empty() {
            url.push('?');
            url.push_str(&params.join("&"));
        }

        self.get(&url).await
    }

    async fn get_optimization(&self, id: &str) -> CliResult<OptimizationResponse> {
        self.get(&format!("/api/v1/optimizations/{}", id)).await
    }

    async fn deploy_optimization(
        &self,
        id: &str,
        request: DeployOptimizationRequest,
    ) -> CliResult<OptimizationResponse> {
        self.post(&format!("/api/v1/optimizations/{}/deploy", id), &request)
            .await
    }

    async fn rollback_optimization(
        &self,
        id: &str,
        request: RollbackOptimizationRequest,
    ) -> CliResult<OptimizationResponse> {
        self.post(&format!("/api/v1/optimizations/{}/rollback", id), &request)
            .await
    }

    async fn cancel_optimization(&self, id: &str) -> CliResult<OptimizationResponse> {
        self.post(&format!("/api/v1/optimizations/{}/cancel", id), &())
            .await
    }

    async fn get_config(&self, key: &str) -> CliResult<ConfigValue> {
        self.get(&format!("/api/v1/config/{}", key)).await
    }

    async fn set_config(&self, key: &str, value: serde_json::Value) -> CliResult<ConfigValue> {
        #[derive(Serialize)]
        struct SetConfigRequest {
            value: serde_json::Value,
        }

        self.put(&format!("/api/v1/config/{}", key), &SetConfigRequest { value })
            .await
    }

    async fn list_configs(&self) -> CliResult<Vec<ConfigEntry>> {
        self.get("/api/v1/config").await
    }

    async fn validate_config(&self) -> CliResult<ValidationResult> {
        self.post("/api/v1/config/validate", &()).await
    }

    async fn export_config(&self) -> CliResult<String> {
        let url = format!("{}/api/v1/config/export", self.config.base_url);
        let response = self.client.get(&url).send().await?;

        if response.status().is_success() {
            Ok(response.text().await?)
        } else {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            Err(self.map_error(status, &error_text))
        }
    }

    async fn import_config(&self, config: &str) -> CliResult<()> {
        let url = format!("{}/api/v1/config/import", self.config.base_url);
        let response = self.client.post(&url).body(config.to_string()).send().await?;

        if response.status().is_success() {
            Ok(())
        } else {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            Err(self.map_error(status, &error_text))
        }
    }

    async fn query_metrics(&self, query: MetricsQuery) -> CliResult<MetricsResponse> {
        self.post("/api/v1/metrics/query", &query).await
    }

    async fn get_performance_metrics(
        &self,
        query: PerformanceQuery,
    ) -> CliResult<PerformanceMetrics> {
        let mut url = "/api/v1/metrics/performance".to_string();
        let mut params = vec![];

        if let Some(service) = &query.service {
            params.push(format!("service={}", service));
        }
        if let Some(from) = &query.from {
            params.push(format!("from={}", from));
        }
        if let Some(to) = &query.to {
            params.push(format!("to={}", to));
        }

        if !params.is_empty() {
            url.push('?');
            url.push_str(&params.join("&"));
        }

        self.get(&url).await
    }

    async fn get_cost_metrics(&self, query: CostQuery) -> CliResult<CostMetrics> {
        let mut url = "/api/v1/metrics/cost".to_string();
        let mut params = vec![];

        if let Some(service) = &query.service {
            params.push(format!("service={}", service));
        }
        if let Some(from) = &query.from {
            params.push(format!("from={}", from));
        }
        if let Some(to) = &query.to {
            params.push(format!("to={}", to));
        }

        if !params.is_empty() {
            url.push('?');
            url.push_str(&params.join("&"));
        }

        self.get(&url).await
    }

    async fn get_quality_metrics(&self, query: QualityQuery) -> CliResult<QualityMetrics> {
        let mut url = "/api/v1/metrics/quality".to_string();
        let mut params = vec![];

        if let Some(service) = &query.service {
            params.push(format!("service={}", service));
        }
        if let Some(from) = &query.from {
            params.push(format!("from={}", from));
        }
        if let Some(to) = &query.to {
            params.push(format!("to={}", to));
        }

        if !params.is_empty() {
            url.push('?');
            url.push_str(&params.join("&"));
        }

        self.get(&url).await
    }

    async fn export_metrics(&self, query: ExportMetricsQuery) -> CliResult<String> {
        let mut url = format!("{}/api/v1/metrics/export", self.config.base_url);
        let mut params = vec![format!("format={}", query.format)];

        if let Some(from) = &query.from {
            params.push(format!("from={}", from));
        }
        if let Some(to) = &query.to {
            params.push(format!("to={}", to));
        }

        url.push('?');
        url.push_str(&params.join("&"));

        let response = self.client.get(&url).send().await?;

        if response.status().is_success() {
            Ok(response.text().await?)
        } else {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            Err(self.map_error(status, &error_text))
        }
    }

    async fn add_integration(
        &self,
        request: AddIntegrationRequest,
    ) -> CliResult<IntegrationResponse> {
        self.post("/api/v1/integrations", &request).await
    }

    async fn list_integrations(&self) -> CliResult<Vec<IntegrationResponse>> {
        self.get("/api/v1/integrations").await
    }

    async fn test_integration(&self, id: &str) -> CliResult<TestIntegrationResponse> {
        self.post(&format!("/api/v1/integrations/{}/test", id), &())
            .await
    }

    async fn remove_integration(&self, id: &str) -> CliResult<()> {
        self.delete_no_content(&format!("/api/v1/integrations/{}", id))
            .await
    }

    async fn get_stats(&self) -> CliResult<SystemStats> {
        self.get("/api/v1/admin/stats").await
    }

    async fn flush_cache(&self) -> CliResult<CacheFlushResponse> {
        self.post("/api/v1/admin/cache/flush", &()).await
    }

    async fn get_detailed_health(&self) -> CliResult<DetailedHealthResponse> {
        self.get("/api/v1/admin/health").await
    }

    async fn get_version(&self) -> CliResult<VersionInfo> {
        self.get("/api/v1/admin/version").await
    }
}
