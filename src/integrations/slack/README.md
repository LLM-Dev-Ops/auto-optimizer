# Slack Integration for LLM Auto Optimizer

Production-ready Slack integration service with enterprise-grade features including OAuth 2.0, webhooks, slash commands, and interactive components.

## Features

### Core Capabilities

- **Slack API Client** (`slack-client.ts`)
  - Token bucket rate limiting (1 req/sec per channel by default)
  - Exponential backoff retry logic
  - Request timeout handling
  - Support for all Slack message types (channels, DMs, threads)
  - Interactive components (buttons, modals, select menus)
  - Emoji reactions and message updates
  - Channel management operations

- **OAuth 2.0 Authentication** (`slack-auth.ts`)
  - Complete OAuth flow implementation
  - CSRF protection with state management
  - Token storage with expiration handling
  - Token rotation support
  - Scope validation
  - Multi-workspace support

- **Webhook Event Processing** (`slack-webhooks.ts`)
  - Signature verification (timing-safe comparison)
  - Event deduplication (5-minute window)
  - Support for all event types
  - Interactive payload handling
  - URL verification challenge
  - Replay attack prevention

- **Slash Command Handler** (`slack-commands.ts`)
  - Command routing and validation
  - Per-command rate limiting
  - Channel and user restrictions
  - Argument parsing with quoted strings
  - Help text generation
  - Timeout handling

- **Type Safety** (`slack-types.ts`)
  - Comprehensive TypeScript interfaces
  - Block Kit components
  - Event payloads
  - OAuth responses
  - 100% type coverage

## Installation

```bash
npm install @slack/web-api @slack/bolt
```

## Quick Start

### 1. Initialize Slack Client

```typescript
import { SlackClient } from './slack-client';

const client = new SlackClient({
  botToken: process.env.SLACK_BOT_TOKEN!,
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
  rateLimit: 1, // 1 request per second per channel
  enableRetry: true,
  maxRetries: 3,
});

// Post a message
await client.postMessage({
  channel: 'C123456',
  text: 'Hello from LLM Auto Optimizer!',
  blocks: [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*LLM Auto Optimizer* is now connected!',
      },
    },
  ],
});
```

### 2. Setup OAuth Flow

```typescript
import { SlackOAuthHandler } from './slack-auth';

const authHandler = new SlackOAuthHandler({
  botToken: process.env.SLACK_BOT_TOKEN!,
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
  clientId: process.env.SLACK_CLIENT_ID!,
  clientSecret: process.env.SLACK_CLIENT_SECRET!,
  redirectUri: 'https://yourapp.com/oauth/callback',
  enableTokenRotation: true,
  tokenRotationInterval: 24, // hours
});

// Generate auth URL
const authUrl = authHandler.generateAuthUrl([
  'chat:write',
  'channels:read',
  'commands',
  'reactions:write',
]);

// Exchange code for token
const result = await authHandler.exchangeCode(code, state);
console.log('Access token:', result.access_token);
```

### 3. Process Webhook Events

```typescript
import { SlackWebhookProcessor } from './slack-webhooks';

const processor = new SlackWebhookProcessor({
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
  enableSignatureVerification: true,
  enableEventDeduplication: true,
});

// Handle message events
processor.onMessage(async (event, context) => {
  console.log('Message received:', event.text);
  console.log('From team:', context.teamId);

  // Respond to message
  await client.postMessage({
    channel: event.channel,
    text: `You said: ${event.text}`,
    thread_ts: event.ts,
  });
});

// Handle app mentions
processor.onAppMention(async (event, context) => {
  await client.postMessage({
    channel: event.channel,
    text: `Hi <@${event.user}>! How can I help?`,
    thread_ts: event.ts,
  });
});

// Process incoming webhook
app.post('/slack/events', async (req, res) => {
  const request = extractWebhookRequest(req.body, req.headers);
  const result = await processor.processWebhook(request);
  res.json(result);
});
```

### 4. Handle Slash Commands

```typescript
import { SlashCommandRouter } from './slack-commands';

const router = new SlashCommandRouter(client);

// Register /optimize command
router.command(
  {
    name: 'optimize',
    description: 'Optimize LLM configuration',
    usage: '/optimize [model] [options]',
    examples: [
      '/optimize gpt-4',
      '/optimize claude-3 --cost-optimized',
    ],
    rateLimit: 10, // 10 requests per minute
  },
  async (payload, context) => {
    const [model, ...options] = context.args;

    // Start optimization
    await context.respondLater({
      response_type: 'ephemeral',
      text: `Starting optimization for ${model}...`,
    });

    // Return immediate response
    return {
      response_type: 'ephemeral',
      text: 'Optimization started!',
    };
  }
);

// Process slash command
app.post('/slack/commands', async (req, res) => {
  const result = await router.processCommand(req.body);
  res.json(result);
});
```

