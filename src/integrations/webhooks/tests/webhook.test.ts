/**
 * Comprehensive Webhook System Tests
 * Full test coverage for webhook delivery, signatures, retry, and queue management
 */

import nock from 'nock';
import {
  WebhookClient,
  WebhookSignatureService,
  WebhookRetryService,
  WebhookQueue,
  WebhookEventType,
  WebhookTarget,
  WebhookPayload,
  WebhookDeliveryStatus,
  WebhookError,
  WebhookErrorType,
  DEFAULT_RETRY_CONFIG,
  createRetryConfig,
} from '../index';

describe('Webhook Signature Service', () => {
  let signatureService: WebhookSignatureService;
  let testPayload: WebhookPayload;

  beforeEach(() => {
    signatureService = new WebhookSignatureService();
    testPayload = {
      id: 'test-123',
      eventType: WebhookEventType.OPTIMIZATION_COMPLETED,
      timestamp: Date.now(),
      source: 'llm-auto-optimizer',
      data: { test: 'data' },
      version: '1.0',
    };
  });

  describe('generateSignature', () => {
    it('should generate valid HMAC-SHA256 signature', () => {
      const secret = 'test-secret-key';
      const signature = signatureService.generateSignature(testPayload, secret);

      expect(signature.signature).toBeDefined();
      expect(signature.signature).toMatch(/^[a-f0-9]{64}$/);
      expect(signature.algorithm).toBe('sha256');
      expect(signature.timestamp).toBeGreaterThan(0);
    });

    it('should generate consistent signatures for same payload', () => {
      const secret = 'test-secret';
      const timestamp = Date.now();

      const sig1 = signatureService.generateSignature(testPayload, secret, timestamp);
      const sig2 = signatureService.generateSignature(testPayload, secret, timestamp);

      expect(sig1.signature).toBe(sig2.signature);
    });

    it('should generate different signatures for different payloads', () => {
      const secret = 'test-secret';
      const payload2 = { ...testPayload, data: { different: 'data' } };

      const sig1 = signatureService.generateSignature(testPayload, secret);
      const sig2 = signatureService.generateSignature(payload2, secret);

      expect(sig1.signature).not.toBe(sig2.signature);
    });

    it('should throw error for empty secret', () => {
      expect(() => {
        signatureService.generateSignature(testPayload, '');
      }).toThrow(WebhookError);
    });
  });

  describe('verifySignature', () => {
    it('should verify valid signature', () => {
      const secret = 'test-secret';
      const timestamp = Date.now();
      const sig = signatureService.generateSignature(testPayload, secret, timestamp);

      const valid = signatureService.verifySignature(
        testPayload,
        sig.signature,
        secret,
        timestamp,
      );

      expect(valid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const secret = 'test-secret';
      const timestamp = Date.now();

      const valid = signatureService.verifySignature(
        testPayload,
        'invalid-signature',
        secret,
        timestamp,
      );

      expect(valid).toBe(false);
    });

    it('should reject expired signatures', () => {
      const secret = 'test-secret';
      const oldTimestamp = Date.now() - 400000; // 6+ minutes ago
      const sig = signatureService.generateSignature(testPayload, secret, oldTimestamp);

      expect(() => {
        signatureService.verifySignature(
          testPayload,
          sig.signature,
          secret,
          oldTimestamp,
          300000, // 5 minute tolerance
        );
      }).toThrow('outside tolerance window');
    });

    it('should accept signatures within tolerance window', () => {
      const secret = 'test-secret';
      const recentTimestamp = Date.now() - 60000; // 1 minute ago
      const sig = signatureService.generateSignature(testPayload, secret, recentTimestamp);

      const valid = signatureService.verifySignature(
        testPayload,
        sig.signature,
        secret,
        recentTimestamp,
        300000, // 5 minute tolerance
      );

      expect(valid).toBe(true);
    });
  });

  describe('createSignatureHeaders', () => {
    it('should create proper signature headers', () => {
      const secret = 'test-secret';
      const headers = signatureService.createSignatureHeaders(testPayload, secret);

      expect(headers).toHaveProperty('X-Webhook-Signature');
      expect(headers).toHaveProperty('X-Webhook-Timestamp');
      expect(headers).toHaveProperty('X-Webhook-Algorithm');
      expect(headers).toHaveProperty('X-Webhook-Event-Type');
      expect(headers).toHaveProperty('X-Webhook-Event-Id');
      expect(headers['X-Webhook-Algorithm']).toBe('sha256');
      expect(headers['X-Webhook-Event-Type']).toBe(testPayload.eventType);
    });
  });

  describe('parseSignatureHeaders', () => {
    it('should parse valid signature headers', () => {
      const headers = {
        'X-Webhook-Signature': 'abc123',
        'X-Webhook-Timestamp': '1234567890',
        'X-Webhook-Algorithm': 'sha256',
      };

      const parsed = signatureService.parseSignatureHeaders(headers);

      expect(parsed.signature).toBe('abc123');
      expect(parsed.timestamp).toBe(1234567890);
      expect(parsed.algorithm).toBe('sha256');
    });

    it('should throw error for missing headers', () => {
      const headers = { 'X-Webhook-Signature': 'abc123' };

      expect(() => {
        signatureService.parseSignatureHeaders(headers);
      }).toThrow('Missing required signature headers');
    });
  });

  describe('generateSecret', () => {
    it('should generate secure random secret', () => {
      const secret = WebhookSignatureService.generateSecret();

      expect(secret).toBeDefined();
      expect(secret.length).toBe(64); // 32 bytes = 64 hex chars
      expect(secret).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate unique secrets', () => {
      const secret1 = WebhookSignatureService.generateSecret();
      const secret2 = WebhookSignatureService.generateSecret();

      expect(secret1).not.toBe(secret2);
    });
  });
});

describe('Webhook Retry Service', () => {
  let retryService: WebhookRetryService;

  beforeEach(() => {
    retryService = new WebhookRetryService();
  });

  describe('calculateRetryDelay', () => {
    it('should calculate exponential backoff', () => {
      const config = DEFAULT_RETRY_CONFIG;

      const delay0 = retryService.calculateRetryDelay(0, config);
      const delay1 = retryService.calculateRetryDelay(1, config);
      const delay2 = retryService.calculateRetryDelay(2, config);

      expect(delay1).toBeGreaterThan(delay0);
      expect(delay2).toBeGreaterThan(delay1);
    });

    it('should respect maximum delay', () => {
      const config = { ...DEFAULT_RETRY_CONFIG, maxDelayMs: 10000 };

      const delay10 = retryService.calculateRetryDelay(10, config);

      expect(delay10).toBeLessThanOrEqual(config.maxDelayMs * 1.2); // Allow for jitter
    });

    it('should include jitter', () => {
      const config = { ...DEFAULT_RETRY_CONFIG, jitterFactor: 0.1 };

      const delays = Array.from({ length: 10 }, () =>
        retryService.calculateRetryDelay(2, config),
      );

      // Delays should vary due to jitter
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });
  });

  describe('shouldRetry', () => {
    it('should not retry after max attempts', () => {
      const config = { ...DEFAULT_RETRY_CONFIG, maxAttempts: 3 };
      const attempts = [
        { attemptNumber: 0, timestamp: Date.now(), statusCode: 500 },
        { attemptNumber: 1, timestamp: Date.now(), statusCode: 500 },
        { attemptNumber: 2, timestamp: Date.now(), statusCode: 500 },
      ];

      const shouldRetry = retryService.shouldRetry(attempts, config, 500);

      expect(shouldRetry).toBe(false);
    });

    it('should retry on 5xx errors', () => {
      const config = DEFAULT_RETRY_CONFIG;
      const attempts = [{ attemptNumber: 0, timestamp: Date.now(), statusCode: 500 }];

      const shouldRetry = retryService.shouldRetry(attempts, config, 500);

      expect(shouldRetry).toBe(true);
    });

    it('should not retry on 4xx errors (except 408, 429)', () => {
      const config = DEFAULT_RETRY_CONFIG;
      const attempts = [{ attemptNumber: 0, timestamp: Date.now(), statusCode: 404 }];

      const shouldRetry = retryService.shouldRetry(attempts, config, 404);

      expect(shouldRetry).toBe(false);
    });

    it('should retry on 429 rate limit', () => {
      const config = DEFAULT_RETRY_CONFIG;
      const attempts = [{ attemptNumber: 0, timestamp: Date.now(), statusCode: 429 }];

      const shouldRetry = retryService.shouldRetry(attempts, config, 429);

      expect(shouldRetry).toBe(true);
    });

    it('should not retry on 2xx success', () => {
      const config = DEFAULT_RETRY_CONFIG;
      const attempts = [{ attemptNumber: 0, timestamp: Date.now(), statusCode: 200 }];

      const shouldRetry = retryService.shouldRetry(attempts, config, 200);

      expect(shouldRetry).toBe(false);
    });
  });

  describe('getRetryStrategy', () => {
    it('should provide retry strategy information', () => {
      const config = { ...DEFAULT_RETRY_CONFIG, maxAttempts: 5 };
      const attempts = [
        { attemptNumber: 0, timestamp: Date.now() - 2000, statusCode: 500 },
        { attemptNumber: 1, timestamp: Date.now(), statusCode: 500 },
      ];

      const strategy = retryService.getRetryStrategy(attempts, config);

      expect(strategy.currentAttempt).toBe(2);
      expect(strategy.maxAttempts).toBe(5);
      expect(strategy.remainingAttempts).toBe(3);
      expect(strategy.canRetry).toBe(true);
      expect(strategy.nextRetryDelay).toBeGreaterThan(0);
    });
  });

  describe('validateRetryConfig', () => {
    it('should accept valid configuration', () => {
      expect(() => {
        retryService.validateRetryConfig(DEFAULT_RETRY_CONFIG);
      }).not.toThrow();
    });

    it('should reject invalid maxAttempts', () => {
      const config = { ...DEFAULT_RETRY_CONFIG, maxAttempts: 0 };

      expect(() => {
        retryService.validateRetryConfig(config);
      }).toThrow('maxAttempts must be at least 1');
    });

    it('should reject invalid backoff multiplier', () => {
      const config = { ...DEFAULT_RETRY_CONFIG, backoffMultiplier: 0.5 };

      expect(() => {
        retryService.validateRetryConfig(config);
      }).toThrow('backoffMultiplier must be at least 1');
    });
  });
});

describe('Webhook Queue', () => {
  let queue: WebhookQueue;
  let testTarget: WebhookTarget;
  let testDelivery: any;

  beforeEach(() => {
    queue = new WebhookQueue();
    testTarget = {
      id: 'target-1',
      name: 'Test Target',
      url: 'https://example.com/webhook',
      secret: 'test-secret',
      enabled: true,
      eventFilters: [],
      timeout: 30000,
      retryConfig: DEFAULT_RETRY_CONFIG,
      rateLimitConfig: {
        requestsPerSecond: 10,
        burstSize: 20,
        enabled: false,
      },
    };
    testDelivery = {
      id: 'delivery-1',
      targetId: testTarget.id,
      payload: {
        id: 'event-1',
        eventType: WebhookEventType.OPTIMIZATION_COMPLETED,
        timestamp: Date.now(),
        source: 'test',
        data: {},
        version: '1.0',
      },
      status: WebhookDeliveryStatus.PENDING,
      attempts: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      signature: 'test-sig',
    };
  });

  describe('enqueue/dequeue', () => {
    it('should enqueue and dequeue items', () => {
      queue.enqueue(testDelivery, testTarget);

      expect(queue.size()).toBe(1);

      const item = queue.dequeue();

      expect(item).toBeDefined();
      expect(item?.delivery.id).toBe(testDelivery.id);
      expect(queue.size()).toBe(0);
    });

    it('should respect priority ordering', () => {
      const delivery2 = { ...testDelivery, id: 'delivery-2' };
      const delivery3 = { ...testDelivery, id: 'delivery-3' };

      queue.enqueue(testDelivery, testTarget, 1);
      queue.enqueue(delivery2, testTarget, 3); // Highest priority
      queue.enqueue(delivery3, testTarget, 2);

      const item1 = queue.dequeue();
      const item2 = queue.dequeue();
      const item3 = queue.dequeue();

      expect(item1?.delivery.id).toBe('delivery-2'); // Priority 3
      expect(item2?.delivery.id).toBe('delivery-3'); // Priority 2
      expect(item3?.delivery.id).toBe('delivery-1'); // Priority 1
    });

    it('should not dequeue items scheduled for future', () => {
      const futureDelivery = {
        ...testDelivery,
        nextRetryAt: Date.now() + 10000,
      };

      queue.enqueue(futureDelivery, testTarget);

      const item = queue.dequeue();

      expect(item).toBeNull();
      expect(queue.size()).toBe(1);
    });

    it('should skip disabled targets', () => {
      const disabledTarget = { ...testTarget, enabled: false };

      queue.enqueue(testDelivery, disabledTarget);

      const item = queue.dequeue();

      expect(item).toBeNull();
      expect(queue.size()).toBe(0);
    });
  });

  describe('rate limiting', () => {
    it('should enforce rate limits when enabled', () => {
      const rateLimitedTarget = {
        ...testTarget,
        rateLimitConfig: {
          requestsPerSecond: 2,
          burstSize: 2,
          enabled: true,
        },
      };

      // Enqueue 3 items
      queue.enqueue({ ...testDelivery, id: 'delivery-1' }, rateLimitedTarget);
      queue.enqueue({ ...testDelivery, id: 'delivery-2' }, rateLimitedTarget);
      queue.enqueue({ ...testDelivery, id: 'delivery-3' }, rateLimitedTarget);

      // Should get first 2 (burst size)
      const item1 = queue.dequeue();
      const item2 = queue.dequeue();
      const item3 = queue.dequeue(); // Should be rate limited

      expect(item1).toBeDefined();
      expect(item2).toBeDefined();
      expect(item3).toBeNull();
    });
  });

  describe('dead letter queue', () => {
    it('should move items to dead letter queue', () => {
      const item = {
        delivery: testDelivery,
        target: testTarget,
        priority: 0,
        scheduledFor: Date.now(),
      };

      queue.moveToDeadLetter(item);

      expect(queue.deadLetterSize()).toBe(1);
      expect(item.delivery.status).toBe(WebhookDeliveryStatus.DEAD_LETTER);
    });

    it('should retry dead letter items', () => {
      const item = {
        delivery: testDelivery,
        target: testTarget,
        priority: 0,
        scheduledFor: Date.now(),
      };

      queue.moveToDeadLetter(item);
      const retried = queue.retryDeadLetter(testDelivery.id);

      expect(retried).toBe(true);
      expect(queue.deadLetterSize()).toBe(0);
      expect(queue.size()).toBe(1);
    });
  });

  describe('statistics', () => {
    it('should provide queue statistics', () => {
      queue.enqueue(testDelivery, testTarget, 1);
      queue.enqueue({ ...testDelivery, id: 'delivery-2' }, testTarget, 2);

      const stats = queue.getStatistics();

      expect(stats.queueSize).toBe(2);
      expect(stats.processingCount).toBe(0);
      expect(stats.deadLetterSize).toBe(0);
      expect(stats.byPriority.get(1)).toBe(1);
      expect(stats.byPriority.get(2)).toBe(1);
    });
  });
});

describe('Webhook Client Integration', () => {
  let client: WebhookClient;
  let testTarget: WebhookTarget;

  beforeEach(() => {
    client = new WebhookClient();
    testTarget = {
      id: 'target-1',
      name: 'Test Target',
      url: 'https://api.example.com/webhook',
      secret: 'test-secret-key',
      enabled: true,
      eventFilters: [WebhookEventType.OPTIMIZATION_COMPLETED],
      timeout: 5000,
      retryConfig: { ...DEFAULT_RETRY_CONFIG, maxAttempts: 2 },
      rateLimitConfig: {
        requestsPerSecond: 10,
        burstSize: 20,
        enabled: false,
      },
    };

    client.registerTarget(testTarget);
    nock.cleanAll();
  });

  afterEach(() => {
    client.stop();
    nock.cleanAll();
  });

  describe('send', () => {
    it('should successfully send webhook', async () => {
      nock('https://api.example.com')
        .post('/webhook')
        .reply(200, { success: true });

      const deliveryIds = await client.send(
        WebhookEventType.OPTIMIZATION_COMPLETED,
        { test: 'data' },
      );

      expect(deliveryIds).toHaveLength(1);
      expect(deliveryIds[0]).toBeDefined();

      // Start processing
      client.start();

      // Wait for delivery
      await new Promise(resolve => setTimeout(resolve, 500));

      const delivery = client.getDelivery(deliveryIds[0]);
      expect(delivery?.status).toBe(WebhookDeliveryStatus.DELIVERED);
    });

    it('should filter events by target configuration', async () => {
      const deliveryIds = await client.send(
        WebhookEventType.COST_ALERT, // Not in eventFilters
        { cost: 100 },
      );

      expect(deliveryIds).toHaveLength(0);
    });

    it('should skip disabled targets', async () => {
      testTarget.enabled = false;
      client.registerTarget(testTarget);

      const deliveryIds = await client.send(
        WebhookEventType.OPTIMIZATION_COMPLETED,
        { test: 'data' },
      );

      expect(deliveryIds).toHaveLength(0);
    });
  });

  describe('retry logic', () => {
    it('should retry on server errors', async () => {
      nock('https://api.example.com')
        .post('/webhook')
        .times(2)
        .reply(500, 'Server Error');

      const deliveryIds = await client.send(
        WebhookEventType.OPTIMIZATION_COMPLETED,
        { test: 'data' },
      );

      client.start();
      await new Promise(resolve => setTimeout(resolve, 3000));

      const delivery = client.getDelivery(deliveryIds[0]);
      expect(delivery?.attempts.length).toBeGreaterThan(1);
    });

    it('should move to dead letter after max retries', async () => {
      nock('https://api.example.com')
        .post('/webhook')
        .times(3)
        .reply(500, 'Server Error');

      const deliveryIds = await client.send(
        WebhookEventType.OPTIMIZATION_COMPLETED,
        { test: 'data' },
      );

      client.start();
      await new Promise(resolve => setTimeout(resolve, 5000));

      const delivery = client.getDelivery(deliveryIds[0]);
      expect(delivery?.status).toBe(WebhookDeliveryStatus.DEAD_LETTER);
    });
  });

  describe('statistics', () => {
    it('should track delivery statistics', async () => {
      nock('https://api.example.com')
        .post('/webhook')
        .reply(200, { success: true });

      await client.send(WebhookEventType.OPTIMIZATION_COMPLETED, { test: 'data' });

      client.start();
      await new Promise(resolve => setTimeout(resolve, 500));

      const stats = client.getStatistics();

      expect(stats.totalDeliveries).toBe(1);
      expect(stats.successfulDeliveries).toBe(1);
      expect(stats.successRate).toBe(1);
    });
  });
});
