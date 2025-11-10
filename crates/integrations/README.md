# LLM Auto Optimizer - Integrations

Production-ready integrations with external services for the LLM Auto Optimizer project.

## Features

### Jira Integration

Full-featured Jira REST API client with:

- **Authentication**: OAuth 2.0, Basic Auth, and Personal Access Tokens
- **Issue Management**: Full CRUD operations (Create, Read, Update, Delete)
- **Project Management**: List and query projects
- **Board & Sprint Management**: Agile board and sprint operations
- **JQL Queries**: Advanced search with Jira Query Language
- **Webhook Support**: Event-driven integration with signature verification
- **Rate Limiting**: Automatic rate limiting with configurable limits
- **Retry Logic**: Exponential backoff with configurable retry attempts
- **Error Handling**: Comprehensive error types and context

### Anthropic Claude Integration

Full-featured Claude API client with:

- **Authentication**: API key authentication
- **Multiple Models**: Support for Claude 3.5 Sonnet, Opus, Sonnet, and Haiku
- **Message API**: Send and receive messages with system prompts
- **Streaming**: Real-time streaming responses via Server-Sent Events
- **Token Management**: Token counting, validation, and budget tracking
- **Cost Tracking**: Automatic cost calculation and statistics
- **Rate Limiting**: Per-tier rate limiting
- **Retry Logic**: Automatic retries for transient errors
- **Error Handling**: Detailed error responses and context

## Installation

Add to your `Cargo.toml`:

```toml
[dependencies]
integrations = { path = "crates/integrations" }

# Optional: Enable only specific integrations
integrations = { path = "crates/integrations", default-features = false, features = ["jira"] }
```

## Usage

### Jira Client

#### Basic Authentication

```rust
use integrations::jira::{JiraClient, JiraConfig, JiraAuth};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = JiraConfig {
        base_url: "https://your-domain.atlassian.net".to_string(),
        auth: JiraAuth::Basic {
            email: "your-email@example.com".to_string(),
            api_token: "your-api-token".to_string(),
        },
        timeout_secs: 30,
        max_retries: 3,
        rate_limit_per_minute: 100,
    };

    let client = JiraClient::new(config).await?;

    // Get all projects
    let projects = client.get_projects().await?;
    for project in projects {
        println!("{}: {}", project.key, project.name);
    }

    Ok(())
}
```

#### Create an Issue

```rust
use integrations::jira::{CreateIssueRequest, CreateIssueFields, ProjectRef, IssueTypeRef};

let request = CreateIssueRequest {
    fields: CreateIssueFields {
        project: ProjectRef { key: "PROJ".to_string() },
        summary: "New feature request".to_string(),
        description: Some("Detailed description here".to_string()),
        issue_type: IssueTypeRef { name: "Task".to_string() },
        assignee: None,
        priority: None,
        labels: vec!["automation".to_string()],
        components: vec![],
    },
};

let issue = client.create_issue(request).await?;
println!("Created issue: {}", issue.key);
```

#### JQL Search

```rust
use integrations::jira::JqlSearchRequest;

let request = JqlSearchRequest {
    jql: "project = PROJ AND status = Open".to_string(),
    start_at: Some(0),
    max_results: Some(50),
    fields: Some(vec!["summary".to_string(), "status".to_string()]),
};

let results = client.search_issues(request).await?;
println!("Found {} issues", results.total);

for issue in results.issues {
    println!("{}: {}", issue.key, issue.fields.summary);
}
```

#### Webhooks

```rust
use integrations::jira::{WebhookProcessor, WebhookHandler};
use async_trait::async_trait;

struct MyHandler;

#[async_trait]
impl WebhookHandler for MyHandler {
    async fn on_issue_created(&self, event: &WebhookEvent) -> anyhow::Result<()> {
        if let Some(issue) = &event.issue {
            println!("New issue: {} - {}", issue.key, issue.fields.summary);
        }
        Ok(())
    }

    async fn on_issue_updated(&self, event: &WebhookEvent) -> anyhow::Result<()> {
        // Handle update
        Ok(())
    }

    async fn on_issue_deleted(&self, event: &WebhookEvent) -> anyhow::Result<()> {
        // Handle deletion
        Ok(())
    }

    async fn on_other_event(&self, event: &WebhookEvent) -> anyhow::Result<()> {
        // Handle other events
        Ok(())
    }
}

let processor = WebhookProcessor::new(Some("webhook-secret".to_string()));
processor.register_handler(Arc::new(MyHandler)).await;

// Process webhook payload
processor.process_event(payload, Some(signature)).await?;
```

### Anthropic Client

#### Simple Completion

```rust
use integrations::anthropic::{AnthropicClient, AnthropicConfig, ClaudeModel};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = AnthropicConfig {
        api_key: "your-api-key".to_string(),
        base_url: "https://api.anthropic.com".to_string(),
        timeout_secs: 60,
        max_retries: 3,
        rate_limit_per_minute: 50,
        api_version: "2023-06-01".to_string(),
    };

    let client = AnthropicClient::new(config).await?;

    let response = client.complete(
        ClaudeModel::Claude3Haiku,
        "What is the capital of France?",
        100,
    ).await?;

    println!("Response: {}", response);

    // Get cost statistics
    let stats = client.get_cost_stats().await;
    println!("Total cost: ${:.4}", stats.total_cost);
    println!("Requests: {}", stats.request_count);

    Ok(())
}
```

#### Advanced Message with System Prompt

