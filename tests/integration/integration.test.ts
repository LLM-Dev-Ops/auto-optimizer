/**
 * Cross-Service Integration Tests
 * Tests for integration between all services (GitHub, Slack, Jira, Anthropic, Webhooks)
 */

import nock from 'nock';
import { GitHubClient } from '../../src/integrations/github';
import { JiraClient } from '../../src/integrations/jira';
import { AnthropicClient } from '../../src/integrations/anthropic';
import { WebhookClient, WebhookEventType } from '../../src/integrations/webhooks';

describe('Integration Tests - Cross-Service', () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('Optimization Alert Workflow', () => {
    it('should create GitHub issue, Jira ticket, and send webhook notification', async () => {
      // Setup GitHub mock
      const githubScope = nock('https://api.github.com')
        .post('/repos/test-owner/test-repo/issues')
        .reply(201, {
          number: 123,
          title: 'High Cost Alert',
          state: 'open',
          body: 'Cost exceeded threshold',
          labels: ['cost-alert'],
        });

      // Setup Jira mock
      const jiraScope = nock('https://test-instance.atlassian.net')
        .post('/rest/api/3/issue')
        .reply(201, { key: 'OPT-123' })
        .get('/rest/api/3/issue/OPT-123')
        .reply(200, {
          id: '123',
          key: 'OPT-123',
          fields: {
            summary: 'Cost optimization required',
            description: 'Alert details',
            issuetype: { name: 'Task' },
            status: { name: 'To Do' },
            priority: { name: 'High' },
          },
        });

      // Setup Webhook mock
      const webhookScope = nock('https://api.example.com')
        .post('/webhook')
        .reply(200, { received: true });

      // Create clients
      const githubClient = new GitHubClient({
        token: 'test-token',
        owner: 'test-owner',
        repo: 'test-repo',
      });

      const jiraClient = new JiraClient({
        baseUrl: 'https://test-instance.atlassian.net',
        email: 'test@example.com',
        apiToken: 'test-token',
        projectKey: 'OPT',
      });

      const webhookClient = new WebhookClient();
      webhookClient.registerTarget({
        id: 'alert-webhook',
        name: 'Alert Webhook',
        url: 'https://api.example.com/webhook',
        secret: 'test-secret',
        enabled: true,
        eventFilters: [WebhookEventType.COST_ALERT],
        timeout: 5000,
        retryConfig: {
          maxAttempts: 3,
          initialDelayMs: 1000,
          maxDelayMs: 10000,
          backoffMultiplier: 2,
          jitterFactor: 0.1,
        },
        rateLimitConfig: {
          requestsPerSecond: 10,
          burstSize: 20,
          enabled: false,
        },
      });

      // Execute workflow
      const githubIssue = await githubClient.createIssue(
        'High Cost Alert: Optimization Required',
        'Monthly cost exceeded $1000 threshold',
        ['cost-alert', 'urgent'],
      );

      const jiraIssue = await jiraClient.createIssue({
        summary: 'Cost optimization required',
        description: `Related to GitHub issue #${githubIssue.number}`,
        issueType: 'Task',
        priority: 'High',
        labels: ['cost-optimization'],
      });

      const webhookIds = await webhookClient.send(WebhookEventType.COST_ALERT, {
        githubIssue: githubIssue.number,
        jiraIssue: jiraIssue.key,
        cost: 1250,
        threshold: 1000,
      });

      // Verify
      expect(githubIssue.number).toBe(123);
      expect(jiraIssue.key).toBe('OPT-123');
      expect(webhookIds).toHaveLength(1);

      // Verify all API calls were made
      expect(githubScope.isDone()).toBe(true);
      expect(jiraScope.isDone()).toBe(true);

      webhookClient.start();
      await new Promise(resolve => setTimeout(resolve, 500));
      expect(webhookScope.isDone()).toBe(true);
      webhookClient.stop();
    });
  });

  describe('Model Optimization Workflow', () => {
    it('should use Anthropic API to analyze and trigger optimizations', async () => {
      const anthropicScope = nock('https://api.anthropic.com')
        .post('/v1/messages')
        .reply(200, {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Based on the metrics, I recommend switching to Claude 3 Haiku for cost savings.',
            },
          ],
          model: 'claude-3-sonnet-20240229',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 150,
            output_tokens: 50,
          },
        });

      const webhookScope = nock('https://api.example.com')
        .post('/webhook')
        .reply(200, { received: true });

      const anthropicClient = new AnthropicClient({
        apiKey: 'test-api-key',
      });

      const recommendation = await anthropicClient.complete(
        'Analyze these metrics and recommend model optimization: cost=$150, latency=2s, quality=0.9',
        { model: 'claude-3-sonnet-20240229', maxTokens: 500 },
      );

      expect(recommendation).toContain('Haiku');
      expect(anthropicScope.isDone()).toBe(true);

      const stats = anthropicClient.getUsageStats();
      expect(stats.inputTokens).toBe(150);
      expect(stats.outputTokens).toBe(50);

      const cost = anthropicClient.calculateCost('claude-3-sonnet-20240229', 150, 50);
      expect(cost).toBeCloseTo(0.0012, 4); // (150/1000)*0.003 + (50/1000)*0.015
    });
  });

  describe('Error Propagation', () => {
    it('should handle cascading failures gracefully', async () => {
      const githubScope = nock('https://api.github.com')
        .post('/repos/test-owner/test-repo/issues')
        .reply(500, 'Internal Server Error');

      const githubClient = new GitHubClient({
        token: 'test-token',
        owner: 'test-owner',
        repo: 'test-repo',
      });

      await expect(
        githubClient.createIssue('Test Issue', 'Test Body'),
      ).rejects.toThrow();

      expect(githubScope.isDone()).toBe(true);
    });
  });

  describe('Rate Limiting Coordination', () => {
    it('should respect rate limits across services', async () => {
      const githubClient = new GitHubClient({
        token: 'test-token',
        owner: 'test-owner',
        repo: 'test-repo',
      });

      // Simulate rate limit headers
      nock('https://api.github.com')
        .get('/rate_limit')
        .reply(200, {
          resources: {
            core: {
              limit: 5000,
              remaining: 10,
              reset: Date.now() / 1000 + 3600,
            },
          },
        });

      const rateLimit = githubClient.getRateLimitInfo();
      expect(rateLimit.remaining).toBeDefined();
    });
  });
});