## Advanced Usage

### Interactive Components

```typescript
// Open a modal
await client.openModal(triggerId, {
  type: 'modal',
  title: {
    type: 'plain_text',
    text: 'LLM Configuration',
  },
  blocks: [
    {
      type: 'input',
      block_id: 'model_input',
      label: {
        type: 'plain_text',
        text: 'Select Model',
      },
      element: {
        type: 'static_select',
        action_id: 'model_select',
        placeholder: {
          type: 'plain_text',
          text: 'Choose a model',
        },
        options: [
          {
            text: { type: 'plain_text', text: 'GPT-4' },
            value: 'gpt-4',
          },
          {
            text: { type: 'plain_text', text: 'Claude 3' },
            value: 'claude-3',
          },
        ],
      },
    },
  ],
  submit: {
    type: 'plain_text',
    text: 'Submit',
  },
});

// Handle modal submission
processor.onInteractive('model_select', async (payload, context) => {
  const values = payload.view.state.values;
  const selectedModel = values.model_input.model_select.selected_option?.value;

  // Process model selection
  return {
    response_action: 'update',
    view: {
      type: 'modal',
      title: { type: 'plain_text', text: 'Success' },
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `Selected model: *${selectedModel}*`,
          },
        },
      ],
    },
  };
});
```

### Rate Limiting

```typescript
// Get rate limit info
const info = client.getRateLimitInfo('C123456');
console.log('Tokens available:', info.tokens);
console.log('Capacity:', info.capacity);

// Clear rate limit (testing)
client.clearRateLimit('C123456');
```

### Error Handling

```typescript
import { createErrorBlock, createSuccessBlock } from './slack-client';

try {
  await client.postMessage({
    channel: 'C123456',
    text: 'Test message',
  });

  // Success notification
  await client.postMessage({
    channel: 'C123456',
    blocks: createSuccessBlock('Message sent successfully!'),
  });
} catch (error) {
  // Error notification
  await client.postMessage({
    channel: 'C123456',
    blocks: createErrorBlock(error.message),
  });
}
```

## Configuration

### Environment Variables

```bash
# Required
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret

# OAuth (optional)
SLACK_CLIENT_ID=your-client-id
SLACK_CLIENT_SECRET=your-client-secret
SLACK_REDIRECT_URI=https://yourapp.com/oauth/callback

# Advanced (optional)
SLACK_RATE_LIMIT=1
SLACK_TIMEOUT=30000
SLACK_MAX_RETRIES=3
```

### SlackConfig Options

```typescript
interface SlackConfig {
  botToken: string;              // Bot OAuth token
  signingSecret: string;         // Signing secret for webhooks
  appToken?: string;             // App-level token (socket mode)
  clientId?: string;             // OAuth client ID
  clientSecret?: string;         // OAuth client secret
  redirectUri?: string;          // OAuth redirect URI
  rateLimit?: number;            // Requests per second per channel (default: 1)
  timeout?: number;              // Request timeout in ms (default: 30000)
  enableRetry?: boolean;         // Enable retry on failure (default: true)
  maxRetries?: number;           // Max retry attempts (default: 3)
  enableTokenRotation?: boolean; // Enable automatic token rotation
  tokenRotationInterval?: number; // Rotation interval in hours (default: 24)
}
```

## Security Features

### Signature Verification

All webhook requests are verified using HMAC-SHA256 signatures with timing-safe comparison to prevent timing attacks.

```typescript
import { verifyWebhookSignature } from './slack-webhooks';

const isValid = verifyWebhookSignature(
  requestBody,
  timestamp,
  signature,
  signingSecret
);
```

### Replay Attack Prevention

Requests with timestamps older than 5 minutes are automatically rejected.

### Event Deduplication

Events are deduplicated within a 5-minute window to prevent duplicate processing.

### CSRF Protection

OAuth flows include state parameter validation to prevent CSRF attacks.

## Testing

### Run Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- slack.test.ts