```rust
use integrations::anthropic::{MessageRequest, Message, Role, MessageContent, ClaudeModel};

let request = MessageRequest {
    model: ClaudeModel::Claude35Sonnet.as_str().to_string(),
    messages: vec![
        Message {
            role: Role::User,
            content: MessageContent::Text("Explain quantum computing".to_string()),
        },
    ],
    max_tokens: 500,
    system: Some("You are a physics professor explaining complex topics simply.".to_string()),
    temperature: Some(0.7),
    top_p: None,
    top_k: None,
    stop_sequences: None,
    stream: false,
    metadata: None,
};

let response = client.send_message(request).await?;
```

#### Streaming Responses

```rust
use integrations::anthropic::{StreamHandler, StreamCollector, StreamEvent};
use futures::StreamExt;

let stream_handler = StreamHandler::new(
    config_arc.clone(),
    http_client.clone(),
    cost_tracker.clone(),
);

let mut stream = stream_handler.stream_message(request).await?;
let mut collector = StreamCollector::new();

while let Some(event_result) = stream.next().await {
    let event = event_result?;

    match &event {
        StreamEvent::ContentBlockDelta { delta, .. } => {
            if let Delta::TextDelta { text } = delta {
                print!("{}", text); // Print text as it arrives
            }
        }
        _ => {}
    }

    if collector.process_event(event) {
        break; // Final event received
    }
}

let response = collector.to_response()?;
println!("\n\nFinal usage: {:?}", response.usage);
```

#### Token Management

```rust
use integrations::anthropic::{TokenCounter, TokenBudget};

let mut counter = TokenCounter::new();

// Estimate tokens in text
let text = "Hello, world!";
let tokens = counter.count_text(text);
println!("Estimated tokens: {}", tokens);

// Estimate cost for a request
let cost = counter.estimate_cost(&request, ClaudeModel::Claude3Haiku);
println!("Estimated cost: ${:.6}", cost);

// Manage token budget
let mut budget = TokenBudget::new(200_000, 4096)?;

if budget.can_allocate(1000) {
    budget.allocate(1000)?;
    println!("Remaining budget: {}", budget.remaining());
}
```

## Architecture

### Design Principles

1. **Type Safety**: All API types are strongly typed with Serde support
2. **Error Handling**: Comprehensive error types with context
3. **Async First**: Built on Tokio for high-performance async operations
4. **Observability**: Tracing integration for logging and monitoring
5. **Resilience**: Automatic retries, rate limiting, and error recovery
6. **Testing**: Comprehensive unit and integration tests

### Module Structure

```
integrations/
├── src/
│   ├── jira/
│   │   ├── mod.rs          # Module exports
│   │   ├── types.rs        # Type definitions
│   │   ├── auth.rs         # Authentication manager
│   │   ├── client.rs       # Main API client
│   │   └── webhooks.rs     # Webhook processor
│   ├── anthropic/
│   │   ├── mod.rs          # Module exports
│   │   ├── types.rs        # Type definitions
│   │   ├── client.rs       # Main API client
│   │   ├── streaming.rs    # Streaming support
│   │   └── tokens.rs       # Token utilities
│   └── lib.rs              # Library root
├── tests/
│   ├── jira_tests.rs       # Jira integration tests
│   └── anthropic_tests.rs  # Anthropic integration tests
├── Cargo.toml
└── README.md
```

## Configuration

### Environment Variables

```bash
# Jira
export JIRA_BASE_URL="https://your-domain.atlassian.net"
export JIRA_EMAIL="your-email@example.com"
export JIRA_API_TOKEN="your-api-token"

# Anthropic
export ANTHROPIC_API_KEY="your-api-key"
```

### Configuration Files

See `config.example.yaml` in the project root for configuration file examples.

## Error Handling

All clients return `anyhow::Result<T>` for consistent error handling:

```rust
match client.get_issue("PROJ-123").await {
    Ok(issue) => println!("Issue: {}", issue.fields.summary),
    Err(e) => {
        eprintln!("Error: {}", e);
        // Access error chain
        for cause in e.chain() {
            eprintln!("  Caused by: {}", cause);
        }
    }
}
```

## Rate Limiting

Both clients implement rate limiting to prevent API quota exhaustion:

- **Jira**: Configurable per-minute rate limit (default: 100 requests/minute)
- **Anthropic**: Tier-based rate limiting (default: 50 requests/minute)

Rate limiters use the token bucket algorithm with automatic backoff.

## Testing

Run tests:

```bash
# All tests
cargo test -p integrations

# Specific integration
cargo test -p integrations --features jira
cargo test -p integrations --features anthropic

# With logging
RUST_LOG=debug cargo test -p integrations
```

## Performance

Both integrations are optimized for production use:

- **Async I/O**: Non-blocking operations with Tokio
- **Connection Pooling**: Reusable HTTP connections
- **Response Caching**: Configurable caching for frequently accessed data
- **Batch Operations**: Support for bulk operations where available

## Security

- **API Keys**: Never logged or exposed in error messages
- **TLS**: All connections use HTTPS with certificate validation
- **Webhook Signatures**: HMAC-SHA256 signature verification for webhooks
- **Input Validation**: All inputs validated before API calls

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

## License

Apache 2.0 - See [LICENSE](../../LICENSE) for details.

## Support

- **Documentation**: [docs.rs/integrations](https://docs.rs/integrations)
- **Issues**: [GitHub Issues](https://github.com/llm-devops/llm-auto-optimizer/issues)
- **Discussions**: [GitHub Discussions](https://github.com/llm-devops/llm-auto-optimizer/discussions)
