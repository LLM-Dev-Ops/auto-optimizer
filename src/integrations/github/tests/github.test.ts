/**
 * GitHub Integration - Comprehensive Test Suite
 *
 * Full test coverage for all GitHub integration components:
 * - Authentication (OAuth, token, GitHub App)
 * - Token encryption/decryption
 * - API client operations (repos, issues, PRs)
 * - Rate limiting and retry logic
 * - Webhook validation and processing
 * - Error handling
 *
 * @module github.test
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import GitHubClient from '../github-client';
import GitHubAuthManager, {
  encryptToken,
  decryptToken,
  generateEncryptionKey,
  validateScopes,
  parseScopes,
  hasScope,
  getOAuthAuthorizationUrl,
  generateStateToken,
  SCOPE_REQUIREMENTS,
} from '../github-auth';
import GitHubWebhookProcessor, {
  validateWebhookSignature,
  generateWebhookSignature,
  validateWebhookRequest,
  parseWebhookPayload,
  createWebhookConfig,
  generateWebhookSecret,
  isPushToBranch,
  isPullRequestAction,
  extractCommitInfo,
  WebhookRetryHandler,
} from '../github-webhooks';
import {
  GitHubClientConfig,
  GitHubAuthConfig,
  CreateRepositoryOptions,
  CreateIssueOptions,
  CreatePullRequestOptions,
  PushWebhookPayload,
  PullRequestWebhookPayload,
} from '../github-types';

// ============================================================================
// Mock Utilities
// ============================================================================

/**
 * Creates a mock fetch response
 */
function createMockResponse(
  status: number,
  data: any,
  headers: Record<string, string> = {}
): Response {
  const defaultHeaders = {
    'content-type': 'application/json',
    'x-ratelimit-limit': '5000',
    'x-ratelimit-remaining': '4999',
    'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
    'x-ratelimit-used': '1',
    'x-ratelimit-resource': 'core',
    ...headers,
  };

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers(defaultHeaders),
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as Response;
}

// ============================================================================
// Authentication Tests
// ============================================================================

