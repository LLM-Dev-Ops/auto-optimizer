# GitHub Integration Service

Enterprise-grade GitHub API integration for the LLM Auto Optimizer with comprehensive features and production-ready quality.

## Features

### Core Capabilities

- **OAuth Authentication** - Full OAuth 2.0 flow with state validation
- **Token Management** - AES-256-GCM encryption for sensitive tokens
- **GitHub App Support** - JWT-based authentication for GitHub Apps
- **Repository Operations** - Complete CRUD operations for repositories
- **Issue Management** - Create, update, list, and manage issues
- **Pull Request Management** - Full PR lifecycle management
- **Webhook Processing** - Event-driven architecture with signature validation
- **Rate Limiting** - Token bucket algorithm (5000 req/hour default)
- **Retry Logic** - Exponential backoff with configurable retries
- **Comprehensive Logging** - Request/response logging with sensitive data redaction
- **Type Safety** - 100% TypeScript with strict mode enabled

### Security Features

- **Token Encryption** - AES-256-GCM encryption at rest
- **Webhook Signature Validation** - HMAC-SHA256 signature verification
- **Scope Validation** - Automatic OAuth scope checking
- **Timing-Safe Comparisons** - Prevents timing attacks
- **Sensitive Data Redaction** - Automatic redaction in logs

## Installation

```bash
npm install @llm-auto-optimizer/github-integration
```

## Quick Start

### Basic Usage

```typescript
import { GitHubClient } from '@llm-auto-optimizer/github-integration';

// Initialize client with personal access token
const client = new GitHubClient({
  auth: {
    type: 'token',
    config: {
      token: process.env.GITHUB_TOKEN!,
      scopes: ['repo', 'user'],
    },
  },
});

// List repositories
const repos = await client.listRepositories({
  sort: 'updated',
  direction: 'desc',
  per_page: 10,
});

console.log(`Found ${repos.data.length} repositories`);
console.log(`Rate limit remaining: ${repos.rateLimit.remaining}`);
```

### OAuth Authentication

```typescript
import {
  GitHubClient,
  getOAuthAuthorizationUrl,
  exchangeOAuthCode,
  generateStateToken,
} from '@llm-auto-optimizer/github-integration';

// 1. Generate authorization URL
const config = {
  clientId: process.env.GITHUB_CLIENT_ID!,
  clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  callbackUrl: 'https://your-app.com/auth/callback',
  scopes: ['repo', 'user'],
};

const state = generateStateToken();
const authUrl = getOAuthAuthorizationUrl(config, state);

// Redirect user to authUrl
console.log('Authorize at:', authUrl);

// 2. Exchange code for token (in callback handler)
const token = await exchangeOAuthCode(
  config,
  req.query.code,
  req.query.state
);

// 3. Create client with OAuth token
const client = new GitHubClient({
  auth: {
    type: 'oauth',
    config: {
      ...config,
      scopes: token.scope.split(','),
    },
  },
});

// Store token for later use
client.authManager.storeOAuthToken(token);
```

### GitHub App Authentication

```typescript
import { GitHubClient } from '@llm-auto-optimizer/github-integration';

const client = new GitHubClient({
  auth: {
    type: 'app',
    config: {
      appId: process.env.GITHUB_APP_ID!,
      privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
      installationId: process.env.GITHUB_INSTALLATION_ID!,
    },
  },
});
```

## API Reference

### Repository Operations

```typescript
// List repositories
const repos = await client.listRepositories({
  type: 'owner',
  sort: 'updated',
  per_page: 50,
});

// Get a repository
const repo = await client.getRepository('owner', 'repo-name');

// Create a repository
const newRepo = await client.createRepository({
  name: 'new-repo',
  description: 'My new repository',
  private: true,
  auto_init: true,
  gitignore_template: 'Node',
  license_template: 'apache-2.0',
});

// Update a repository
const updated = await client.updateRepository('owner', 'repo-name', {
  description: 'Updated description',
  default_branch: 'main',
});

// Delete a repository
await client.deleteRepository('owner', 'repo-name');
```

### Issue Operations

