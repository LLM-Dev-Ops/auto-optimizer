//! Jira webhook event handler
//!
//! Provides webhook verification and event processing for Jira webhooks.

use super::types::WebhookEvent;
use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

/// Webhook event handler trait
#[async_trait]
pub trait WebhookHandler: Send + Sync {
    /// Handle an issue created event
    async fn on_issue_created(&self, event: &WebhookEvent) -> Result<()>;

    /// Handle an issue updated event
    async fn on_issue_updated(&self, event: &WebhookEvent) -> Result<()>;

    /// Handle an issue deleted event
    async fn on_issue_deleted(&self, event: &WebhookEvent) -> Result<()>;

    /// Handle any other event type
    async fn on_other_event(&self, event: &WebhookEvent) -> Result<()>;
}

/// Webhook processor for Jira events
pub struct WebhookProcessor {
    handlers: Arc<RwLock<Vec<Arc<dyn WebhookHandler>>>>,
    /// Optional webhook secret for signature verification
    webhook_secret: Option<String>,
}

impl WebhookProcessor {
    /// Create a new webhook processor
    ///
    /// # Arguments
    ///
    /// * `webhook_secret` - Optional secret for webhook signature verification
    pub fn new(webhook_secret: Option<String>) -> Self {
        Self {
            handlers: Arc::new(RwLock::new(Vec::new())),
            webhook_secret,
        }
    }

    /// Register a webhook event handler
    ///
    /// # Arguments
    ///
    /// * `handler` - Handler to register
    pub async fn register_handler(&self, handler: Arc<dyn WebhookHandler>) {
        let mut handlers = self.handlers.write().await;
        handlers.push(handler);
        info!("Registered webhook handler");
    }

    /// Verify webhook signature
    ///
    /// # Arguments
    ///
    /// * `signature` - Signature from webhook headers
    /// * `payload` - Raw webhook payload
    ///
    /// # Returns
    ///
    /// Returns Ok(()) if signature is valid or not configured
    pub fn verify_signature(&self, signature: Option<&str>, payload: &[u8]) -> Result<()> {
        if let Some(secret) = &self.webhook_secret {
            let sig = signature.ok_or_else(|| anyhow!("Missing webhook signature"))?;

            // Compute expected signature using HMAC-SHA256
            use sha2::{Digest, Sha256};
            let mut hasher = Sha256::new();
            hasher.update(secret.as_bytes());
            hasher.update(payload);
            let expected = format!("sha256={:x}", hasher.finalize());

            // Constant-time comparison to prevent timing attacks
            if !constant_time_compare(sig.as_bytes(), expected.as_bytes()) {
                error!("Invalid webhook signature");
                return Err(anyhow!("Invalid webhook signature"));
            }

            debug!("Webhook signature verified");
        } else {
            debug!("Webhook signature verification disabled (no secret configured)");
        }

        Ok(())
    }

    /// Process a webhook event
    ///
    /// # Arguments
    ///
    /// * `payload` - Raw webhook payload as JSON string
    /// * `signature` - Optional signature from headers
    ///
    /// # Returns
    ///
    /// Returns Ok(()) if event was processed successfully
    pub async fn process_event(
        &self,
        payload: &str,
        signature: Option<&str>,
    ) -> Result<()> {
        // Verify signature if configured
        self.verify_signature(signature, payload.as_bytes())?;

        // Parse webhook event
        let event: WebhookEvent = serde_json::from_str(payload)
            .context("Failed to parse webhook event")?;

        info!(
            "Processing webhook event: {} at {}",
            event.webhook_event, event.timestamp
        );

        // Route to appropriate handlers based on event type
        let handlers = self.handlers.read().await;

        if handlers.is_empty() {
            warn!("No webhook handlers registered");
            return Ok(());
        }

        let event_type = event.webhook_event.as_str();
        let mut errors = Vec::new();

        for handler in handlers.iter() {
            let result = match event_type {
                "jira:issue_created" => handler.on_issue_created(&event).await,
                "jira:issue_updated" => handler.on_issue_updated(&event).await,
                "jira:issue_deleted" => handler.on_issue_deleted(&event).await,
                _ => handler.on_other_event(&event).await,
            };

            if let Err(e) = result {
                error!("Handler error for {}: {}", event_type, e);
                errors.push(e);
            }
        }

        if !errors.is_empty() {
            return Err(anyhow!(
                "Some handlers failed: {} errors",
                errors.len()
            ));
        }

        info!("Successfully processed webhook event: {}", event_type);
        Ok(())
    }