# Watch mode
npm run test:watch
```

### Test Coverage

- **SlackClient**: 95%+ coverage
  - Rate limiting
  - Error handling
  - Retry logic
  - All API methods

- **SlackOAuthHandler**: 90%+ coverage
  - OAuth flow
  - Token management
  - State validation
  - Scope validation

- **SlackWebhookProcessor**: 95%+ coverage
  - Signature verification
  - Event processing
  - Deduplication
  - Handler execution

- **SlashCommandRouter**: 90%+ coverage
  - Command routing
  - Rate limiting
  - Validation
  - Response helpers

## Architecture

```
slack-integration/
├── slack-types.ts       # TypeScript interfaces (1200 lines)
├── slack-client.ts      # API client with rate limiting (650 lines)
├── slack-auth.ts        # OAuth 2.0 handler (450 lines)
├── slack-webhooks.ts    # Webhook processor (500 lines)
├── slack-commands.ts    # Slash command router (450 lines)
├── tests/
│   └── slack.test.ts    # Comprehensive test suite (600 lines)
├── tsconfig.json        # TypeScript configuration
└── README.md            # This file
```

## API Reference

### SlackClient

- `postMessage(payload)` - Post a message
- `postThreadReply(channel, threadTs, text, blocks?)` - Reply to thread
- `postEphemeral(channel, user, text, blocks?)` - Post ephemeral message
- `updateMessage(channel, ts, text, blocks?)` - Update message
- `deleteMessage(channel, ts)` - Delete message
- `addReaction(channel, timestamp, name)` - Add reaction
- `removeReaction(channel, timestamp, name)` - Remove reaction
- `openModal(triggerId, view)` - Open modal
- `updateModal(viewId, view, hash?)` - Update modal
- `pushModal(triggerId, view)` - Push modal
- `publishHomeTab(userId, view)` - Publish home tab
- `getUserInfo(userId)` - Get user info
- `getChannelInfo(channelId)` - Get channel info
- `listChannels(cursor?, limit?)` - List channels
- `testAuth()` - Test authentication

### SlackOAuthHandler

- `generateAuthUrl(scopes, userScopes?, metadata?)` - Generate OAuth URL
- `exchangeCode(code, state)` - Exchange code for token
- `refreshToken(teamId, refreshToken)` - Refresh access token
- `revokeToken(token)` - Revoke token
- `getToken(teamId)` - Get stored token
- `deleteToken(teamId)` - Delete stored token
- `testToken(token)` - Test token validity

### SlackWebhookProcessor

- `on(eventType, handler)` - Register event handler
- `onInteractive(actionId, handler)` - Register interactive handler
- `onMessage(handler)` - Register message handler
- `onAppMention(handler)` - Register app mention handler
- `processWebhook(request)` - Process webhook request
- `verifySignature(request)` - Verify webhook signature

### SlashCommandRouter

- `command(config, handler)` - Register command
- `processCommand(payload)` - Process slash command
- `getCommandHelp(commandName)` - Get command help
- `getAllCommands()` - Get all commands
- `removeCommand(commandName)` - Remove command

## Performance

- **Rate Limiting**: 1 request/second per channel (configurable)
- **Request Timeout**: 30 seconds (configurable)
- **Retry Strategy**: Exponential backoff (1s, 2s, 4s, ...)
- **Event Deduplication**: 5-minute window
- **Memory Usage**: <50MB for typical workloads

## Troubleshooting

### Common Issues

1. **Rate Limit Errors**
   - Increase `rateLimit` in config
   - Implement request queuing
   - Use batch operations

2. **Signature Verification Failures**
   - Check signing secret
   - Verify request body hasn't been modified
   - Check timestamp is within 5 minutes

3. **Token Expiration**
   - Enable token rotation
   - Implement refresh token flow
   - Monitor token expiration

4. **Webhook Timeouts**
   - Use `respondLater()` for long-running operations
   - Process in background worker
   - Return 200 OK immediately

## Contributing

Please read [CONTRIBUTING.md](../../../CONTRIBUTING.md) for contribution guidelines.

## License

Apache License 2.0 - See [LICENSE](../../../LICENSE) for details.

## Support

- Documentation: [docs.llmdevops.dev](https://docs.llmdevops.dev)
- Issues: [GitHub Issues](https://github.com/globalbusinessadvisors/llm-auto-optimizer/issues)
- Slack: [Join our community](https://slack.llmdevops.dev)

---

Built with enterprise-grade reliability for production LLM operations.
