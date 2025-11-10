//! Jira authentication module
//!
//! Handles various authentication methods for Jira API.

use super::types::{JiraAuth, JiraConfig};
use anyhow::{Context, Result};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, warn};

/// Authentication manager for Jira API
#[derive(Debug, Clone)]
pub struct AuthManager {
    config: Arc<RwLock<JiraConfig>>,
}

impl AuthManager {
    /// Create a new authentication manager
    pub fn new(config: JiraConfig) -> Self {
        Self {
            config: Arc::new(RwLock::new(config)),
        }
    }

    /// Get authorization headers for API requests
    ///
    /// # Returns
    ///
    /// Returns a HeaderMap with appropriate authentication headers
    pub async fn get_auth_headers(&self) -> Result<HeaderMap> {
        let config = self.config.read().await;
        let mut headers = HeaderMap::new();

        headers.insert(
            CONTENT_TYPE,
            HeaderValue::from_static("application/json"),
        );

        match &config.auth {
            JiraAuth::Basic { email, api_token } => {
                let credentials = format!("{}:{}", email, api_token);
                let encoded = base64::encode(&credentials);
                let auth_value = format!("Basic {}", encoded);

                headers.insert(
                    AUTHORIZATION,
                    HeaderValue::from_str(&auth_value)
                        .context("Failed to create Basic auth header")?,
                );

                debug!("Using Basic authentication for user: {}", email);
            }
            JiraAuth::OAuth2 { access_token, .. } => {
                let auth_value = format!("Bearer {}", access_token);

                headers.insert(
                    AUTHORIZATION,
                    HeaderValue::from_str(&auth_value)
                        .context("Failed to create OAuth2 auth header")?,
                );

                debug!("Using OAuth2 authentication");
            }
            JiraAuth::PersonalAccessToken { token } => {
                let auth_value = format!("Bearer {}", token);

                headers.insert(
                    AUTHORIZATION,
                    HeaderValue::from_str(&auth_value)
                        .context("Failed to create PAT auth header")?,
                );

                debug!("Using Personal Access Token authentication");
            }
        }

        Ok(headers)
    }

    /// Refresh OAuth2 token if needed
    ///
    /// # Arguments
    ///
    /// * `client` - HTTP client to use for token refresh
    ///
    /// # Returns
    ///
    /// Returns Ok(true) if token was refreshed, Ok(false) if no refresh was needed
    pub async fn refresh_token_if_needed(
        &self,
        client: &reqwest::Client,
    ) -> Result<bool> {
        let mut config = self.config.write().await;

        if let JiraAuth::OAuth2 {
            client_id,
            client_secret,
            refresh_token: Some(refresh_token),
            ..
        } = &config.auth
        {
            debug!("Attempting to refresh OAuth2 token");

            // OAuth2 token refresh endpoint
            let token_url = format!("{}/rest/oauth2/token", config.base_url);

            let params = [
                ("grant_type", "refresh_token"),
                ("client_id", client_id),
                ("client_secret", client_secret),
                ("refresh_token", refresh_token),
            ];

            let response = client
                .post(&token_url)
                .form(&params)
                .send()
                .await
                .context("Failed to send token refresh request")?;

            if response.status().is_success() {
                #[derive(serde::Deserialize)]
                struct TokenResponse {
                    access_token: String,
                    refresh_token: Option<String>,
                }

                let token_response: TokenResponse = response
                    .json()
                    .await
                    .context("Failed to parse token response")?;

                // Update the stored tokens
                config.auth = JiraAuth::OAuth2 {
                    client_id: client_id.clone(),
                    client_secret: client_secret.clone(),
                    access_token: token_response.access_token,
                    refresh_token: token_response.refresh_token.or_else(|| Some(refresh_token.clone())),
                };

                debug!("Successfully refreshed OAuth2 token");
                Ok(true)
            } else {
                warn!(
                    "Failed to refresh OAuth2 token: {}",
                    response.status()
                );
                Ok(false)
            }
        } else {
            // No OAuth2 or no refresh token
            Ok(false)
        }
    }