```typescript
// List issues
const issues = await client.listIssues('owner', 'repo', {
  state: 'open',
  labels: 'bug,urgent',
  sort: 'created',
  direction: 'desc',
});

// Get an issue
const issue = await client.getIssue('owner', 'repo', 123);

// Create an issue
const newIssue = await client.createIssue('owner', 'repo', {
  title: 'Bug: Application crashes on startup',
  body: 'Description of the bug...',
  labels: ['bug', 'urgent'],
  assignees: ['username'],
});

// Update an issue
const updated = await client.updateIssue('owner', 'repo', 123, {
  state: 'closed',
  state_reason: 'completed',
});

// Add a comment
await client.addIssueComment('owner', 'repo', 123, 'Fixed in PR #124');
```

### Pull Request Operations

```typescript
// List pull requests
const prs = await client.listPullRequests('owner', 'repo', {
  state: 'open',
  sort: 'updated',
});

// Get a pull request
const pr = await client.getPullRequest('owner', 'repo', 42);

// Create a pull request
const newPR = await client.createPullRequest('owner', 'repo', {
  title: 'Add new feature',
  body: 'This PR adds...',
  head: 'feature-branch',
  base: 'main',
  draft: false,
});

// Update a pull request
const updated = await client.updatePullRequest('owner', 'repo', 42, {
  title: 'Updated title',
  state: 'open',
});

// Merge a pull request
const result = await client.mergePullRequest('owner', 'repo', 42, {
  merge_method: 'squash',
  commit_title: 'Add new feature (#42)',
  commit_message: 'Detailed description...',
});

console.log(result.data.merged); // true
```

## Webhook Handling

### Basic Webhook Setup

```typescript
import {
  GitHubWebhookProcessor,
  generateWebhookSecret,
} from '@llm-auto-optimizer/github-integration';

// Generate a secure webhook secret
const secret = generateWebhookSecret();
console.log('Webhook Secret:', secret);

// Create webhook processor
const processor = new GitHubWebhookProcessor({ secret });

// Register event handlers
processor.on('push', async (payload, context) => {
  console.log(`Push to ${payload.repository?.full_name}`);
  console.log(`Branch: ${payload.ref}`);
  console.log(`Commits: ${payload.commits.length}`);
});

processor.on('pull_request', async (payload, context) => {
  console.log(`PR ${payload.action}: #${payload.number}`);
  console.log(`Title: ${payload.pull_request.title}`);
});

processor.on('issues', async (payload, context) => {
  console.log(`Issue ${payload.action}: #${payload.issue.number}`);
});

// Global handler for all events
processor.onAny(async (payload, context) => {
  console.log(`Event: ${context.eventType} (${context.deliveryId})`);
});
```

### Express.js Integration

```typescript
import express from 'express';
import { GitHubWebhookProcessor } from '@llm-auto-optimizer/github-integration';

const app = express();
const processor = new GitHubWebhookProcessor({
  secret: process.env.GITHUB_WEBHOOK_SECRET!,
});

// Register handlers
processor.on('push', async (payload) => {
  // Handle push event
});

