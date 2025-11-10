//! Comprehensive tests for Anthropic integration
//!
//! Tests cover client creation, message handling, streaming, and token utilities.

use integrations::anthropic::*;

#[cfg(test)]
mod config_tests {
    use super::*;

    #[test]
    fn test_config_defaults() {
        let config_json = r#"{
            "api_key": "test-key"
        }"#;

        let config: AnthropicConfig = serde_json::from_str(config_json).unwrap();

        assert_eq!(config.api_key, "test-key");
        assert_eq!(config.base_url, "https://api.anthropic.com");
        assert_eq!(config.timeout_secs, 60);
        assert_eq!(config.max_retries, 3);
        assert_eq!(config.rate_limit_per_minute, 50);
        assert_eq!(config.api_version, "2023-06-01");
    }

    #[test]
    fn test_config_custom_values() {
        let config = AnthropicConfig {
            api_key: "custom-key".to_string(),
            base_url: "https://custom.api.com".to_string(),
            timeout_secs: 120,
            max_retries: 5,
            rate_limit_per_minute: 100,
            api_version: "2024-01-01".to_string(),
        };

        assert_eq!(config.timeout_secs, 120);
        assert_eq!(config.max_retries, 5);
    }
}

#[cfg(test)]
mod model_tests {
    use super::*;

    #[test]
    fn test_model_identifiers() {
        assert_eq!(ClaudeModel::Claude35Sonnet.as_str(), "claude-3-5-sonnet-20241022");
        assert_eq!(ClaudeModel::Claude3Opus.as_str(), "claude-3-opus-20240229");
        assert_eq!(ClaudeModel::Claude3Sonnet.as_str(), "claude-3-sonnet-20240229");
        assert_eq!(ClaudeModel::Claude3Haiku.as_str(), "claude-3-haiku-20240307");
    }

    #[test]
    fn test_model_max_tokens() {
        assert_eq!(ClaudeModel::Claude35Sonnet.max_tokens(), 200_000);
        assert_eq!(ClaudeModel::Claude3Opus.max_tokens(), 200_000);
        assert_eq!(ClaudeModel::Claude3Sonnet.max_tokens(), 200_000);
        assert_eq!(ClaudeModel::Claude3Haiku.max_tokens(), 200_000);
    }

    #[test]
    fn test_model_costs() {
        // Haiku should be cheapest
        assert!(ClaudeModel::Claude3Haiku.input_cost_per_mtok() < ClaudeModel::Claude3Sonnet.input_cost_per_mtok());
        assert!(ClaudeModel::Claude3Haiku.output_cost_per_mtok() < ClaudeModel::Claude3Sonnet.output_cost_per_mtok());

        // Opus should be most expensive
        assert!(ClaudeModel::Claude3Opus.input_cost_per_mtok() > ClaudeModel::Claude35Sonnet.input_cost_per_mtok());
        assert!(ClaudeModel::Claude3Opus.output_cost_per_mtok() > ClaudeModel::Claude35Sonnet.output_cost_per_mtok());
    }
}

#[cfg(test)]
mod usage_tests {
    use super::*;

    #[test]
    fn test_usage_calculation() {
        let usage = Usage {
            input_tokens: 1000,
            output_tokens: 500,
        };

        assert_eq!(usage.total_tokens(), 1500);

        let cost_haiku = usage.calculate_cost(ClaudeModel::Claude3Haiku);
        let cost_opus = usage.calculate_cost(ClaudeModel::Claude3Opus);

        assert!(cost_haiku > 0.0);
        assert!(cost_opus > cost_haiku);
    }

    #[test]
    fn test_usage_zero_tokens() {
        let usage = Usage {
            input_tokens: 0,
            output_tokens: 0,
        };

        assert_eq!(usage.total_tokens(), 0);
        assert_eq!(usage.calculate_cost(ClaudeModel::Claude3Haiku), 0.0);
    }
}

#[cfg(test)]
mod cost_tracker_tests {
    use super::*;

    #[test]
    fn test_cost_tracker_recording() {
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
    }

    #[test]
    fn test_cost_tracker_averages() {
        let mut tracker = CostTracker::new();

        let usage = Usage {
            input_tokens: 1000,
            output_tokens: 500,
        };

        tracker.record_usage(&usage, ClaudeModel::Claude3Haiku);
        tracker.record_usage(&usage, ClaudeModel::Claude3Haiku);

        let avg_cost = tracker.avg_cost_per_request();
        let avg_tokens = tracker.avg_tokens_per_request();

        assert!(avg_cost > 0.0);
        assert_eq!(avg_tokens, 1500.0);
    }

    #[test]
    fn test_cost_tracker_reset() {
        let mut tracker = CostTracker::new();

        let usage = Usage {
            input_tokens: 1000,
            output_tokens: 500,
        };

        tracker.record_usage(&usage, ClaudeModel::Claude3Haiku);

        assert_eq!(tracker.request_count, 1);

        tracker.reset();

        assert_eq!(tracker.request_count, 0);
        assert_eq!(tracker.total_input_tokens, 0);
        assert_eq!(tracker.total_output_tokens, 0);
        assert_eq!(tracker.total_cost, 0.0);
    }

