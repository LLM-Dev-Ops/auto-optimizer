//! Anthropic Claude API type definitions
//!
//! This module provides comprehensive type definitions for the Claude API.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Anthropic API configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnthropicConfig {
    /// API key for authentication
    pub api_key: String,
    /// API base URL
    #[serde(default = "default_base_url")]
    pub base_url: String,
    /// Request timeout in seconds
    #[serde(default = "default_timeout")]
    pub timeout_secs: u64,
    /// Maximum retry attempts
    #[serde(default = "default_max_retries")]
    pub max_retries: u32,
    /// Rate limit: requests per minute (tier-specific)
    #[serde(default = "default_rate_limit")]
    pub rate_limit_per_minute: u32,
    /// API version
    #[serde(default = "default_api_version")]
    pub api_version: String,
}

fn default_base_url() -> String {
    "https://api.anthropic.com".to_string()
}

fn default_timeout() -> u64 {
    60
}

fn default_max_retries() -> u32 {
    3
}

fn default_rate_limit() -> u32 {
    50
}

fn default_api_version() -> String {
    "2023-06-01".to_string()
}

/// Claude model identifiers
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ClaudeModel {
    /// Claude 3.5 Sonnet (latest)
    #[serde(rename = "claude-3-5-sonnet-20241022")]
    Claude35Sonnet,
    /// Claude 3 Opus
    #[serde(rename = "claude-3-opus-20240229")]
    Claude3Opus,
    /// Claude 3 Sonnet
    #[serde(rename = "claude-3-sonnet-20240229")]
    Claude3Sonnet,
    /// Claude 3 Haiku
    #[serde(rename = "claude-3-haiku-20240307")]
    Claude3Haiku,
}

impl ClaudeModel {
    /// Get the model identifier string
    pub fn as_str(&self) -> &'static str {
        match self {
            ClaudeModel::Claude35Sonnet => "claude-3-5-sonnet-20241022",
            ClaudeModel::Claude3Opus => "claude-3-opus-20240229",
            ClaudeModel::Claude3Sonnet => "claude-3-sonnet-20240229",
            ClaudeModel::Claude3Haiku => "claude-3-haiku-20240307",
        }
    }

    /// Get maximum tokens for the model
    pub fn max_tokens(&self) -> u32 {
        match self {
            ClaudeModel::Claude35Sonnet => 200_000,
            ClaudeModel::Claude3Opus => 200_000,
            ClaudeModel::Claude3Sonnet => 200_000,
            ClaudeModel::Claude3Haiku => 200_000,
        }
    }

    /// Get input token cost per million tokens (in USD)
    pub fn input_cost_per_mtok(&self) -> f64 {
        match self {
            ClaudeModel::Claude35Sonnet => 3.0,
            ClaudeModel::Claude3Opus => 15.0,
            ClaudeModel::Claude3Sonnet => 3.0,
            ClaudeModel::Claude3Haiku => 0.25,
        }
    }

    /// Get output token cost per million tokens (in USD)
    pub fn output_cost_per_mtok(&self) -> f64 {
        match self {
            ClaudeModel::Claude35Sonnet => 15.0,
            ClaudeModel::Claude3Opus => 75.0,
            ClaudeModel::Claude3Sonnet => 15.0,
            ClaudeModel::Claude3Haiku => 1.25,
        }
    }
}

/// Message request to Claude API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageRequest {
    /// Model to use
    pub model: String,
    /// List of messages in the conversation
    pub messages: Vec<Message>,
    /// Maximum tokens to generate
    pub max_tokens: u32,
    /// Optional system prompt
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system: Option<String>,
    /// Optional temperature (0.0 - 1.0)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    /// Optional top-p sampling
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
    /// Optional top-k sampling
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_k: Option<u32>,
    /// Optional stop sequences
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop_sequences: Option<Vec<String>>,
    /// Enable streaming
    #[serde(default)]
    pub stream: bool,
    /// Optional metadata
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<MessageMetadata>,
}

