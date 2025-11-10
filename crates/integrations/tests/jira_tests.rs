//! Comprehensive tests for Jira integration
//!
//! Tests cover authentication, CRUD operations, JQL queries, and webhooks.

use integrations::jira::*;

#[cfg(test)]
mod auth_tests {
    use super::*;

    #[tokio::test]
    async fn test_basic_auth_manager() {
        let config = JiraConfig {
            base_url: "https://test.atlassian.net".to_string(),
            auth: JiraAuth::Basic {
                email: "test@example.com".to_string(),
                api_token: "test-token-123".to_string(),
            },
            timeout_secs: 30,
            max_retries: 3,
            rate_limit_per_minute: 100,
        };

        let auth_manager = AuthManager::new(config);
        let headers = auth_manager.get_auth_headers().await.unwrap();

        assert!(headers.contains_key("authorization"));
        assert!(headers.contains_key("content-type"));
    }

    #[tokio::test]
    async fn test_oauth2_auth_manager() {
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

        let auth_manager = AuthManager::new(config);
        let headers = auth_manager.get_auth_headers().await.unwrap();

        let auth_header = headers.get("authorization").unwrap().to_str().unwrap();
        assert!(auth_header.starts_with("Bearer "));
    }

    #[tokio::test]
    async fn test_pat_auth_manager() {
        let config = JiraConfig {
            base_url: "https://test.atlassian.net".to_string(),
            auth: JiraAuth::PersonalAccessToken {
                token: "pat-token-123".to_string(),
            },
            timeout_secs: 30,
            max_retries: 3,
            rate_limit_per_minute: 100,
        };

        let auth_manager = AuthManager::new(config);
        let headers = auth_manager.get_auth_headers().await.unwrap();

        assert!(headers.contains_key("authorization"));
    }
}

#[cfg(test)]
mod client_tests {
    use super::*;

    fn test_config() -> JiraConfig {
        JiraConfig {
            base_url: "https://test.atlassian.net".to_string(),
            auth: JiraAuth::Basic {
                email: "test@example.com".to_string(),
                api_token: "test-token".to_string(),
            },
            timeout_secs: 30,
            max_retries: 3,
            rate_limit_per_minute: 100,
        }
    }

    #[tokio::test]
    async fn test_client_creation() {
        let config = test_config();
        let client = JiraClient::new(config).await;
        assert!(client.is_ok());
    }

    #[tokio::test]
    async fn test_client_with_invalid_rate_limit() {
        let mut config = test_config();
        config.rate_limit_per_minute = 0;

        let client = JiraClient::new(config).await;
        assert!(client.is_err());
        assert!(client.unwrap_err().to_string().contains("Rate limit"));
    }

    #[tokio::test]
    async fn test_create_issue_request_serialization() {
        let request = CreateIssueRequest {
            fields: CreateIssueFields {
                project: ProjectRef {
                    key: "TEST".to_string(),
                },
                summary: "Test issue".to_string(),
                description: Some("Test description".to_string()),
                issue_type: IssueTypeRef {
                    name: "Task".to_string(),
                },
                assignee: None,
                priority: Some(PriorityRef {
                    name: "High".to_string(),
                }),
                labels: vec!["test".to_string()],
                components: vec![],
            },
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("TEST"));
        assert!(json.contains("Test issue"));
    }

    #[tokio::test]
    async fn test_jql_search_request() {
        let request = JqlSearchRequest {
            jql: "project = TEST AND status = Open".to_string(),
            start_at: Some(0),
            max_results: Some(50),
            fields: Some(vec!["summary".to_string(), "status".to_string()]),
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("project = TEST"));
    }
}

#[cfg(test)]
mod webhook_tests {
    use super::*;
    use async_trait::async_trait;
    use std::sync::Arc;

    struct TestWebhookHandler {
        called: Arc<tokio::sync::Mutex<bool>>,
    }

    #[async_trait]
    impl WebhookHandler for TestWebhookHandler {
        async fn on_issue_created(&self, _event: &WebhookEvent) -> anyhow::Result<()> {
            let mut called = self.called.lock().await;
            *called = true;
            Ok(())
        }

