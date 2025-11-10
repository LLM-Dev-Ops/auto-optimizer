/**
 * GitHub Integration - Basic Usage Examples
 *
 * Demonstrates common use cases for the GitHub integration.
 */

import {
  GitHubClient,
  GitHubWebhookProcessor,
  generateWebhookSecret,
  isPushToBranch,
  extractCommitInfo,
} from '../index';

// ============================================================================
// Example 1: Basic Repository Operations
// ============================================================================

async function example1_BasicRepositoryOperations() {
  console.log('\n=== Example 1: Basic Repository Operations ===\n');

  // Initialize client
  const client = new GitHubClient({
    auth: {
      type: 'token',
      config: {
        token: process.env.GITHUB_TOKEN!,
        scopes: ['repo'],
      },
    },
  });

  // List repositories
  const repos = await client.listRepositories({
    type: 'owner',
    sort: 'updated',
    per_page: 5,
  });

  console.log(`Found ${repos.data.length} repositories:`);
  repos.data.forEach((repo) => {
    console.log(`- ${repo.full_name} (⭐ ${repo.stargazers_count})`);
  });

  // Get rate limit info
  console.log(`\nRate limit: ${repos.rateLimit.remaining}/${repos.rateLimit.limit}`);
}

// ============================================================================
// Example 2: Issue Management
// ============================================================================

async function example2_IssueManagement() {
  console.log('\n=== Example 2: Issue Management ===\n');

  const client = new GitHubClient({
    auth: {
      type: 'token',
      config: {
        token: process.env.GITHUB_TOKEN!,
        scopes: ['repo'],
      },
    },
  });

  const owner = 'your-username';
  const repo = 'your-repo';

  // Create an issue
  const issue = await client.createIssue(owner, repo, {
    title: 'Automated issue from GitHub integration',
    body: 'This issue was created programmatically using the GitHub integration.',
    labels: ['automation', 'example'],
  });

  console.log(`Created issue #${issue.data.number}: ${issue.data.title}`);

  // Add a comment
  await client.addIssueComment(
    owner,
    repo,
    issue.data.number,
    'This is an automated comment.'
  );

  console.log('Added comment to issue');

  // Update the issue
  await client.updateIssue(owner, repo, issue.data.number, {
    state: 'closed',
    state_reason: 'completed',
  });

  console.log('Closed the issue');
}

// ============================================================================
// Example 3: Pull Request Workflow
// ============================================================================

async function example3_PullRequestWorkflow() {
  console.log('\n=== Example 3: Pull Request Workflow ===\n');

  const client = new GitHubClient({
    auth: {
      type: 'token',
      config: {
        token: process.env.GITHUB_TOKEN!,
        scopes: ['repo'],
      },
    },
  });

  const owner = 'your-username';
  const repo = 'your-repo';

  // List open pull requests
  const prs = await client.listPullRequests(owner, repo, {
    state: 'open',
    sort: 'updated',
  });

  console.log(`Found ${prs.data.length} open pull requests:`);
  prs.data.forEach((pr) => {
    console.log(`- #${pr.number}: ${pr.title} (by ${pr.user.login})`);
  });

  // Get specific PR details
  if (prs.data.length > 0) {
    const prNumber = prs.data[0].number;
    const pr = await client.getPullRequest(owner, repo, prNumber);

    console.log(`\nPR #${prNumber} details:`);
    console.log(`- State: ${pr.data.state}`);
    console.log(`- Mergeable: ${pr.data.mergeable}`);
    console.log(`- Changed files: ${pr.data.changed_files}`);
    console.log(`- Additions: +${pr.data.additions}, Deletions: -${pr.data.deletions}`);
  }
}

// ============================================================================
// Example 4: Webhook Event Processing
// ============================================================================

async function example4_WebhookProcessing() {
  console.log('\n=== Example 4: Webhook Event Processing ===\n');

  // Generate webhook secret
  const secret = generateWebhookSecret();
  console.log('Webhook Secret (store securely):', secret);

  // Create webhook processor
  const processor = new GitHubWebhookProcessor({ secret });

  // Handle push events
  processor.on('push', async (payload, context) => {
    console.log(`\n[PUSH] Received push to ${payload.repository?.full_name}`);

    // Check if push is to main branch
    if (isPushToBranch(payload, 'main')) {
      console.log('✓ Push to main branch');

      // Extract commit info
      const info = extractCommitInfo(payload);
      console.log(`✓ ${info.count} commits:`);
      info.messages.forEach((msg, i) => {
        console.log(`  ${i + 1}. ${msg}`);
      });
    }
  });

  // Handle pull request events
  processor.on('pull_request', async (payload, context) => {
    console.log(`\n[PR] ${payload.action.toUpperCase()} #${payload.number}`);
    console.log(`Title: ${payload.pull_request.title}`);
    console.log(`Author: ${payload.pull_request.user.login}`);
    console.log(`Base: ${payload.pull_request.base.ref} ← Head: ${payload.pull_request.head.ref}`);
  });

  // Handle issue events
  processor.on('issues', async (payload, context) => {
    console.log(`\n[ISSUE] ${payload.action.toUpperCase()} #${payload.issue.number}`);
    console.log(`Title: ${payload.issue.title}`);
    console.log(`State: ${payload.issue.state}`);
  });

  // Global handler
  processor.onAny(async (payload, context) => {
    console.log(`\n[EVENT] Type: ${context.eventType}, Delivery: ${context.deliveryId}`);
  });

  console.log('\nWebhook processor configured and ready');
  console.log('Registered handlers:', processor.getHandlerCounts());
}

