/**
 * Performance and Load Tests
 * Performance testing and benchmarking for all integrations
 */

import { WebhookClient, WebhookEventType } from '../../src/integrations/webhooks';
import { WebhookQueue } from '../../src/integrations/webhooks/webhook-queue';
import { webhookRetryService } from '../../src/integrations/webhooks/webhook-retry';
import nock from 'nock';

describe('Performance Tests', () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('Webhook Queue Performance', () => {
    it('should handle high volume of queued items efficiently', () => {
      const queue = new WebhookQueue();
      const itemCount = 10000;

      const testTarget = {
        id: 'perf-target',
        name: 'Performance Test',
        url: 'https://example.com/webhook',
        secret: 'test-secret',
        enabled: true,
        eventFilters: [] as any[],
        timeout: 5000,
        retryConfig: {
          maxAttempts: 3,
          initialDelayMs: 1000,
          maxDelayMs: 10000,
          backoffMultiplier: 2,
          jitterFactor: 0.1,
        },
        rateLimitConfig: {
          requestsPerSecond: 100,
          burstSize: 200,
          enabled: false,
        },
      };

      // Measure enqueue performance
      const enqueueStart = Date.now();

      for (let i = 0; i < itemCount; i++) {
        const delivery = {
          id: `delivery-${i}`,
          targetId: testTarget.id,
          payload: {
            id: `event-${i}`,
            eventType: WebhookEventType.OPTIMIZATION_COMPLETED,
            timestamp: Date.now(),
            source: 'test',
            data: { iteration: i },
            version: '1.0',
          },
          status: 'pending' as any,
          attempts: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          signature: 'sig',
        };

        queue.enqueue(delivery, testTarget, i % 3);
      }

      const enqueueTime = Date.now() - enqueueStart;

      expect(queue.size()).toBe(itemCount);
      expect(enqueueTime).toBeLessThan(5000); // Should complete in < 5 seconds

      const opsPerSecond = itemCount / (enqueueTime / 1000);
      console.log(`Enqueue performance: ${opsPerSecond.toFixed(0)} ops/sec`);

      // Measure dequeue performance
      const dequeueStart = Date.now();
      let dequeued = 0;

      for (let i = 0; i < Math.min(1000, itemCount); i++) {
        const item = queue.dequeue();
        if (item) {
          dequeued++;
          queue.complete(item.delivery.id);
        }
      }

      const dequeueTime = Date.now() - dequeueStart;

      expect(dequeued).toBe(1000);
      expect(dequeueTime).toBeLessThan(2000); // Should complete in < 2 seconds

      const dequeueOpsPerSecond = dequeued / (dequeueTime / 1000);
      console.log(`Dequeue performance: ${dequeueOpsPerSecond.toFixed(0)} ops/sec`);
    });

    it('should efficiently handle priority queue operations', () => {
      const queue = new WebhookQueue();
      const itemCount = 5000;

      const testTarget = {
        id: 'priority-target',
        name: 'Priority Test',
        url: 'https://example.com/webhook',
        secret: 'test-secret',
        enabled: true,
        eventFilters: [] as any[],
        timeout: 5000,
        retryConfig: {
          maxAttempts: 3,
          initialDelayMs: 1000,
          maxDelayMs: 10000,
          backoffMultiplier: 2,
          jitterFactor: 0.1,
        },
        rateLimitConfig: {
          requestsPerSecond: 100,
          burstSize: 200,
          enabled: false,
        },
      };

      const start = Date.now();

      // Add items with random priorities
      for (let i = 0; i < itemCount; i++) {
        const delivery = {
          id: `delivery-${i}`,
          targetId: testTarget.id,
          payload: {
            id: `event-${i}`,
            eventType: WebhookEventType.OPTIMIZATION_COMPLETED,
            timestamp: Date.now(),
            source: 'test',
            data: {},
            version: '1.0',
          },
          status: 'pending' as any,
          attempts: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          signature: 'sig',
        };

        const priority = Math.floor(Math.random() * 10);
        queue.enqueue(delivery, testTarget, priority);
      }

      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(3000); // Should handle 5k items in < 3s
      expect(queue.size()).toBe(itemCount);

      // Verify items are ordered by priority
      const item1 = queue.dequeue();
      const item2 = queue.dequeue();

      expect(item1).toBeDefined();
      expect(item2).toBeDefined();

      if (item1 && item2) {
        expect(item1.priority).toBeGreaterThanOrEqual(item2.priority);
      }
    });
  });

  describe('Retry Calculation Performance', () => {
    it('should calculate retry delays efficiently', () => {
      const iterations = 100000;
      const config = {
        maxAttempts: 5,
        initialDelayMs: 1000,
        maxDelayMs: 60000,
        backoffMultiplier: 2,
        jitterFactor: 0.1,
      };

      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        const attemptNumber = i % 5;
        webhookRetryService.calculateRetryDelay(attemptNumber, config);
      }

      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(1000); // 100k calculations in < 1s

      const opsPerSecond = iterations / (elapsed / 1000);
      console.log(`Retry calculation performance: ${opsPerSecond.toFixed(0)} ops/sec`);
    });
  });

  describe('Concurrent Webhook Delivery', () => {
    it('should handle concurrent deliveries without blocking', async () => {
      const webhookClient = new WebhookClient({
        userAgent: 'test',
        defaultTimeout: 5000,
        maxConcurrentDeliveries: 50,
        queueCheckInterval: 100,
        deadLetterThreshold: 5,
        enableMetrics: true,
      });

      const target = {
        id: 'concurrent-target',
        name: 'Concurrent Test',
        url: 'https://api.example.com/webhook',
        secret: 'test-secret',
        enabled: true,
        eventFilters: [WebhookEventType.OPTIMIZATION_COMPLETED],
        timeout: 5000,
        retryConfig: {
          maxAttempts: 1,
          initialDelayMs: 100,
          maxDelayMs: 1000,
          backoffMultiplier: 2,
          jitterFactor: 0.1,
        },
        rateLimitConfig: {
          requestsPerSecond: 100,
          burstSize: 200,
          enabled: false,
        },
      };

      webhookClient.registerTarget(target);

      // Mock 100 successful webhook responses
      nock('https://api.example.com')
        .post('/webhook')
        .times(100)
        .reply(200, { success: true });

      const deliveryPromises: Promise<string[]>[] = [];
      const start = Date.now();

      // Send 100 webhooks concurrently
      for (let i = 0; i < 100; i++) {
        const promise = webhookClient.send(WebhookEventType.OPTIMIZATION_COMPLETED, {
          iteration: i,
        });
        deliveryPromises.push(promise);
      }

      const deliveryIds = await Promise.all(deliveryPromises);
      const sendTime = Date.now() - start;

      expect(deliveryIds.length).toBe(100);
      expect(sendTime).toBeLessThan(2000); // Should enqueue quickly

      // Start processing
      webhookClient.start();

      // Wait for all deliveries to complete
      await new Promise(resolve => setTimeout(resolve, 3000));

      webhookClient.stop();

      const stats = webhookClient.getStatistics();

      expect(stats.totalDeliveries).toBe(100);
      expect(stats.averageResponseTime).toBeLessThan(1000);

      console.log(`Concurrent delivery stats:`, {
        total: stats.totalDeliveries,
        successful: stats.successfulDeliveries,
        avgResponseTime: stats.averageResponseTime.toFixed(2) + 'ms',
      });
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory with continuous operations', () => {
      const queue = new WebhookQueue();
      const testTarget = {
        id: 'memory-target',
        name: 'Memory Test',
        url: 'https://example.com/webhook',
        secret: 'test-secret',
        enabled: true,
        eventFilters: [] as any[],
        timeout: 5000,
        retryConfig: {
          maxAttempts: 3,
          initialDelayMs: 1000,
          maxDelayMs: 10000,
          backoffMultiplier: 2,
          jitterFactor: 0.1,
        },
        rateLimitConfig: {
          requestsPerSecond: 100,
          burstSize: 200,
          enabled: false,
        },
      };

      const initialMemory = process.memoryUsage().heapUsed;

      // Perform 10k enqueue/dequeue cycles
      for (let cycle = 0; cycle < 10; cycle++) {
        for (let i = 0; i < 1000; i++) {
          const delivery = {
            id: `delivery-${cycle}-${i}`,
            targetId: testTarget.id,
            payload: {
              id: `event-${i}`,
              eventType: WebhookEventType.OPTIMIZATION_COMPLETED,
              timestamp: Date.now(),
              source: 'test',
              data: {},
              version: '1.0',
            },
            status: 'pending' as any,
            attempts: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            signature: 'sig',
          };

          queue.enqueue(delivery, testTarget);
        }

        // Dequeue all items
        while (queue.size() > 0) {
          const item = queue.dequeue();
          if (item) {
            queue.complete(item.delivery.id);
          }
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const memoryIncreaseMB = memoryIncrease / (1024 * 1024);

      console.log(`Memory increase: ${memoryIncreaseMB.toFixed(2)} MB`);

      // Memory increase should be reasonable (< 50MB for 10k operations)
      expect(memoryIncreaseMB).toBeLessThan(50);
    });
  });

  describe('Rate Limiting Performance', () => {
    it('should efficiently enforce rate limits', () => {
      const queue = new WebhookQueue();
      const rateLimitedTarget = {
        id: 'rate-limited',
        name: 'Rate Limited',
        url: 'https://example.com/webhook',
        secret: 'test-secret',
        enabled: true,
        eventFilters: [] as any[],
        timeout: 5000,
        retryConfig: {
          maxAttempts: 3,
          initialDelayMs: 1000,
          maxDelayMs: 10000,
          backoffMultiplier: 2,
          jitterFactor: 0.1,
        },
        rateLimitConfig: {
          requestsPerSecond: 100,
          burstSize: 200,
          enabled: true,
        },
      };

      const iterations = 1000;
      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        const delivery = {
          id: `delivery-${i}`,
          targetId: rateLimitedTarget.id,
          payload: {
            id: `event-${i}`,
            eventType: WebhookEventType.OPTIMIZATION_COMPLETED,
            timestamp: Date.now(),
            source: 'test',
            data: {},
            version: '1.0',
          },
          status: 'pending' as any,
          attempts: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          signature: 'sig',
        };

        queue.enqueue(delivery, rateLimitedTarget);
      }

      // Attempt to dequeue with rate limiting
      let dequeued = 0;
      for (let i = 0; i < 300; i++) {
        const item = queue.dequeue();
        if (item) {
          dequeued++;
          queue.complete(item.delivery.id);
        }
      }

      const elapsed = Date.now() - start;

      // Should respect burst size (200)
      expect(dequeued).toBeLessThanOrEqual(200);

      // Performance should still be good
      expect(elapsed).toBeLessThan(2000);

      console.log(`Rate limiting: dequeued ${dequeued} items in ${elapsed}ms`);
    });
  });
});