        async fn on_issue_updated(&self, _event: &WebhookEvent) -> anyhow::Result<()> {
            Ok(())
        }

        async fn on_issue_deleted(&self, _event: &WebhookEvent) -> anyhow::Result<()> {
            Ok(())
        }

        async fn on_other_event(&self, _event: &WebhookEvent) -> anyhow::Result<()> {
            Ok(())
        }
    }

    #[tokio::test]
    async fn test_webhook_processor_creation() {
        let processor = WebhookProcessor::new(Some("secret-key".to_string()));
        assert!(true); // Just test creation succeeds
    }

    #[tokio::test]
    async fn test_webhook_event_validation() {
        let processor = WebhookProcessor::new(None);

        let valid_payload = r#"{
            "webhookEvent": "jira:issue_created",
            "timestamp": 1234567890
        }"#;

        assert!(processor.validate_event(valid_payload).is_ok());

        let invalid_payload = r#"{"invalid": "data"}"#;
        assert!(processor.validate_event(invalid_payload).is_err());
    }

    #[tokio::test]
    async fn test_webhook_handler_registration() {
        let processor = WebhookProcessor::new(None);
        let called = Arc::new(tokio::sync::Mutex::new(false));

        let handler = Arc::new(TestWebhookHandler {
            called: called.clone(),
        });

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

        let was_called = *called.lock().await;
        assert!(was_called);
    }

    #[tokio::test]
    async fn test_webhook_signature_verification() {
        let processor = WebhookProcessor::new(Some("secret".to_string()));

        let payload = r#"{"webhookEvent":"test","timestamp":123}"#;

        // Without signature - should fail
        let result = processor.verify_signature(None, payload.as_bytes());
        assert!(result.is_err());

        // Processor without secret should allow any request
        let processor_no_secret = WebhookProcessor::new(None);
        let result = processor_no_secret.verify_signature(None, payload.as_bytes());
        assert!(result.is_ok());
    }
}

#[cfg(test)]
mod type_tests {
    use super::*;

    #[test]
    fn test_issue_serialization() {
        let issue = Issue {
            id: "10001".to_string(),
            key: "TEST-1".to_string(),
            self_url: "https://test.atlassian.net/rest/api/3/issue/10001".to_string(),
            fields: IssueFields {
                summary: "Test Issue".to_string(),
                description: Some("Test description".to_string()),
                issue_type: IssueType {
                    id: "1".to_string(),
                    name: "Task".to_string(),
                    description: None,
                },
                status: Status {
                    id: "1".to_string(),
                    name: "To Do".to_string(),
                    description: None,
                    status_category: StatusCategory {
                        id: 1,
                        key: "new".to_string(),
                        name: "To Do".to_string(),
                        color_name: "blue-gray".to_string(),
                    },
                },
                priority: None,
                assignee: None,
                reporter: None,
                project: Project {
                    id: "10000".to_string(),
                    key: "TEST".to_string(),
                    name: "Test Project".to_string(),
                    description: None,
                    project_type_key: "software".to_string(),
                },
                labels: vec![],
                components: vec![],
                created: "2024-01-01T00:00:00.000+0000".to_string(),
                updated: "2024-01-01T00:00:00.000+0000".to_string(),
                custom_fields: std::collections::HashMap::new(),
            },
        };

        let json = serde_json::to_string(&issue).unwrap();
        let deserialized: Issue = serde_json::from_str(&json).unwrap();

        assert_eq!(issue.key, deserialized.key);
        assert_eq!(issue.fields.summary, deserialized.fields.summary);
    }

    #[test]
    fn test_config_defaults() {
        let config_json = r#"{
            "base_url": "https://test.atlassian.net",
            "auth": {
                "type": "Basic",
                "email": "test@example.com",
                "api_token": "token"
            }
        }"#;

        let config: JiraConfig = serde_json::from_str(config_json).unwrap();

        assert_eq!(config.timeout_secs, 30);
        assert_eq!(config.max_retries, 3);
        assert_eq!(config.rate_limit_per_minute, 100);
    }
}
