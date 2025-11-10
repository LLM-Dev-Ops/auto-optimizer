//! Token counting and utilities for Anthropic Claude API
//!
//! Provides token counting, validation, and cost estimation utilities.

use super::types::{ClaudeModel, MessageContent, MessageRequest, Role};
use anyhow::{anyhow, Result};
use std::collections::HashMap;
use tracing::debug;

/// Token counter for Claude API
pub struct TokenCounter {
    /// Cache for token counts
    cache: HashMap<String, u32>,
}

impl TokenCounter {
    /// Create a new token counter
    pub fn new() -> Self {
        Self {
            cache: HashMap::new(),
        }
    }

    /// Count tokens in text (estimation)
    ///
    /// # Arguments
    ///
    /// * `text` - Text to count tokens for
    ///
    /// # Returns
    ///
    /// Returns estimated token count
    ///
    /// # Note
    ///
    /// This is a rough estimation. For production use, consider using
    /// the official Anthropic token counting API or a proper tokenizer.
    pub fn count_text(&mut self, text: &str) -> u32 {
        // Check cache first
        if let Some(&count) = self.cache.get(text) {
            return count;
        }

        // Simple estimation: ~4 characters per token on average
        // This is a rough approximation; actual tokenization varies
        let char_count = text.chars().count();
        let token_count = ((char_count as f32 / 4.0).ceil() as u32).max(1);

        // Cache the result
        if self.cache.len() < 1000 {
            // Limit cache size
            self.cache.insert(text.to_string(), token_count);
        }

        debug!("Estimated {} tokens for {} characters", token_count, char_count);

        token_count
    }

    /// Count tokens in a message request
    ///
    /// # Arguments
    ///
    /// * `request` - Message request to count tokens for
    ///
    /// # Returns
    ///
    /// Returns estimated total token count (input + max output)
    pub fn count_request(&mut self, request: &MessageRequest) -> u32 {
        let mut total = 0u32;

        // Count system prompt tokens
        if let Some(system) = &request.system {
            total += self.count_text(system);
        }

        // Count message tokens
        for message in &request.messages {
            // Add overhead for message structure (role, etc.)
            total += 4; // Approximate overhead

            match &message.content {
                MessageContent::Text(text) => {
                    total += self.count_text(text);
                }
                MessageContent::Parts(parts) => {
                    for part in parts {
                        match part {
                            super::types::ContentBlock::Text { text } => {
                                total += self.count_text(text);
                            }
                            super::types::ContentBlock::Image { .. } => {
                                // Images are roughly 1000-2000 tokens depending on size
                                total += 1500;
                            }
                        }
                    }
                }
            }
        }

        // Add expected output tokens
        total += request.max_tokens;

        total
    }

    /// Estimate cost for a request
    ///
    /// # Arguments
    ///
    /// * `request` - Message request
    /// * `model` - Claude model to use
    ///
    /// # Returns
    ///
    /// Returns estimated cost in USD
    pub fn estimate_cost(
        &mut self,
        request: &MessageRequest,
        model: ClaudeModel,
    ) -> f64 {
        let mut input_tokens = 0u32;

        // Count system prompt
        if let Some(system) = &request.system {
            input_tokens += self.count_text(system);
        }

        // Count messages
        for message in &request.messages {
            input_tokens += 4; // Overhead

            match &message.content {
                MessageContent::Text(text) => {
                    input_tokens += self.count_text(text);
                }
                MessageContent::Parts(parts) => {
                    for part in parts {
                        match part {
                            super::types::ContentBlock::Text { text } => {
                                input_tokens += self.count_text(text);
                            }
                            super::types::ContentBlock::Image { .. } => {
                                input_tokens += 1500;
                            }
                        }
                    }
                }
            }
        }

        let output_tokens = request.max_tokens;

        let input_cost = (input_tokens as f64 / 1_000_000.0) * model.input_cost_per_mtok();
        let output_cost = (output_tokens as f64 / 1_000_000.0) * model.output_cost_per_mtok();

        input_cost + output_cost
    }

    /// Clear the cache
    pub fn clear_cache(&mut self) {
        self.cache.clear();
    }

    /// Get cache size
    pub fn cache_size(&self) -> usize {
        self.cache.len()
    }
}

impl Default for TokenCounter {
    fn default() -> Self {
        Self::new()
    }
}

/// Token budget manager
///
/// Helps manage token budgets for conversations and prevents exceeding limits.
pub struct TokenBudget {
    /// Maximum tokens allowed
    max_tokens: u32,
    /// Current token usage
    used_tokens: u32,
    /// Reserved tokens for output
    output_reserve: u32,
}

impl TokenBudget {
    /// Create a new token budget
    ///
    /// # Arguments
    ///
    /// * `max_tokens` - Maximum tokens allowed (model context window)
    /// * `output_reserve` - Tokens to reserve for output
    pub fn new(max_tokens: u32, output_reserve: u32) -> Result<Self> {
        if output_reserve >= max_tokens {
            return Err(anyhow!(
                "Output reserve {} must be less than max tokens {}",
                output_reserve,
                max_tokens
            ));
        }

        Ok(Self {
            max_tokens,
            used_tokens: 0,
            output_reserve,
        })
    }