    #[test]
    fn test_cost_tracker_empty() {
        let tracker = CostTracker::new();

        assert_eq!(tracker.avg_cost_per_request(), 0.0);
        assert_eq!(tracker.avg_tokens_per_request(), 0.0);
    }
}

#[cfg(test)]
mod client_tests {
    use super::*;

    fn test_config() -> AnthropicConfig {
        AnthropicConfig {
            api_key: "test-key".to_string(),
            base_url: "https://api.anthropic.com".to_string(),
            timeout_secs: 60,
            max_retries: 3,
            rate_limit_per_minute: 50,
            api_version: "2023-06-01".to_string(),
        }
    }

    #[tokio::test]
    async fn test_client_creation() {
        let config = test_config();
        let client = AnthropicClient::new(config).await;
        assert!(client.is_ok());
    }

    #[tokio::test]
    async fn test_client_invalid_rate_limit() {
        let mut config = test_config();
        config.rate_limit_per_minute = 0;

        let client = AnthropicClient::new(config).await;
        assert!(client.is_err());
    }

    #[tokio::test]
    async fn test_token_counting() {
        let config = test_config();
        let client = AnthropicClient::new(config).await.unwrap();

        let text = "Hello, world! This is a test message.";
        let tokens = client.count_tokens(text);

        assert!(tokens > 0);
        assert!(tokens < 100); // Should be reasonable
    }

    #[tokio::test]
    async fn test_request_validation() {
        let config = test_config();
        let client = AnthropicClient::new(config).await.unwrap();

        let valid_request = MessageRequest {
            model: ClaudeModel::Claude3Haiku.as_str().to_string(),
            messages: vec![Message {
                role: Role::User,
                content: MessageContent::Text("Test".to_string()),
            }],
            max_tokens: 100,
            system: None,
            temperature: Some(0.7),
            top_p: None,
            top_k: None,
            stop_sequences: None,
            stream: false,
            metadata: None,
        };

        assert!(client.validate_request(&valid_request).is_ok());

        let invalid_request = MessageRequest {
            model: ClaudeModel::Claude3Haiku.as_str().to_string(),
            messages: vec![],
            max_tokens: 0,
            system: None,
            temperature: None,
            top_p: None,
            top_k: None,
            stop_sequences: None,
            stream: false,
            metadata: None,
        };

        assert!(client.validate_request(&invalid_request).is_err());
    }

    #[tokio::test]
    async fn test_cost_stats() {
        let config = test_config();
        let client = AnthropicClient::new(config).await.unwrap();

        let stats = client.get_cost_stats().await;
        assert_eq!(stats.request_count, 0);
        assert_eq!(stats.total_cost, 0.0);
    }
}

#[cfg(test)]
mod token_counter_tests {
    use super::*;

    #[test]
    fn test_token_counter_basic() {
        let mut counter = TokenCounter::new();

        let text = "Hello, world!";
        let count = counter.count_text(text);

        assert!(count > 0);
        assert!(count < 10);
    }

    #[test]
    fn test_token_counter_caching() {
        let mut counter = TokenCounter::new();

        let text = "Test message for caching";
        let count1 = counter.count_text(text);
        let count2 = counter.count_text(text);

        assert_eq!(count1, count2);
        assert_eq!(counter.cache_size(), 1);
    }

    #[test]
    fn test_token_counter_clear() {
        let mut counter = TokenCounter::new();

        counter.count_text("Test 1");
        counter.count_text("Test 2");

        assert!(counter.cache_size() > 0);

        counter.clear_cache();
        assert_eq!(counter.cache_size(), 0);
    }

    #[test]
    fn test_estimate_cost() {
        let mut counter = TokenCounter::new();

        let request = MessageRequest {
            model: ClaudeModel::Claude3Haiku.as_str().to_string(),
            messages: vec![Message {
                role: Role::User,
                content: MessageContent::Text("Hello!".to_string()),
            }],
            max_tokens: 100,
            system: None,
            temperature: None,
            top_p: None,
            top_k: None,
            stop_sequences: None,
            stream: false,
            metadata: None,
        };

        let cost = counter.estimate_cost(&request, ClaudeModel::Claude3Haiku);
        assert!(cost > 0.0);
    }
}

#[cfg(test)]
mod token_budget_tests {
    use super::*;

    #[test]
    fn test_token_budget_creation() {
        let budget = TokenBudget::new(1000, 100);
        assert!(budget.is_ok());

        let budget = budget.unwrap();
        assert_eq!(budget.max(), 1000);
        assert_eq!(budget.remaining(), 900);
    }

    #[test]
    fn test_token_budget_invalid() {
        let budget = TokenBudget::new(1000, 1000);
        assert!(budget.is_err());

        let budget = TokenBudget::new(1000, 1001);
        assert!(budget.is_err());
    }

