//! Jira REST API integration
//!
//! This module provides a production-ready Jira client with:
//! - OAuth 2.0 and Basic authentication
//! - Full CRUD operations for issues
//! - JQL query support
//! - Project and board management
//! - Webhook event handling
//! - Comprehensive error handling and retry logic
//! - Rate limiting
//!
//! # Examples
//!
//! ```no_run
//! use integrations::jira::{JiraClient, JiraConfig, JiraAuth};
//!
//! #[tokio::main]
//! async fn main() -> anyhow::Result<()> {
//!     let config = JiraConfig {
//!         base_url: "https://your-domain.atlassian.net".to_string(),
//!         auth: JiraAuth::Basic {
//!             email: "your-email@example.com".to_string(),
//!             api_token: "your-api-token".to_string(),
//!         },
//!         timeout_secs: 30,
//!         max_retries: 3,
//!         rate_limit_per_minute: 100,
//!     };
//!
//!     let client = JiraClient::new(config).await?;
//!     let projects = client.get_projects().await?;
//!
//!     for project in projects {
//!         println!("{}: {}", project.key, project.name);
//!     }
//!
//!     Ok(())
//! }
//! ```

pub mod auth;
pub mod client;
pub mod types;
pub mod webhooks;

pub use auth::AuthManager;
pub use client::JiraClient;
pub use types::*;
pub use webhooks::{WebhookHandler, WebhookProcessor};