describe('GitHub Authentication', () => {
  describe('Token Encryption', () => {
    it('should encrypt and decrypt tokens correctly', () => {
      const key = generateEncryptionKey();
      const token = 'ghp_test_token_1234567890';

      const encrypted = encryptToken(token, key);
      expect(encrypted).not.toBe(token);
      expect(encrypted.length).toBeGreaterThan(0);

      const decrypted = decryptToken(encrypted, key);
      expect(decrypted).toBe(token);
    });

    it('should generate unique encryption keys', () => {
      const key1 = generateEncryptionKey();
      const key2 = generateEncryptionKey();

      expect(key1).not.toBe(key2);
      expect(key1.length).toBe(44); // Base64 encoded 32 bytes
    });

    it('should fail to decrypt with wrong key', () => {
      const key1 = generateEncryptionKey();
      const key2 = generateEncryptionKey();
      const token = 'ghp_test_token';

      const encrypted = encryptToken(token, key1);

      expect(() => {
        decryptToken(encrypted, key2);
      }).toThrow();
    });

    it('should handle special characters in tokens', () => {
      const key = generateEncryptionKey();
      const token = 'ghp_特殊字符_!@#$%^&*()_+-={}[]|:";\'<>?,./';

      const encrypted = encryptToken(token, key);
      const decrypted = decryptToken(encrypted, key);

      expect(decrypted).toBe(token);
    });
  });

  describe('Scope Validation', () => {
    it('should validate required scopes', () => {
      const grantedScopes = ['repo', 'user', 'admin:org'];
      const requirement = SCOPE_REQUIREMENTS.REPO_WRITE;

      const result = validateScopes(grantedScopes, requirement);

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should detect missing required scopes', () => {
      const grantedScopes = ['user'];
      const requirement = SCOPE_REQUIREMENTS.REPO_WRITE;

      const result = validateScopes(grantedScopes, requirement);

      expect(result.valid).toBe(false);
      expect(result.missing).toContain('repo');
    });

    it('should parse scope strings correctly', () => {
      const scopeString = 'repo, user, admin:org';
      const scopes = parseScopes(scopeString);

      expect(scopes).toEqual(['repo', 'user', 'admin:org']);
    });

    it('should check for specific scopes', () => {
      const grantedScopes = ['repo', 'user'];

      expect(hasScope(grantedScopes, 'repo')).toBe(true);
      expect(hasScope(grantedScopes, 'user')).toBe(true);
      expect(hasScope(grantedScopes, 'admin:org')).toBe(false);
    });

    it('should handle parent scopes', () => {
      const grantedScopes = ['repo'];

      expect(hasScope(grantedScopes, 'repo:status')).toBe(true);
    });
  });

  describe('OAuth Flow', () => {
    it('should generate OAuth authorization URL', () => {
      const config = {
        clientId: 'test_client_id',
        clientSecret: 'test_secret',
        callbackUrl: 'https://example.com/callback',
        scopes: ['repo', 'user'],
      };
      const state = generateStateToken();

      const url = getOAuthAuthorizationUrl(config, state);

      expect(url).toContain('https://github.com/login/oauth/authorize');
      expect(url).toContain(`client_id=${config.clientId}`);
      expect(url).toContain('scope=repo+user');
      expect(url).toContain(`state=${state}`);
    });

    it('should generate unique state tokens', () => {
      const state1 = generateStateToken();
      const state2 = generateStateToken();

      expect(state1).not.toBe(state2);
      expect(state1.length).toBe(64); // 32 bytes in hex
    });
  });

  describe('GitHubAuthManager', () => {
    it('should return personal access token', async () => {
      const config: GitHubAuthConfig = {
        type: 'token',
        config: {
          token: 'ghp_test_token',
          scopes: ['repo'],
        },
      };

      const authManager = new GitHubAuthManager(config);
      const token = await authManager.getAccessToken();

      expect(token).toBe('ghp_test_token');
    });

    it('should decrypt encrypted token', async () => {
      const encryptionKey = generateEncryptionKey();
      const originalToken = 'ghp_test_token';
      const encryptedToken = encryptToken(originalToken, encryptionKey);

      const config: GitHubAuthConfig = {
        type: 'token',
        config: {
          token: encryptedToken,
          scopes: ['repo'],
        },
      };

      const authManager = new GitHubAuthManager(config, encryptionKey);
      const token = await authManager.getAccessToken();

      expect(token).toBe(originalToken);
    });

    it('should validate token scopes', async () => {
      const config: GitHubAuthConfig = {
        type: 'token',
        config: {
          token: 'ghp_test_token',
          scopes: ['repo', 'user'],
        },
      };

      const authManager = new GitHubAuthManager(config);

      await expect(
        authManager.validateTokenScopes(SCOPE_REQUIREMENTS.REPO_READ)
      ).resolves.toBe(true);
    });

    it('should throw on missing scopes', async () => {
      const config: GitHubAuthConfig = {
        type: 'token',
        config: {
          token: 'ghp_test_token',
          scopes: ['user'],
        },
      };

      const authManager = new GitHubAuthManager(config);

      await expect(
        authManager.validateTokenScopes(SCOPE_REQUIREMENTS.REPO_WRITE)
      ).rejects.toThrow('Missing required scopes');
    });
  });
});

// ============================================================================
// GitHub Client Tests
// ============================================================================