/// Message in a conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    /// Role of the message sender
    pub role: Role,
    /// Content of the message
    pub content: MessageContent,
}

/// Message role
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    /// User message
    User,
    /// Assistant message
    Assistant,
}

/// Message content (can be text or multi-modal)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum MessageContent {
    /// Simple text content
    Text(String),
    /// Multi-part content (text, images, etc.)
    Parts(Vec<ContentBlock>),
}

/// Content block (text or image)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ContentBlock {
    /// Text content
    #[serde(rename = "text")]
    Text { text: String },
    /// Image content
    #[serde(rename = "image")]
    Image {
        source: ImageSource,
    },
}

/// Image source
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ImageSource {
    /// Base64-encoded image
    #[serde(rename = "base64")]
    Base64 {
        media_type: String,
        data: String,
    },
    /// Image URL (not supported in all contexts)
    #[serde(rename = "url")]
    Url {
        url: String,
    },
}

/// Message metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageMetadata {
    /// User ID for tracking
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    /// Custom metadata fields
    #[serde(flatten)]
    pub custom: HashMap<String, serde_json::Value>,
}

/// Response from Claude API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageResponse {
    /// Unique identifier for the response
    pub id: String,
    /// Object type (always "message")
    #[serde(rename = "type")]
    pub type_field: String,
    /// Role (always "assistant")
    pub role: Role,
    /// Response content
    pub content: Vec<ContentBlock>,
    /// Model used
    pub model: String,
    /// Stop reason
    pub stop_reason: Option<StopReason>,
    /// Stop sequence that was matched
    pub stop_sequence: Option<String>,
    /// Token usage statistics
    pub usage: Usage,
}

/// Reason why generation stopped
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StopReason {
    /// Reached natural end of message
    EndTurn,
    /// Hit max_tokens limit
    MaxTokens,
    /// Matched a stop sequence
    StopSequence,
}

/// Token usage statistics
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Usage {
    /// Number of input tokens
    pub input_tokens: u32,
    /// Number of output tokens
    pub output_tokens: u32,
}

impl Usage {
    /// Calculate total cost in USD
    pub fn calculate_cost(&self, model: ClaudeModel) -> f64 {
        let input_cost = (self.input_tokens as f64 / 1_000_000.0) * model.input_cost_per_mtok();
        let output_cost = (self.output_tokens as f64 / 1_000_000.0) * model.output_cost_per_mtok();
        input_cost + output_cost
    }

    /// Total tokens used
    pub fn total_tokens(&self) -> u32 {
        self.input_tokens + self.output_tokens
    }
}

/// Streaming event from Claude API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum StreamEvent {
    /// Message start event
    #[serde(rename = "message_start")]
    MessageStart {
        message: MessageStart,
    },
    /// Content block start
    #[serde(rename = "content_block_start")]
    ContentBlockStart {
        index: usize,
        content_block: ContentBlockStart,
    },
    /// Ping event (keep-alive)
    #[serde(rename = "ping")]
    Ping,
    /// Content block delta (incremental content)
    #[serde(rename = "content_block_delta")]
    ContentBlockDelta {
        index: usize,
        delta: Delta,
    },
    /// Content block stop
    #[serde(rename = "content_block_stop")]
    ContentBlockStop {
        index: usize,
    },
    /// Message delta (final statistics)
    #[serde(rename = "message_delta")]
    MessageDelta {
        delta: MessageDeltaData,
        usage: Usage,
    },
    /// Message stop
    #[serde(rename = "message_stop")]
    MessageStop,
    /// Error event
    #[serde(rename = "error")]
    Error {
        error: ApiError,
    },
}

/// Message start data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageStart {
    pub id: String,
    #[serde(rename = "type")]
    pub type_field: String,
    pub role: Role,
    pub content: Vec<ContentBlock>,
    pub model: String,
    pub usage: Usage,
}