// ============================================================================
// Example 5: Advanced Configuration
// ============================================================================

async function example5_AdvancedConfiguration() {
  console.log('\n=== Example 5: Advanced Configuration ===\n');

  const client = new GitHubClient({
    auth: {
      type: 'token',
      config: {
        token: process.env.GITHUB_TOKEN!,
        scopes: ['repo'],
      },
    },
    // Custom rate limiting
    rateLimit: {
      maxRequestsPerHour: 4000,
      enableAutoThrottle: true,
      throttleThreshold: 100,
      enableQueueing: true,
      maxQueueSize: 500,
    },
    // Custom retry configuration
    retry: {
      maxRetries: 5,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      retryableStatusCodes: [408, 429, 500, 502, 503, 504],
    },
    // Logging configuration
    logging: {
      logRequests: true,
      logResponses: false,
      logErrors: true,
      level: 'info',
      redactSensitive: true,
    },
    timeout: 30000,
    validateScopes: true,
  });

  // Check rate limit status
  const status = client.getRateLimitStatus();
  console.log('Rate limit status:');
  console.log(`- Available tokens: ${status.available}`);
  console.log(`- Queued requests: ${status.queued}`);

  // Get auth type
  console.log(`\nAuthentication type: ${client.getAuthType()}`);

  // Make a test request
  const repos = await client.listRepositories({ per_page: 1 });
  console.log(`\nTest request successful: ${repos.data.length} repo(s) returned`);
}

// ============================================================================
// Example 6: Error Handling
// ============================================================================

async function example6_ErrorHandling() {
  console.log('\n=== Example 6: Error Handling ===\n');

  const client = new GitHubClient({
    auth: {
      type: 'token',
      config: {
        token: process.env.GITHUB_TOKEN!,
        scopes: ['repo'],
      },
    },
  });

  // Example 1: Handle 404 (Not Found)
  try {
    await client.getRepository('nonexistent-owner', 'nonexistent-repo');
  } catch (error: any) {
    if (error.message.includes('404')) {
      console.log('✓ Handled 404: Repository not found');
    }
  }

  // Example 2: Handle missing scopes
  try {
    const limitedClient = new GitHubClient({
      auth: {
        type: 'token',
        config: {
          token: process.env.GITHUB_TOKEN!,
          scopes: ['user'], // Limited scopes
        },
      },
      validateScopes: true,
    });

    await limitedClient.createRepository({
      name: 'test-repo',
    });
  } catch (error: any) {
    if (error.message.includes('scopes')) {
      console.log('✓ Handled scope validation error');
    }
  }

  console.log('\nError handling examples completed');
}

// ============================================================================
// Example 7: Pagination
// ============================================================================

async function example7_Pagination() {
  console.log('\n=== Example 7: Pagination ===\n');

  const client = new GitHubClient({
    auth: {
      type: 'token',
      config: {
        token: process.env.GITHUB_TOKEN!,
        scopes: ['repo'],
      },
    },
  });

  const owner = 'your-username';
  const repo = 'your-repo';

  let page = 1;
  let hasMore = true;
  let totalIssues = 0;

  while (hasMore && page <= 3) {
    const issues = await client.listIssues(owner, repo, {
      state: 'all',
      per_page: 10,
      page,
    });

    totalIssues += issues.data.length;
    console.log(`Page ${page}: ${issues.data.length} issues`);

    if (issues.pagination) {
      hasMore = issues.pagination.hasNext;
      page = issues.pagination.nextPage || page + 1;
    } else {
      hasMore = false;
    }
  }

  console.log(`\nTotal issues fetched: ${totalIssues}`);
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  try {
    // Check for GitHub token
    if (!process.env.GITHUB_TOKEN) {
      console.error('ERROR: GITHUB_TOKEN environment variable is required');
      console.error('Set it with: export GITHUB_TOKEN=ghp_your_token_here');
      process.exit(1);
    }

    console.log('GitHub Integration - Examples');
    console.log('=============================');

    // Run examples
    await example1_BasicRepositoryOperations();
    // await example2_IssueManagement();
    // await example3_PullRequestWorkflow();
    await example4_WebhookProcessing();
    await example5_AdvancedConfiguration();
    await example6_ErrorHandling();
    // await example7_Pagination();

    console.log('\n=== All Examples Completed ===\n');
  } catch (error) {
    console.error('Error running examples:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export {
  example1_BasicRepositoryOperations,
  example2_IssueManagement,
  example3_PullRequestWorkflow,
  example4_WebhookProcessing,
  example5_AdvancedConfiguration,
  example6_ErrorHandling,
  example7_Pagination,
};