    /// Check if tokens can be allocated
    ///
    /// # Arguments
    ///
    /// * `tokens` - Number of tokens to allocate
    ///
    /// # Returns
    ///
    /// Returns true if allocation is possible
    pub fn can_allocate(&self, tokens: u32) -> bool {
        self.used_tokens + tokens + self.output_reserve <= self.max_tokens
    }

    /// Allocate tokens
    ///
    /// # Arguments
    ///
    /// * `tokens` - Number of tokens to allocate
    ///
    /// # Returns
    ///
    /// Returns Ok(()) if successful, Err if budget exceeded
    pub fn allocate(&mut self, tokens: u32) -> Result<()> {
        if !self.can_allocate(tokens) {
            return Err(anyhow!(
                "Token budget exceeded: {} + {} > {} - {}",
                self.used_tokens,
                tokens,
                self.max_tokens,
                self.output_reserve
            ));
        }

        self.used_tokens += tokens;
        debug!(
            "Allocated {} tokens. Used: {}/{}",
            tokens,
            self.used_tokens,
            self.max_tokens - self.output_reserve
        );

        Ok(())
    }

    /// Get remaining tokens available for input
    pub fn remaining(&self) -> u32 {
        self.max_tokens
            .saturating_sub(self.used_tokens)
            .saturating_sub(self.output_reserve)
    }

    /// Get total used tokens
    pub fn used(&self) -> u32 {
        self.used_tokens
    }

    /// Get maximum tokens
    pub fn max(&self) -> u32 {
        self.max_tokens
    }

    /// Get utilization percentage
    pub fn utilization(&self) -> f32 {
        (self.used_tokens as f32 / (self.max_tokens - self.output_reserve) as f32) * 100.0
    }

    /// Reset the budget
    pub fn reset(&mut self) {
        self.used_tokens = 0;
    }
}

/// Validate a message request against model limits
///
/// # Arguments
///
/// * `request` - Message request to validate
/// * `model` - Claude model
///
/// # Returns
///
/// Returns Ok(()) if valid, Err with details if invalid
pub fn validate_request(request: &MessageRequest, model: ClaudeModel) -> Result<()> {
    // Validate max_tokens
    if request.max_tokens == 0 {
        return Err(anyhow!("max_tokens must be greater than 0"));
    }

    if request.max_tokens > model.max_tokens() {
        return Err(anyhow!(
            "max_tokens {} exceeds model limit {}",
            request.max_tokens,
            model.max_tokens()
        ));
    }

    // Validate messages
    if request.messages.is_empty() {
        return Err(anyhow!("messages cannot be empty"));
    }

    // Validate message roles
    for (i, message) in request.messages.iter().enumerate() {
        if i == 0 && message.role != Role::User {
            return Err(anyhow!("First message must be from user"));
        }
    }

    // Validate parameters
    if let Some(temp) = request.temperature {
        if !(0.0..=1.0).contains(&temp) {
            return Err(anyhow!("temperature must be between 0.0 and 1.0"));
        }
    }

    if let Some(top_p) = request.top_p {
        if !(0.0..=1.0).contains(&top_p) {
            return Err(anyhow!("top_p must be between 0.0 and 1.0"));
        }
    }

    if let Some(top_k) = request.top_k {
        if top_k == 0 {
            return Err(anyhow!("top_k must be greater than 0"));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_token_counter() {
        let mut counter = TokenCounter::new();

        let text = "Hello, world!";
        let count1 = counter.count_text(text);
        assert!(count1 > 0);

        // Test caching
        let count2 = counter.count_text(text);
        assert_eq!(count1, count2);
        assert_eq!(counter.cache_size(), 1);

        counter.clear_cache();
        assert_eq!(counter.cache_size(), 0);
    }

    #[test]
    fn test_token_budget() {
        let mut budget = TokenBudget::new(1000, 100).unwrap();

        assert_eq!(budget.remaining(), 900);
        assert!(budget.can_allocate(500));

        budget.allocate(500).unwrap();
        assert_eq!(budget.used(), 500);
        assert_eq!(budget.remaining(), 400);

        assert!(!budget.can_allocate(500));

        budget.reset();
        assert_eq!(budget.used(), 0);
    }

    #[test]
    fn test_token_budget_exceeded() {
        let mut budget = TokenBudget::new(1000, 100).unwrap();

        let result = budget.allocate(1000);
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_request() {
        use super::super::types::{Message, MessageContent, MessageRequest, Role};

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

        assert!(validate_request(&valid_request, ClaudeModel::Claude3Haiku).is_ok());

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

        assert!(validate_request(&invalid_request, ClaudeModel::Claude3Haiku).is_err());
    }
}