/// Content block start
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ContentBlockStart {
    #[serde(rename = "text")]
    Text {
        text: String,
    },
}

/// Delta (incremental content)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Delta {
    #[serde(rename = "text_delta")]
    TextDelta {
        text: String,
    },
}

/// Message delta data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageDeltaData {
    pub stop_reason: Option<StopReason>,
    pub stop_sequence: Option<String>,
}

/// API error response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiError {
    #[serde(rename = "type")]
    pub error_type: String,
    pub message: String,
}

/// Rate limit information
#[derive(Debug, Clone)]
pub struct RateLimitInfo {
    /// Requests remaining in current window
    pub requests_remaining: Option<u32>,
    /// Request limit per window
    pub requests_limit: Option<u32>,
    /// Tokens remaining in current window
    pub tokens_remaining: Option<u32>,
    /// Token limit per window
    pub tokens_limit: Option<u32>,
    /// Time when rate limit resets (Unix timestamp)
    pub reset_at: Option<i64>,
}

/// Cost tracking information
#[derive(Debug, Clone, Default)]
pub struct CostTracker {
    /// Total input tokens used
    pub total_input_tokens: u64,
    /// Total output tokens used
    pub total_output_tokens: u64,
    /// Total cost in USD
    pub total_cost: f64,
    /// Number of requests made
    pub request_count: u64,
}

impl CostTracker {
    /// Create a new cost tracker
    pub fn new() -> Self {
        Self::default()
    }

    /// Record usage from a response
    pub fn record_usage(&mut self, usage: &Usage, model: ClaudeModel) {
        self.total_input_tokens += usage.input_tokens as u64;
        self.total_output_tokens += usage.output_tokens as u64;
        self.total_cost += usage.calculate_cost(model);
        self.request_count += 1;
    }

    /// Get average cost per request
    pub fn avg_cost_per_request(&self) -> f64 {
        if self.request_count == 0 {
            0.0
        } else {
            self.total_cost / self.request_count as f64
        }
    }

    /// Get average tokens per request
    pub fn avg_tokens_per_request(&self) -> f64 {
        if self.request_count == 0 {
            0.0
        } else {
            (self.total_input_tokens + self.total_output_tokens) as f64 / self.request_count as f64
        }
    }

    /// Reset all counters
    pub fn reset(&mut self) {
        self.total_input_tokens = 0;
        self.total_output_tokens = 0;
        self.total_cost = 0.0;
        self.request_count = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_claude_model_costs() {
        let usage = Usage {
            input_tokens: 1000,
            output_tokens: 500,
        };

        let cost_haiku = usage.calculate_cost(ClaudeModel::Claude3Haiku);
        let cost_sonnet = usage.calculate_cost(ClaudeModel::Claude35Sonnet);
        let cost_opus = usage.calculate_cost(ClaudeModel::Claude3Opus);

        // Haiku should be cheapest
        assert!(cost_haiku < cost_sonnet);
        assert!(cost_haiku < cost_opus);

        // Opus should be most expensive
        assert!(cost_opus > cost_sonnet);
    }

    #[test]
    fn test_cost_tracker() {
        let mut tracker = CostTracker::new();

        let usage = Usage {
            input_tokens: 1000,
            output_tokens: 500,
        };

        tracker.record_usage(&usage, ClaudeModel::Claude3Haiku);
        tracker.record_usage(&usage, ClaudeModel::Claude3Haiku);

        assert_eq!(tracker.request_count, 2);
        assert_eq!(tracker.total_input_tokens, 2000);
        assert_eq!(tracker.total_output_tokens, 1000);
        assert!(tracker.total_cost > 0.0);

        let avg = tracker.avg_cost_per_request();
        assert!(avg > 0.0);

        tracker.reset();
        assert_eq!(tracker.request_count, 0);
        assert_eq!(tracker.total_cost, 0.0);
    }
}