// Webhook endpoint
app.post(
  '/webhooks/github',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      const result = await processor.process(
        req.headers as Record<string, string>,
        req.body.toString()
      );

      if (result.success) {
        res.status(200).json({ status: 'ok' });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error) {
      console.error('Webhook processing error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

app.listen(3000, () => console.log('Webhook server listening on port 3000'));
```

### Webhook Utilities

```typescript
import {
  isPushToBranch,
  isPullRequestAction,
  extractCommitInfo,
  isCreationEvent,
  isForcePush,
} from '@llm-auto-optimizer/github-integration';

processor.on('push', async (payload) => {
  // Check if push is to main branch
  if (isPushToBranch(payload, 'main')) {
    console.log('Push to main branch detected');

    // Extract commit information
    const info = extractCommitInfo(payload);
    console.log(`${info.count} commits by ${info.authors.join(', ')}`);

    // Check for special events
    if (isCreationEvent(payload)) {
      console.log('New branch/tag created');
    }

    if (isForcePush(payload)) {
      console.log('Force push detected!');
    }
  }
});

processor.on('pull_request', async (payload) => {
  if (isPullRequestAction(payload, 'opened')) {
    console.log('New PR opened');
  }
});
```

## Advanced Configuration

### Token Encryption

```typescript
import {
  GitHubClient,
  generateEncryptionKey,
  encryptToken,
} from '@llm-auto-optimizer/github-integration';

// Generate encryption key (store securely)
const encryptionKey = generateEncryptionKey();

// Encrypt token
const encryptedToken = encryptToken(
  process.env.GITHUB_TOKEN!,
  encryptionKey
);

// Create client with encryption
const client = new GitHubClient({
  auth: {
    type: 'token',
    config: {
      token: encryptedToken,
      scopes: ['repo'],
    },
  },
  enableTokenEncryption: true,
  encryptionKey,
});
```

### Custom Rate Limiting

```typescript
const client = new GitHubClient({
  auth: { /* ... */ },
  rateLimit: {
    maxRequestsPerHour: 4000,
    enableAutoThrottle: true,
    throttleThreshold: 200,
    enableQueueing: true,
    maxQueueSize: 500,
  },
});

// Check rate limit status
const status = client.getRateLimitStatus();
console.log(`Available: ${status.available}, Queued: ${status.queued}`);
```

### Custom Retry Configuration

```typescript
const client = new GitHubClient({
  auth: { /* ... */ },
  retry: {
    maxRetries: 5,
    baseDelay: 2000,
    maxDelay: 60000,
    backoffMultiplier: 2,
    retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  },
});
```

### Logging Configuration

```typescript
const client = new GitHubClient({
  auth: { /* ... */ },
  logging: {
    logRequests: true,
    logResponses: true,
    logErrors: true,
    level: 'debug',
    redactSensitive: true,
  },
});
```

### Scope Validation

```typescript
import { GitHubClient, SCOPE_REQUIREMENTS } from '@llm-auto-optimizer/github-integration';

const client = new GitHubClient({
  auth: {
    type: 'token',
    config: {
      token: process.env.GITHUB_TOKEN!,
      scopes: ['repo', 'user'],
    },
  },
  validateScopes: true, // Enable automatic scope validation
});

// Manually validate scopes
const authManager = client.authManager;
await authManager.validateTokenScopes(SCOPE_REQUIREMENTS.REPO_WRITE);
```

## Error Handling

```typescript
import { GitHubClient } from '@llm-auto-optimizer/github-integration';

const client = new GitHubClient({ /* ... */ });

try {
  const repo = await client.getRepository('owner', 'repo');
} catch (error) {
  if (error.message.includes('404')) {
    console.error('Repository not found');
  } else if (error.message.includes('401')) {
    console.error('Authentication failed');
  } else if (error.message.includes('403')) {
    console.error('Forbidden - check scopes');
  } else if (error.message.includes('429')) {
    console.error('Rate limit exceeded');
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## TypeScript Configuration

The integration is built with strict TypeScript settings:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "target": "ES2020",
    "module": "commonjs",
    "moduleResolution": "node"
  }
}
```

## Performance

- **Rate Limiting**: Token bucket algorithm with 5000 req/hour default
- **Request Queueing**: Automatic queuing when rate limited (configurable)
- **Connection Pooling**: Reuses connections for better performance
- **Retry Logic**: Exponential backoff prevents server overload
- **Caching**: Token caching reduces authentication overhead

## Security Best Practices

1. **Never commit tokens** - Use environment variables
2. **Enable token encryption** - Encrypt tokens at rest
3. **Validate webhook signatures** - Always verify signatures
4. **Use minimal scopes** - Request only necessary permissions
5. **Rotate tokens regularly** - Update tokens periodically
6. **Monitor rate limits** - Track API usage
7. **Enable logging** - Audit all API calls

## License

Apache 2.0

## Support

- Documentation: [GitHub Integration Docs](./docs)
- Issues: [GitHub Issues](https://github.com/globalbusinessadvisors/llm-auto-optimizer/issues)
- Examples: [examples/](./examples)

## Contributing

Contributions are welcome! Please read the [Contributing Guide](../../../CONTRIBUTING.md) first.