describe('GitHub Client', () => {
  let client: GitHubClient;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    const config: GitHubClientConfig = {
      auth: {
        type: 'token',
        config: {
          token: 'ghp_test_token',
          scopes: ['repo', 'user', 'admin:repo_hook'],
        },
      },
      validateScopes: false, // Disable for testing
      logging: {
        logRequests: false,
        logResponses: false,
        logErrors: false,
        level: 'error',
        redactSensitive: true,
      },
    };

    client = new GitHubClient(config);
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Repository Operations', () => {
    it('should list repositories', async () => {
      const mockRepos = [
        { id: 1, name: 'repo1', full_name: 'user/repo1' },
        { id: 2, name: 'repo2', full_name: 'user/repo2' },
      ];

      global.fetch = vi.fn().mockResolvedValue(createMockResponse(200, mockRepos));

      const response = await client.listRepositories();

      expect(response.data).toEqual(mockRepos);
      expect(response.status).toBe(200);
      expect(response.rateLimit.remaining).toBe(4999);
    });

    it('should get a single repository', async () => {
      const mockRepo = { id: 1, name: 'repo1', full_name: 'user/repo1' };

      global.fetch = vi.fn().mockResolvedValue(createMockResponse(200, mockRepo));

      const response = await client.getRepository('user', 'repo1');

      expect(response.data).toEqual(mockRepo);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/repos/user/repo1'),
        expect.any(Object)
      );
    });

    it('should create a repository', async () => {
      const options: CreateRepositoryOptions = {
        name: 'new-repo',
        description: 'Test repository',
        private: true,
      };

      const mockRepo = { id: 1, name: 'new-repo', ...options };

      global.fetch = vi.fn().mockResolvedValue(createMockResponse(201, mockRepo));

      const response = await client.createRepository(options);

      expect(response.data.name).toBe('new-repo');
      expect(response.status).toBe(201);
    });

    it('should update a repository', async () => {
      const mockRepo = { id: 1, name: 'repo1', description: 'Updated' };

      global.fetch = vi.fn().mockResolvedValue(createMockResponse(200, mockRepo));

      const response = await client.updateRepository('user', 'repo1', {
        description: 'Updated',
      });

      expect(response.data.description).toBe('Updated');
    });

    it('should delete a repository', async () => {
      global.fetch = vi.fn().mockResolvedValue(createMockResponse(204, null));

      await client.deleteRepository('user', 'repo1');

      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe('Issue Operations', () => {
    it('should list issues', async () => {
      const mockIssues = [
        { id: 1, number: 1, title: 'Issue 1' },
        { id: 2, number: 2, title: 'Issue 2' },
      ];

      global.fetch = vi.fn().mockResolvedValue(createMockResponse(200, mockIssues));

      const response = await client.listIssues('user', 'repo1');

      expect(response.data).toHaveLength(2);
    });

    it('should get a single issue', async () => {
      const mockIssue = { id: 1, number: 1, title: 'Issue 1' };

      global.fetch = vi.fn().mockResolvedValue(createMockResponse(200, mockIssue));

      const response = await client.getIssue('user', 'repo1', 1);

      expect(response.data.number).toBe(1);
    });

    it('should create an issue', async () => {
      const options: CreateIssueOptions = {
        title: 'New Issue',
        body: 'Issue description',
        labels: ['bug'],
      };

      const mockIssue = { id: 1, number: 1, ...options };

      global.fetch = vi.fn().mockResolvedValue(createMockResponse(201, mockIssue));

      const response = await client.createIssue('user', 'repo1', options);

      expect(response.data.title).toBe('New Issue');
    });

    it('should update an issue', async () => {
      const mockIssue = { id: 1, number: 1, state: 'closed' };

      global.fetch = vi.fn().mockResolvedValue(createMockResponse(200, mockIssue));

      const response = await client.updateIssue('user', 'repo1', 1, {
        state: 'closed',
      });

      expect(response.data.state).toBe('closed');
    });
  });

  describe('Pull Request Operations', () => {
    it('should list pull requests', async () => {
      const mockPRs = [
        { id: 1, number: 1, title: 'PR 1' },
        { id: 2, number: 2, title: 'PR 2' },
      ];

      global.fetch = vi.fn().mockResolvedValue(createMockResponse(200, mockPRs));

      const response = await client.listPullRequests('user', 'repo1');

      expect(response.data).toHaveLength(2);
    });

    it('should create a pull request', async () => {
      const options: CreatePullRequestOptions = {
        title: 'New PR',
        head: 'feature-branch',
        base: 'main',
      };

      const mockPR = { id: 1, number: 1, ...options };

      global.fetch = vi.fn().mockResolvedValue(createMockResponse(201, mockPR));

      const response = await client.createPullRequest('user', 'repo1', options);

      expect(response.data.title).toBe('New PR');
    });

    it('should merge a pull request', async () => {
      const mockResult = { merged: true, message: 'Pull Request merged', sha: 'abc123' };

      global.fetch = vi.fn().mockResolvedValue(createMockResponse(200, mockResult));

      const response = await client.mergePullRequest('user', 'repo1', 1);

      expect(response.data.merged).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 errors', async () => {
      const errorResponse = {
        message: 'Not Found',
        documentation_url: 'https://docs.github.com',
      };

      global.fetch = vi.fn().mockResolvedValue(createMockResponse(404, errorResponse));

      await expect(client.getRepository('user', 'nonexistent')).rejects.toThrow(
        'GitHub API error (404)'
      );
    });

    it('should retry on 500 errors', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(createMockResponse(500, { message: 'Server Error' }));
        }
        return Promise.resolve(createMockResponse(200, { id: 1, name: 'repo1' }));
      });

      const response = await client.getRepository('user', 'repo1');

      expect(callCount).toBe(2);
      expect(response.data.name).toBe('repo1');
    });

    it('should handle rate limit errors', async () => {
      const errorResponse = {
        message: 'API rate limit exceeded',
        documentation_url: 'https://docs.github.com/rate-limit',
      };

      global.fetch = vi.fn().mockResolvedValue(
        createMockResponse(429, errorResponse, {
          'x-ratelimit-remaining': '0',
        })
      );

      await expect(client.getRepository('user', 'repo1')).rejects.toThrow();
    });
  });

  describe('Rate Limiting', () => {
    it('should track rate limit status', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        createMockResponse(200, {}, {
          'x-ratelimit-remaining': '4500',
        })
      );

      await client.getRepository('user', 'repo1');

      const status = client.getRateLimitStatus();
      expect(status.available).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Webhook Tests
// ============================================================================

describe('GitHub Webhooks', () => {
  describe('Signature Validation', () => {
    it('should validate correct signatures', () => {
      const secret = 'test_secret';
      const payload = JSON.stringify({ test: 'data' });
      const signature = generateWebhookSignature(payload, secret);

      const isValid = validateWebhookSignature(payload, signature, secret);

      expect(isValid).toBe(true);
    });

    it('should reject invalid signatures', () => {
      const secret = 'test_secret';
      const payload = JSON.stringify({ test: 'data' });
      const wrongSignature = 'sha256=invalid_signature';

      const isValid = validateWebhookSignature(payload, wrongSignature, secret);

      expect(isValid).toBe(false);
    });

    it('should reject signatures with wrong secret', () => {
      const payload = JSON.stringify({ test: 'data' });
      const signature = generateWebhookSignature(payload, 'secret1');

      const isValid = validateWebhookSignature(payload, signature, 'secret2');

      expect(isValid).toBe(false);
    });
  });

  describe('Request Validation', () => {
    it('should validate complete webhook request', () => {
      const secret = 'test_secret';
      const body = JSON.stringify({ test: 'data' });
      const signature = generateWebhookSignature(body, secret);

      const headers = {
        'x-github-event': 'push',
        'x-github-delivery': '12345',
        'x-hub-signature-256': signature,
      };

      const result = validateWebhookRequest(headers, body, secret);

      expect(result.valid).toBe(true);
      expect(result.eventType).toBe('push');
      expect(result.deliveryId).toBe('12345');
    });

    it('should reject request with missing headers', () => {
      const headers = {
        'x-github-event': 'push',
      };

      const result = validateWebhookRequest(headers, '{}');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing required header');
    });
  });

  describe('Payload Parsing', () => {
    it('should parse JSON payload', () => {
      const payload = { test: 'data', number: 123 };
      const parsed = parseWebhookPayload(JSON.stringify(payload));

      expect(parsed).toEqual(payload);
    });

    it('should handle object payload', () => {
      const payload = { test: 'data' };
      const parsed = parseWebhookPayload(payload);

      expect(parsed).toEqual(payload);
    });

    it('should throw on invalid JSON', () => {
      expect(() => {
        parseWebhookPayload('invalid json');
      }).toThrow('Failed to parse webhook payload');
    });
  });

  describe('GitHubWebhookProcessor', () => {
    it('should register and call event handlers', async () => {
      const processor = new GitHubWebhookProcessor(
        { secret: 'test_secret' },
        false
      );

      let handlerCalled = false;
      processor.on('push', () => {
        handlerCalled = true;
      });

      const payload: PushWebhookPayload = {
        ref: 'refs/heads/main',
        before: 'abc123',
        after: 'def456',
        created: false,
        deleted: false,
        forced: false,
        base_ref: null,
        compare: 'https://github.com/compare',
        commits: [],
        head_commit: {
          id: 'def456',
          message: 'Test commit',
          timestamp: new Date().toISOString(),
          url: 'https://github.com/commit/def456',
        },
      };

      const body = JSON.stringify(payload);
      const signature = generateWebhookSignature(body, 'test_secret');

      const headers = {
        'x-github-event': 'push',
        'x-github-delivery': '12345',
        'x-hub-signature-256': signature,
      };

      const result = await processor.process(headers, body);

      expect(result.success).toBe(true);
      expect(handlerCalled).toBe(true);
    });

    it('should call global handlers', async () => {
      const processor = new GitHubWebhookProcessor({ secret: 'test_secret' }, false);

      let globalHandlerCalled = false;
      processor.onAny(() => {
        globalHandlerCalled = true;
      });

      const payload = { action: 'opened' };
      const body = JSON.stringify(payload);
      const signature = generateWebhookSignature(body, 'test_secret');

      const headers = {
        'x-github-event': 'issues',
        'x-github-delivery': '12345',
        'x-hub-signature-256': signature,
      };

      await processor.process(headers, body);

      expect(globalHandlerCalled).toBe(true);
    });

    it('should handle invalid signatures', async () => {
      const processor = new GitHubWebhookProcessor({ secret: 'test_secret' }, false);

      const headers = {
        'x-github-event': 'push',
        'x-github-delivery': '12345',
        'x-hub-signature-256': 'sha256=invalid',
      };

      const result = await processor.process(headers, '{}');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid webhook signature');
    });
  });

  describe('Event Utilities', () => {
    it('should check push to specific branch', () => {
      const payload: PushWebhookPayload = {
        ref: 'refs/heads/main',
      } as PushWebhookPayload;

      expect(isPushToBranch(payload, 'main')).toBe(true);
      expect(isPushToBranch(payload, 'develop')).toBe(false);
    });

    it('should check pull request action', () => {
      const payload: PullRequestWebhookPayload = {
        action: 'opened',
      } as PullRequestWebhookPayload;

      expect(isPullRequestAction(payload, 'opened')).toBe(true);
      expect(isPullRequestAction(payload, 'closed')).toBe(false);
    });

    it('should extract commit information', () => {
      const payload: PushWebhookPayload = {
        commits: [
          {
            id: 'abc123',
            message: 'Commit 1',
            timestamp: new Date().toISOString(),
            author: { name: 'User', email: 'user@example.com', username: 'user' },
            url: 'https://github.com/commit/abc123',
            distinct: true,
          },
          {
            id: 'def456',
            message: 'Commit 2',
            timestamp: new Date().toISOString(),
            author: { name: 'User2', email: 'user2@example.com' },
            url: 'https://github.com/commit/def456',
            distinct: true,
          },
        ],
      } as PushWebhookPayload;

      const info = extractCommitInfo(payload);

      expect(info.count).toBe(2);
      expect(info.messages).toContain('Commit 1');
      expect(info.authors).toContain('user');
    });
  });

  describe('Webhook Configuration', () => {
    it('should create webhook config', () => {
      const config = createWebhookConfig(
        'https://example.com/webhook',
        ['push', 'pull_request'],
        'secret123'
      );

      expect(config.config.url).toBe('https://example.com/webhook');
      expect(config.config.secret).toBe('secret123');
      expect(config.events).toContain('push');
      expect(config.active).toBe(true);
    });

    it('should generate webhook secret', () => {
      const secret = generateWebhookSecret();

      expect(secret.length).toBe(64);
      expect(/^[0-9a-f]+$/.test(secret)).toBe(true);
    });
  });

  describe('Webhook Retry Handler', () => {
    it('should retry failed webhook processing', async () => {
      const processor = new GitHubWebhookProcessor({}, false);
      const retryHandler = new WebhookRetryHandler(3, 10, 2);

      let attemptCount = 0;
      processor.on('push', () => {
        attemptCount++;
        if (attemptCount < 2) {
          throw new Error('Temporary failure');
        }
      });

      const payload = { ref: 'refs/heads/main' };
      const body = JSON.stringify(payload);
      const headers = {
        'x-github-event': 'push',
        'x-github-delivery': '12345',
      };

      const result = await retryHandler.retry(processor, headers, body);

      expect(result.success).toBe(true);
      expect(attemptCount).toBe(2);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Integration Tests', () => {
  it('should handle complete workflow: auth + API call + webhook', async () => {
    // 1. Setup authentication
    const config: GitHubClientConfig = {
      auth: {
        type: 'token',
        config: {
          token: 'ghp_test_token',
          scopes: ['repo'],
        },
      },
      validateScopes: false,
    };

    const client = new GitHubClient(config);

    // 2. Mock API call
    global.fetch = vi.fn().mockResolvedValue(
      createMockResponse(200, {
        id: 1,
        name: 'test-repo',
        full_name: 'user/test-repo',
      })
    );

    const repo = await client.getRepository('user', 'test-repo');
    expect(repo.data.name).toBe('test-repo');

    // 3. Setup webhook processor
    const processor = new GitHubWebhookProcessor({ secret: 'webhook_secret' }, false);

    let webhookReceived = false;
    processor.on('push', (payload: PushWebhookPayload) => {
      webhookReceived = true;
      expect(payload.ref).toBe('refs/heads/main');
    });

    // 4. Simulate webhook
    const webhookPayload: PushWebhookPayload = {
      ref: 'refs/heads/main',
      before: 'abc',
      after: 'def',
      created: false,
      deleted: false,
      forced: false,
      base_ref: null,
      compare: 'https://example.com',
      commits: [],
      head_commit: {
        id: 'def',
        message: 'Test',
        timestamp: new Date().toISOString(),
        url: 'https://example.com',
      },
    };

    const body = JSON.stringify(webhookPayload);
    const signature = generateWebhookSignature(body, 'webhook_secret');

    await processor.process(
      {
        'x-github-event': 'push',
        'x-github-delivery': '12345',
        'x-hub-signature-256': signature,
      },
      body
    );

    expect(webhookReceived).toBe(true);
  });
});