    /// Get the base URL
    pub async fn get_base_url(&self) -> String {
        self.config.read().await.base_url.clone()
    }

    /// Get timeout duration
    pub async fn get_timeout(&self) -> std::time::Duration {
        std::time::Duration::from_secs(self.config.read().await.timeout_secs)
    }

    /// Get max retries
    pub async fn get_max_retries(&self) -> u32 {
        self.config.read().await.max_retries
    }

    /// Get rate limit
    pub async fn get_rate_limit(&self) -> u32 {
        self.config.read().await.rate_limit_per_minute
    }
}

// Note: base64 is a placeholder - will be added to Cargo.toml
mod base64 {
    pub fn encode(data: &str) -> String {
        use std::fmt::Write;
        let bytes = data.as_bytes();
        let mut result = String::new();

        const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

        for chunk in bytes.chunks(3) {
            let mut buf = [0u8; 3];
            for (i, &b) in chunk.iter().enumerate() {
                buf[i] = b;
            }

            let b1 = (buf[0] >> 2) as usize;
            let b2 = (((buf[0] & 0x03) << 4) | (buf[1] >> 4)) as usize;
            let b3 = (((buf[1] & 0x0F) << 2) | (buf[2] >> 6)) as usize;
            let b4 = (buf[2] & 0x3F) as usize;

            write!(&mut result, "{}", CHARSET[b1] as char).unwrap();
            write!(&mut result, "{}", CHARSET[b2] as char).unwrap();

            if chunk.len() > 1 {
                write!(&mut result, "{}", CHARSET[b3] as char).unwrap();
            } else {
                result.push('=');
            }

            if chunk.len() > 2 {
                write!(&mut result, "{}", CHARSET[b4] as char).unwrap();
            } else {
                result.push('=');
            }
        }

        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_basic_auth_headers() {
        let config = JiraConfig {
            base_url: "https://test.atlassian.net".to_string(),
            auth: JiraAuth::Basic {
                email: "test@example.com".to_string(),
                api_token: "test-token".to_string(),
            },
            timeout_secs: 30,
            max_retries: 3,
            rate_limit_per_minute: 100,
        };

        let manager = AuthManager::new(config);
        let headers = manager.get_auth_headers().await.unwrap();

        assert!(headers.contains_key(AUTHORIZATION));
        assert!(headers.contains_key(CONTENT_TYPE));
    }

    #[tokio::test]
    async fn test_oauth2_auth_headers() {
        let config = JiraConfig {
            base_url: "https://test.atlassian.net".to_string(),
            auth: JiraAuth::OAuth2 {
                client_id: "client-id".to_string(),
                client_secret: "client-secret".to_string(),
                access_token: "access-token".to_string(),
                refresh_token: Some("refresh-token".to_string()),
            },
            timeout_secs: 30,
            max_retries: 3,
            rate_limit_per_minute: 100,
        };

        let manager = AuthManager::new(config);
        let headers = manager.get_auth_headers().await.unwrap();

        assert!(headers.contains_key(AUTHORIZATION));
        let auth_header = headers.get(AUTHORIZATION).unwrap().to_str().unwrap();
        assert!(auth_header.starts_with("Bearer "));
    }

    #[tokio::test]
    async fn test_pat_auth_headers() {
        let config = JiraConfig {
            base_url: "https://test.atlassian.net".to_string(),
            auth: JiraAuth::PersonalAccessToken {
                token: "pat-token".to_string(),
            },
            timeout_secs: 30,
            max_retries: 3,
            rate_limit_per_minute: 100,
        };

        let manager = AuthManager::new(config);
        let headers = manager.get_auth_headers().await.unwrap();

        assert!(headers.contains_key(AUTHORIZATION));
    }
}