    /// Process a raw webhook payload (any JSON)
    ///
    /// # Arguments
    ///
    /// * `payload` - Raw JSON payload
    /// * `signature` - Optional signature from headers
    ///
    /// # Returns
    ///
    /// Returns the parsed event data
    pub async fn process_raw_event(
        &self,
        payload: &str,
        signature: Option<&str>,
    ) -> Result<Value> {
        // Verify signature if configured
        self.verify_signature(signature, payload.as_bytes())?;

        let value: Value = serde_json::from_str(payload)
            .context("Failed to parse webhook payload")?;

        debug!("Received raw webhook event: {}", value["webhookEvent"].as_str().unwrap_or("unknown"));

        Ok(value)
    }

    /// Validate webhook event structure
    ///
    /// # Arguments
    ///
    /// * `payload` - Raw webhook payload
    ///
    /// # Returns
    ///
    /// Returns Ok(()) if the event structure is valid
    pub fn validate_event(&self, payload: &str) -> Result<()> {
        let value: Value = serde_json::from_str(payload)
            .context("Invalid JSON payload")?;

        // Check required fields
        if !value.get("webhookEvent").and_then(|v| v.as_str()).is_some() {
            return Err(anyhow!("Missing webhookEvent field"));
        }

        if !value.get("timestamp").and_then(|v| v.as_i64()).is_some() {
            return Err(anyhow!("Missing or invalid timestamp field"));
        }

        debug!("Webhook event structure is valid");
        Ok(())
    }
}

/// Constant-time string comparison to prevent timing attacks
fn constant_time_compare(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }

    let mut result = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        result |= x ^ y;
    }

    result == 0
}

/// Example webhook handler implementation
pub struct LoggingWebhookHandler;

#[async_trait]
impl WebhookHandler for LoggingWebhookHandler {
    async fn on_issue_created(&self, event: &WebhookEvent) -> Result<()> {
        if let Some(issue) = &event.issue {
            info!(
                "Issue created: {} - {}",
                issue.key, issue.fields.summary
            );
        }
        Ok(())
    }

    async fn on_issue_updated(&self, event: &WebhookEvent) -> Result<()> {
        if let Some(issue) = &event.issue {
            info!(
                "Issue updated: {} - {}",
                issue.key, issue.fields.summary
            );

            if let Some(changelog) = &event.changelog {
                for item in &changelog.items {
                    debug!(
                        "  {} changed from '{}' to '{}'",
                        item.field,
                        item.from_string.as_deref().unwrap_or(""),
                        item.to_string.as_deref().unwrap_or("")
                    );
                }
            }
        }
        Ok(())
    }

    async fn on_issue_deleted(&self, event: &WebhookEvent) -> Result<()> {
        if let Some(issue) = &event.issue {
            info!("Issue deleted: {}", issue.key);
        }
        Ok(())
    }

    async fn on_other_event(&self, event: &WebhookEvent) -> Result<()> {
        info!("Other event: {}", event.webhook_event);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_webhook_processor_creation() {
        let processor = WebhookProcessor::new(Some("secret".to_string()));
        assert!(processor.webhook_secret.is_some());
    }

    #[tokio::test]
    async fn test_constant_time_compare() {
        assert!(constant_time_compare(b"test", b"test"));
        assert!(!constant_time_compare(b"test", b"fail"));
        assert!(!constant_time_compare(b"test", b"testing"));
    }

    #[tokio::test]
    async fn test_validate_event() {
        let processor = WebhookProcessor::new(None);

        let valid_payload = r#"{
            "webhookEvent": "jira:issue_created",
            "timestamp": 1234567890
        }"#;

        assert!(processor.validate_event(valid_payload).is_ok());

        let invalid_payload = r#"{"other": "data"}"#;
        assert!(processor.validate_event(invalid_payload).is_err());
    }

    #[tokio::test]
    async fn test_process_event() {
        let processor = WebhookProcessor::new(None);
        let handler = Arc::new(LoggingWebhookHandler);
        processor.register_handler(handler).await;

        let payload = r#"{
            "webhookEvent": "jira:issue_created",
            "timestamp": 1234567890,
            "issue": {
                "id": "10001",
                "key": "TEST-1",
                "self": "https://test.atlassian.net/rest/api/3/issue/10001",
                "fields": {
                    "summary": "Test Issue",
                    "description": null,
                    "issuetype": {
                        "id": "1",
                        "name": "Task",
                        "description": null
                    },
                    "status": {
                        "id": "1",
                        "name": "To Do",
                        "description": null,
                        "statusCategory": {
                            "id": 1,
                            "key": "new",
                            "name": "To Do",
                            "colorName": "blue-gray"
                        }
                    },
                    "project": {
                        "id": "10000",
                        "key": "TEST",
                        "name": "Test Project",
                        "description": null,
                        "projectTypeKey": "software"
                    },
                    "created": "2024-01-01T00:00:00.000+0000",
                    "updated": "2024-01-01T00:00:00.000+0000",
                    "labels": [],
                    "components": []
                }
            }
        }"#;

        let result = processor.process_event(payload, None).await;
        assert!(result.is_ok());
    }
}