    #[test]
    fn test_token_budget_allocation() {
        let mut budget = TokenBudget::new(1000, 100).unwrap();

        assert!(budget.can_allocate(500));
        assert!(budget.allocate(500).is_ok());
        assert_eq!(budget.used(), 500);
        assert_eq!(budget.remaining(), 400);

        assert!(!budget.can_allocate(500));
        assert!(budget.allocate(500).is_err());
    }

    #[test]
    fn test_token_budget_utilization() {
        let mut budget = TokenBudget::new(1000, 100).unwrap();

        budget.allocate(450).unwrap();

        let utilization = budget.utilization();
        assert!(utilization > 49.0 && utilization < 51.0); // ~50%
    }

    #[test]
    fn test_token_budget_reset() {
        let mut budget = TokenBudget::new(1000, 100).unwrap();

        budget.allocate(500).unwrap();
        assert_eq!(budget.used(), 500);

        budget.reset();
        assert_eq!(budget.used(), 0);
        assert_eq!(budget.remaining(), 900);
    }
}

#[cfg(test)]
mod streaming_tests {
    use super::*;

    #[test]
    fn test_stream_collector_creation() {
        let collector = StreamCollector::new();

        assert_eq!(collector.text, "");
        assert_eq!(collector.message_id, None);
        assert_eq!(collector.usage.input_tokens, 0);
    }

    #[test]
    fn test_stream_collector_message_start() {
        let mut collector = StreamCollector::new();

        let event = StreamEvent::MessageStart {
            message: MessageStart {
                id: "msg_123".to_string(),
                type_field: "message".to_string(),
                role: Role::Assistant,
                content: vec![],
                model: "claude-3-haiku-20240307".to_string(),
                usage: Usage {
                    input_tokens: 10,
                    output_tokens: 0,
                },
            },
        };

        let is_final = collector.process_event(event);

        assert!(!is_final);
        assert_eq!(collector.message_id, Some("msg_123".to_string()));
        assert_eq!(collector.usage.input_tokens, 10);
    }

    #[test]
    fn test_stream_collector_text_delta() {
        let mut collector = StreamCollector::new();

        let event1 = StreamEvent::ContentBlockDelta {
            index: 0,
            delta: Delta::TextDelta {
                text: "Hello".to_string(),
            },
        };

        let event2 = StreamEvent::ContentBlockDelta {
            index: 0,
            delta: Delta::TextDelta {
                text: " world!".to_string(),
            },
        };

        collector.process_event(event1);
        collector.process_event(event2);

        assert_eq!(collector.text, "Hello world!");
    }

    #[test]
    fn test_stream_collector_message_stop() {
        let mut collector = StreamCollector::new();

        let event = StreamEvent::MessageStop;
        let is_final = collector.process_event(event);

        assert!(is_final);
    }

    #[test]
    fn test_stream_collector_to_response() {
        let mut collector = StreamCollector::new();

        collector.message_id = Some("msg_123".to_string());
        collector.model = Some("claude-3-haiku-20240307".to_string());
        collector.text = "Hello, world!".to_string();
        collector.usage = Usage {
            input_tokens: 10,
            output_tokens: 5,
        };
        collector.stop_reason = Some(StopReason::EndTurn);

        let response = collector.to_response();
        assert!(response.is_ok());

        let response = response.unwrap();
        assert_eq!(response.id, "msg_123");
        assert_eq!(response.usage.input_tokens, 10);
        assert_eq!(response.usage.output_tokens, 5);
    }
}

#[cfg(test)]
mod message_tests {
    use super::*;

    #[test]
    fn test_message_request_serialization() {
        let request = MessageRequest {
            model: ClaudeModel::Claude3Haiku.as_str().to_string(),
            messages: vec![Message {
                role: Role::User,
                content: MessageContent::Text("Hello!".to_string()),
            }],
            max_tokens: 100,
            system: Some("You are a helpful assistant.".to_string()),
            temperature: Some(0.7),
            top_p: None,
            top_k: None,
            stop_sequences: None,
            stream: false,
            metadata: None,
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("claude-3-haiku"));
        assert!(json.contains("Hello!"));
    }

    #[test]
    fn test_message_response_deserialization() {
        let json = r#"{
            "id": "msg_123",
            "type": "message",
            "role": "assistant",
            "content": [
                {
                    "type": "text",
                    "text": "Hello!"
                }
            ],
            "model": "claude-3-haiku-20240307",
            "stop_reason": "end_turn",
            "stop_sequence": null,
            "usage": {
                "input_tokens": 10,
                "output_tokens": 5
            }
        }"#;

        let response: MessageResponse = serde_json::from_str(json).unwrap();

        assert_eq!(response.id, "msg_123");
        assert_eq!(response.usage.input_tokens, 10);
        assert_eq!(response.stop_reason, Some(StopReason::EndTurn));
    }
}
