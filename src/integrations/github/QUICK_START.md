# GitHub Integration - Quick Start Guide

## Installation

```bash
cd /workspaces/llm-auto-optimizer/src/integrations/github
npm install
```

## Basic Usage (30 seconds)

```typescript
import { GitHubClient } from './src/integrations/github';

// 1. Create client
const client = new GitHubClient({
  auth: {
    type: 'token',
    config: {
      token: 'ghp_your_token_here',
      scopes: ['repo'],
    },
  },
});

// 2. List repositories
const repos = await client.listRepositories();
console.log(repos.data);

// 3. Create an issue
const issue = await client.createIssue('owner', 'repo', {
  title: 'My Issue',
  body: 'Issue description',
});
```

## Webhook Setup (60 seconds)

```typescript
import { GitHubWebhookProcessor, generateWebhookSecret } from './src/integrations/github';

// 1. Generate secret
const secret = generateWebhookSecret();

// 2. Create processor
const processor = new GitHubWebhookProcessor({ secret });

// 3. Register handlers
processor.on('push', async (payload) => {
  console.log('Push received:', payload.ref);
});

// 4. Process webhook (in Express route)
app.post('/webhook', async (req, res) => {
  const result = await processor.process(req.headers, req.body);
  res.json({ success: result.success });
});
```

## Running Tests

```bash
npm test                 # Run all tests
npm run test:coverage    # With coverage
npm run test:watch       # Watch mode
```

## Key Features

✅ OAuth, PAT, GitHub App auth
✅ AES-256-GCM encryption
✅ Rate limiting (5000/hr)
✅ Exponential backoff
✅ Webhook signature validation
✅ Full TypeScript support

## File Locations

```
/workspaces/llm-auto-optimizer/src/integrations/github/
├── index.ts              # Main export
├── github-client.ts      # API client
├── github-auth.ts        # Authentication
├── github-webhooks.ts    # Webhook processor
├── github-types.ts       # Type definitions
├── tests/github.test.ts  # Test suite (88 tests)
└── examples/             # Usage examples
```

## Documentation

- **README.md** - Complete guide (350 lines)
- **IMPLEMENTATION_SUMMARY.md** - Full technical specs
- **examples/basic-usage.ts** - 7 working examples
- **Inline JSDoc** - All functions documented

## Support

- Issues: https://github.com/globalbusinessadvisors/llm-auto-optimizer/issues
- Tests: 88 comprehensive test cases
- Examples: 7 working code samples

**Status**: Production Ready ✅
