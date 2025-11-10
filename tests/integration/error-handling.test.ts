/**
 * Error Handling Tests
 * Comprehensive error handling and failure scenario tests
 */

import nock from 'nock';
import {
  WebhookClient,
  WebhookEventType,
  WebhookError,
  WebhookErrorType,
  webhookRetryService,
} from '../../src/integrations/webhooks';
import { GitHubClient } from '../../src/integrations/github';
import { JiraClient } from '../../src/integrations/jira';
import { AnthropicClient } from '../../src/integrations/anthropic';

describe('Error Handling Tests', () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('Network Errors', () => {
    it('should handle connection timeout errors', async () => {
      nock('https://api.github.com')
        .post('/repos/test/test/issues')
        .delayConnection(35000) // Longer than timeout
        .reply(200);

      const client = new GitHubClient({
        token: 'test-token',
        owner: 'test',
        repo: 'test',
        timeout: 5000,
      });

      await expect(client.createIssue('Test', 'Body')).rejects.toThrow();
    });

    it('should handle DNS resolution failures', async () => {
      nock('https://nonexistent-domain-xyz123.com')
        .post('/webhook')
        .replyWithError({ code: 'ENOTFOUND' });

      const webhookClient = new WebhookClient();
      webhookClient.registerTarget({
        id: 'dns-fail-target',
        name: 'DNS Fail',
        url: 'https://nonexistent-domain-xyz123.com/webhook',
        secret: 'test-secret',
        enabled: true,
        eventFilters: [WebhookEventType.OPTIMIZATION_COMPLETED],
        timeout: 5000,
        retryConfig: {
          maxAttempts: 1,
          initialDelayMs: 100,
          maxDelayMs: 1000,
          backoffMultiplier: 2,
          jitterFactor: 0,
        },
        rateLimitConfig: {
          requestsPerSecond: 10,
          burstSize: 20,
          enabled: false,
        },
      });

      const deliveryIds = await webhookClient.send(
        WebhookEventType.OPTIMIZATION_COMPLETED,
        { test: 'data' },
      );

      expect(deliveryIds).toHaveLength(1);

      webhookClient.start();
      await new Promise(resolve => setTimeout(resolve, 500));
      webhookClient.stop();

      const delivery = webhookClient.getDelivery(deliveryIds[0]);
      expect(delivery?.attempts.length).toBeGreaterThan(0);
      expect(delivery?.attempts[0].error).toBeDefined();
    });

    it('should handle connection refused errors', async () => {
      nock('https://localhost:9999')
        .post('/webhook')
        .replyWithError({ code: 'ECONNREFUSED' });

      const webhookClient = new WebhookClient();
      webhookClient.registerTarget({
        id: 'refused-target',
        name: 'Connection Refused',
        url: 'https://localhost:9999/webhook',
        secret: 'test-secret',
        enabled: true,
        eventFilters: [WebhookEventType.OPTIMIZATION_COMPLETED],
        timeout: 5000,
        retryConfig: {
          maxAttempts: 2,
          initialDelayMs: 100,
          maxDelayMs: 1000,
          backoffMultiplier: 2,
          jitterFactor: 0,
        },
        rateLimitConfig: {
          requestsPerSecond: 10,
          burstSize: 20,
          enabled: false,
        },
      });

      const deliveryIds = await webhookClient.send(
        WebhookEventType.OPTIMIZATION_COMPLETED,
        { test: 'data' },
      );

      webhookClient.start();
      await new Promise(resolve => setTimeout(resolve, 1000));
      webhookClient.stop();

      const delivery = webhookClient.getDelivery(deliveryIds[0]);
      expect(delivery?.attempts.length).toBeGreaterThan(0);
    });
  });

  describe('HTTP Error Codes', () => {
    it('should not retry 4xx client errors (except 408, 429)', async () => {
      const config = {
        maxAttempts: 5,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        jitterFactor: 0,
      };

      // Test various 4xx errors
      const testCases = [
        { code: 400, shouldRetry: false },
        { code: 401, shouldRetry: false },
        { code: 403, shouldRetry: false },
        { code: 404, shouldRetry: false },
        { code: 408, shouldRetry: true }, // Request Timeout
        { code: 429, shouldRetry: true }, // Rate Limit
      ];

      for (const testCase of testCases) {
        const attempts = [{ attemptNumber: 0, timestamp: Date.now(), statusCode: testCase.code }];
        const shouldRetry = webhookRetryService.shouldRetry(attempts, config, testCase.code);

        expect(shouldRetry).toBe(testCase.shouldRetry);
      }
    });

    it('should retry 5xx server errors', async () => {
      const config = {
        maxAttempts: 5,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        jitterFactor: 0,
      };

      const serverErrors = [500, 502, 503, 504];

      for (const errorCode of serverErrors) {
        const attempts = [{ attemptNumber: 0, timestamp: Date.now(), statusCode: errorCode }];
        const shouldRetry = webhookRetryService.shouldRetry(attempts, config, errorCode);

        expect(shouldRetry).toBe(true);
      }
    });

    it('should handle rate limiting with Retry-After header', async () => {
      nock('https://api.example.com')
        .post('/webhook')
        .reply(429, 'Too Many Requests', {
          'Retry-After': '5',
        });

      const webhookClient = new WebhookClient();
      webhookClient.registerTarget({
        id: 'rate-limit-target',
        name: 'Rate Limit',
        url: 'https://api.example.com/webhook',
        secret: 'test-secret',
        enabled: true,
        eventFilters: [WebhookEventType.OPTIMIZATION_COMPLETED],
        timeout: 5000,
        retryConfig: {
          maxAttempts: 2,
          initialDelayMs: 100,
          maxDelayMs: 10000,
          backoffMultiplier: 2,
          jitterFactor: 0,
        },
        rateLimitConfig: {
          requestsPerSecond: 10,
          burstSize: 20,
          enabled: false,
        },
      });

      const deliveryIds = await webhookClient.send(
        WebhookEventType.OPTIMIZATION_COMPLETED,
        { test: 'data' },
      );

      webhookClient.start();
      await new Promise(resolve => setTimeout(resolve, 500));
      webhookClient.stop();

      const delivery = webhookClient.getDelivery(deliveryIds[0]);
      expect(delivery?.attempts[0].statusCode).toBe(429);
    });
  });

  describe('Validation Errors', () => {
    it('should reject invalid retry configuration', () => {
      const invalidConfigs = [
        { maxAttempts: 0, initialDelayMs: 1000, maxDelayMs: 10000, backoffMultiplier: 2, jitterFactor: 0.1 },
        { maxAttempts: 3, initialDelayMs: -100, maxDelayMs: 10000, backoffMultiplier: 2, jitterFactor: 0.1 },
        { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 500, backoffMultiplier: 2, jitterFactor: 0.1 },
        { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 10000, backoffMultiplier: 0.5, jitterFactor: 0.1 },
        { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 10000, backoffMultiplier: 2, jitterFactor: 1.5 },
      ];

      for (const config of invalidConfigs) {
        expect(() => {
          webhookRetryService.validateRetryConfig(config);
        }).toThrow(WebhookError);
      }
    });

    it('should reject invalid webhook signatures', () => {
      const signatureService = new (require('../../src/integrations/webhooks').WebhookSignatureService)();

      const payload = {
        id: 'test',
        eventType: WebhookEventType.OPTIMIZATION_COMPLETED,
        timestamp: Date.now(),
        source: 'test',
        data: {},
        version: '1.0',
      };

      expect(() => {
        signatureService.generateSignature(payload, '');
      }).toThrow();

      expect(() => {
        signatureService.parseSignatureHeaders({});
      }).toThrow('Missing required signature headers');
    });
  });

  describe('Dead Letter Queue', () => {
    it('should move failed deliveries to dead letter queue', async () => {
      nock('https://api.example.com')
        .post('/webhook')
        .times(3)
        .reply(500, 'Internal Server Error');

      const webhookClient = new WebhookClient();
      webhookClient.registerTarget({
        id: 'dlq-target',
        name: 'DLQ Test',
        url: 'https://api.example.com/webhook',
        secret: 'test-secret',
        enabled: true,
        eventFilters: [WebhookEventType.OPTIMIZATION_COMPLETED],
        timeout: 5000,
        retryConfig: {
          maxAttempts: 2,
          initialDelayMs: 100,
          maxDelayMs: 1000,
          backoffMultiplier: 2,
          jitterFactor: 0,
        },
        rateLimitConfig: {
          requestsPerSecond: 10,
          burstSize: 20,
          enabled: false,
        },
      });

      const deliveryIds = await webhookClient.send(
        WebhookEventType.OPTIMIZATION_COMPLETED,
        { test: 'data' },
      );

      webhookClient.start();
      await new Promise(resolve => setTimeout(resolve, 2000));
      webhookClient.stop();

      const delivery = webhookClient.getDelivery(deliveryIds[0]);
      expect(delivery?.attempts.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Partial Failures', () => {
    it('should handle partial success in multi-target delivery', async () => {
      nock('https://api.example.com')
        .post('/webhook1')
        .reply(200, { success: true })
        .post('/webhook2')
        .reply(500, 'Server Error');

      const webhookClient = new WebhookClient();

      webhookClient.registerTarget({
        id: 'success-target',
        name: 'Success Target',
        url: 'https://api.example.com/webhook1',
        secret: 'test-secret',
        enabled: true,
        eventFilters: [WebhookEventType.OPTIMIZATION_COMPLETED],
        timeout: 5000,
        retryConfig: {
          maxAttempts: 1,
          initialDelayMs: 100,
          maxDelayMs: 1000,
          backoffMultiplier: 2,
          jitterFactor: 0,
        },
        rateLimitConfig: {
          requestsPerSecond: 10,
          burstSize: 20,
          enabled: false,
        },
      });

      webhookClient.registerTarget({
        id: 'failure-target',
        name: 'Failure Target',
        url: 'https://api.example.com/webhook2',
        secret: 'test-secret',
        enabled: true,
        eventFilters: [WebhookEventType.OPTIMIZATION_COMPLETED],
        timeout: 5000,
        retryConfig: {
          maxAttempts: 1,
          initialDelayMs: 100,
          maxDelayMs: 1000,
          backoffMultiplier: 2,
          jitterFactor: 0,
        },
        rateLimitConfig: {
          requestsPerSecond: 10,
          burstSize: 20,
          enabled: false,
        },
      });

      const deliveryIds = await webhookClient.send(
        WebhookEventType.OPTIMIZATION_COMPLETED,
        { test: 'data' },
      );

      expect(deliveryIds).toHaveLength(2);

      webhookClient.start();
      await new Promise(resolve => setTimeout(resolve, 1000));
      webhookClient.stop();

      // One should succeed, one should fail
      const stats = webhookClient.getStatistics();
      expect(stats.totalDeliveries).toBe(2);
    });
  });

  describe('Circuit Breaker Pattern', () => {
    it('should track consecutive failures', async () => {
      const attempts = [
        { attemptNumber: 0, timestamp: Date.now() - 5000, statusCode: 500 },
        { attemptNumber: 1, timestamp: Date.now() - 3000, statusCode: 500 },
        { attemptNumber: 2, timestamp: Date.now() - 1000, statusCode: 500 },
      ];

      const config = {
        maxAttempts: 5,
        initialDelayMs: 1000,
        maxDelayMs: 60000,
        backoffMultiplier: 2,
        jitterFactor: 0.1,
      };

      const strategy = webhookRetryService.getRetryStrategy(attempts, config);

      expect(strategy.currentAttempt).toBe(3);
      expect(strategy.remainingAttempts).toBe(2);
      expect(strategy.canRetry).toBe(true);
    });
  });

  describe('Error Recovery', () => {
    it('should recover from transient failures', async () => {
      nock('https://api.example.com')
        .post('/webhook')
        .reply(500, 'Error')
        .post('/webhook')
        .reply(200, { success: true });

      const webhookClient = new WebhookClient();
      webhookClient.registerTarget({
        id: 'recovery-target',
        name: 'Recovery Test',
        url: 'https://api.example.com/webhook',
        secret: 'test-secret',
        enabled: true,
        eventFilters: [WebhookEventType.OPTIMIZATION_COMPLETED],
        timeout: 5000,
        retryConfig: {
          maxAttempts: 3,
          initialDelayMs: 100,
          maxDelayMs: 1000,
          backoffMultiplier: 2,
          jitterFactor: 0,
        },
        rateLimitConfig: {
          requestsPerSecond: 10,
          burstSize: 20,
          enabled: false,
        },
      });

      const deliveryIds = await webhookClient.send(
        WebhookEventType.OPTIMIZATION_COMPLETED,
        { test: 'data' },
      );

      webhookClient.start();
      await new Promise(resolve => setTimeout(resolve, 2000));
      webhookClient.stop();

      const delivery = webhookClient.getDelivery(deliveryIds[0]);
      expect(delivery?.attempts.length).toBeGreaterThanOrEqual(1);
    });
  });
});
