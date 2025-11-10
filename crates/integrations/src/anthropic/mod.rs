//! Anthropic Claude API integration
//!
//! This module provides a production-ready Claude API client with:
//! - API key authentication
//! - Message/completion endpoints
//! - Streaming support via Server-Sent Events
//! - Token counting and validation
//! - Cost tracking and estimation
//! - Rate limiting
//! - Comprehensive error handling and retry logic
//!
//! # Examples
//!
//! ## Simple completion
//!
//! ```no_run
//! use integrations::anthropic::{AnthropicClient, AnthropicConfig, ClaudeModel};
//!
//! #[tokio::main]
//! async fn main() -> anyhow::Result<()> {
//!     let config = AnthropicConfig {
//!         api_key: "your-api-key".to_string(),
//!         base_url: "https://api.anthropic.com".to_string(),
//!         timeout_secs: 60,
//!         max_retries: 3,
//!         rate_limit_per_minute: 50,
//!         api_version: "2023-06-01".to_string(),
//!     };
//!
//!     let client = AnthropicClient::new(config).await?;
//!
//!     let response = client.complete(
//!         ClaudeModel::Claude3Haiku,
//!         "What is the capital of France?",
//!         100,
//!     ).await?;
//!
//!     println!("Response: {}", response);
//!
//!     // Get cost statistics
//!     let stats = client.get_cost_stats().await;
//!     println!("Total cost: ${:.4}", stats.total_cost);
//!
//!     Ok(())
//! }
//! ```
//!
//! ## Streaming completion
//!
//! ```no_run
//! use integrations::anthropic::{StreamHandler, AnthropicConfig, MessageRequest, Message, Role, MessageContent, ClaudeModel};
//! use futures::StreamExt;
//!
//! #[tokio::main]
//! async fn main() -> anyhow::Result<()> {
//!     // ... setup config and client ...
//!
//!     let request = MessageRequest {
//!         model: ClaudeModel::Claude3Haiku.as_str().to_string(),
//!         messages: vec![Message {
//!             role: Role::User,
//!             content: MessageContent::Text("Tell me a story".to_string()),
//!         }],
//!         max_tokens: 500,
//!         system: None,
//!         temperature: None,
//!         top_p: None,
//!         top_k: None,
//!         stop_sequences: None,
//!         stream: true,
//!         metadata: None,
//!     };
//!
//!     // ... create StreamHandler and stream ...
//!
//!     Ok(())
//! }
//! ```

pub mod client;
pub mod streaming;
pub mod tokens;
pub mod types;

pub use client::AnthropicClient;
pub use streaming::{StreamCollector, StreamHandler};
pub use tokens::{TokenBudget, TokenCounter};
pub use types::*;
