/**
 * Webhook Queue Management
 * Priority queue with rate limiting and dead letter handling
 */

import {
  WebhookQueueItem,
  WebhookDelivery,
  WebhookTarget,
  WebhookDeliveryStatus,
  WebhookError,
  WebhookErrorType,
  WebhookRateLimitConfig,
} from './webhook-types';

/**
 * Rate limiter for webhook targets using token bucket algorithm
 */
class RateLimiter {
  private tokens: Map<string, { count: number; lastRefill: number }> = new Map();

  constructor(private config: WebhookRateLimitConfig) {}

  /**
   * Check if request is allowed and consume token
   *
   * @param targetId - Target identifier
   * @returns True if request is allowed
   */
  public tryAcquire(targetId: string): boolean {
    if (!this.config.enabled) {
      return true;
    }

    const now = Date.now();
    const bucket = this.tokens.get(targetId) || { count: this.config.burstSize, lastRefill: now };

    // Refill tokens based on time elapsed
    const elapsedMs = now - bucket.lastRefill;
    const tokensToAdd = (elapsedMs / 1000) * this.config.requestsPerSecond;
    bucket.count = Math.min(this.config.burstSize, bucket.count + tokensToAdd);
    bucket.lastRefill = now;

    // Try to consume a token
    if (bucket.count >= 1) {
      bucket.count -= 1;
      this.tokens.set(targetId, bucket);
      return true;
    }

    this.tokens.set(targetId, bucket);
    return false;
  }

  /**
   * Get time until next token is available
   *
   * @param targetId - Target identifier
   * @returns Milliseconds until next token
   */
  public getRetryAfter(targetId: string): number {
    if (!this.config.enabled) {
      return 0;
    }

    const bucket = this.tokens.get(targetId);
    if (!bucket) {
      return 0;
    }

    if (bucket.count >= 1) {
      return 0;
    }

    // Calculate time needed to accumulate 1 token
    const tokensNeeded = 1 - bucket.count;
    const msPerToken = 1000 / this.config.requestsPerSecond;
    return Math.ceil(tokensNeeded * msPerToken);
  }

  /**
   * Reset rate limiter for target
   *
   * @param targetId - Target identifier
   */
  public reset(targetId: string): void {
    this.tokens.delete(targetId);
  }
}

/**
 * Priority queue for webhook deliveries
 */
export class WebhookQueue {
  private queue: WebhookQueueItem[] = [];
  private rateLimiters: Map<string, RateLimiter> = new Map();
  private deadLetterQueue: WebhookQueueItem[] = [];
  private processing: Set<string> = new Set();

  /**
   * Add delivery to queue
   *
   * @param delivery - Webhook delivery
   * @param target - Webhook target
   * @param priority - Priority level (higher = more important)
   */
  public enqueue(delivery: WebhookDelivery, target: WebhookTarget, priority: number = 0): void {
    const item: WebhookQueueItem = {
      delivery,
      target,
      priority,
      scheduledFor: delivery.nextRetryAt || Date.now(),
    };

    this.queue.push(item);
    this.sortQueue();
  }

  /**
   * Get next delivery ready for processing
   *
   * @returns Next queue item or null if none ready
   */
  public dequeue(): WebhookQueueItem | null {
    const now = Date.now();

    for (let i = 0; i < this.queue.length; i++) {
      const item = this.queue[i];

      // Skip if already processing
      if (this.processing.has(item.delivery.id)) {
        continue;
      }

      // Skip if not scheduled yet
      if (item.scheduledFor > now) {
        continue;
      }

      // Skip if target disabled
      if (!item.target.enabled) {
        this.queue.splice(i, 1);
        continue;
      }

      // Check rate limiting
      const rateLimiter = this.getRateLimiter(item.target);
      if (!rateLimiter.tryAcquire(item.target.id)) {
        // Update scheduled time based on rate limit
        item.scheduledFor = now + rateLimiter.getRetryAfter(item.target.id);
        continue;
      }

      // Remove from queue and mark as processing
      this.queue.splice(i, 1);
      this.processing.add(item.delivery.id);
      return item;
    }

    return null;
  }

  /**
   * Mark delivery as completed
   *
   * @param deliveryId - Delivery identifier
   */
  public complete(deliveryId: string): void {
    this.processing.delete(deliveryId);
  }

  /**
   * Move delivery to dead letter queue
   *
   * @param item - Queue item to move
   */
  public moveToDeadLetter(item: WebhookQueueItem): void {
    this.processing.delete(item.delivery.id);
    item.delivery.status = WebhookDeliveryStatus.DEAD_LETTER;
    this.deadLetterQueue.push(item);
  }

  /**
   * Re-enqueue delivery for retry
   *
   * @param item - Queue item to re-enqueue
   * @param nextRetryAt - Timestamp for next retry
   */
  public requeueForRetry(item: WebhookQueueItem, nextRetryAt: number): void {
    this.processing.delete(item.delivery.id);
    item.scheduledFor = nextRetryAt;
    item.delivery.nextRetryAt = nextRetryAt;
    item.delivery.status = WebhookDeliveryStatus.PENDING;
    this.enqueue(item.delivery, item.target, item.priority);
  }

  /**
   * Get queue size
   *
   * @returns Number of items in queue
   */
  public size(): number {
    return this.queue.length;
  }

  /**
   * Get dead letter queue size
   *
   * @returns Number of items in dead letter queue
   */
  public deadLetterSize(): number {
    return this.deadLetterQueue.length;
  }

  /**
   * Get processing count
   *
   * @returns Number of deliveries currently processing
   */
  public processingCount(): number {
    return this.processing.size;
  }

  /**
   * Get queue items for specific target
   *
   * @param targetId - Target identifier
   * @returns Array of queue items
   */
  public getItemsForTarget(targetId: string): WebhookQueueItem[] {
    return this.queue.filter(item => item.target.id === targetId);
  }

  /**
   * Get dead letter items for specific target
   *
   * @param targetId - Target identifier
   * @returns Array of dead letter items
   */
  public getDeadLetterForTarget(targetId: string): WebhookQueueItem[] {
    return this.deadLetterQueue.filter(item => item.target.id === targetId);
  }

  /**
   * Clear queue for specific target
   *
   * @param targetId - Target identifier
   * @returns Number of items removed
   */
  public clearTarget(targetId: string): number {
    const initialSize = this.queue.length;
    this.queue = this.queue.filter(item => item.target.id !== targetId);
    return initialSize - this.queue.length;
  }

  /**
   * Clear all queues
   */
  public clear(): void {
    this.queue = [];
    this.deadLetterQueue = [];
    this.processing.clear();
    this.rateLimiters.clear();
  }

  /**
   * Get queue statistics
   *
   * @returns Queue statistics
   */
  public getStatistics(): {
    queueSize: number;
    processingCount: number;
    deadLetterSize: number;
    byTarget: Map<string, { pending: number; processing: number; deadLetter: number }>;
    byPriority: Map<number, number>;
  } {
    const byTarget = new Map<string, { pending: number; processing: number; deadLetter: number }>();
    const byPriority = new Map<number, number>();

    // Count pending items
    for (const item of this.queue) {
      const targetStats = byTarget.get(item.target.id) || { pending: 0, processing: 0, deadLetter: 0 };
      targetStats.pending++;
      byTarget.set(item.target.id, targetStats);

      byPriority.set(item.priority, (byPriority.get(item.priority) || 0) + 1);
    }

    // Count processing items
    for (const deliveryId of this.processing) {
      // Find target for processing item (requires searching queue or maintaining map)
      // For simplicity, just count total processing
    }

    // Count dead letter items
    for (const item of this.deadLetterQueue) {
      const targetStats = byTarget.get(item.target.id) || { pending: 0, processing: 0, deadLetter: 0 };
      targetStats.deadLetter++;
      byTarget.set(item.target.id, targetStats);
    }

    return {
      queueSize: this.queue.length,
      processingCount: this.processing.size,
      deadLetterSize: this.deadLetterQueue.length,
      byTarget,
      byPriority,
    };
  }

  /**
   * Peek at next items without dequeuing
   *
   * @param count - Number of items to peek
   * @returns Array of next queue items
   */
  public peek(count: number = 10): WebhookQueueItem[] {
    return this.queue.slice(0, count);
  }

  /**
   * Get items ready for processing
   *
   * @returns Array of items ready to process
   */
  public getReadyItems(): WebhookQueueItem[] {
    const now = Date.now();
    return this.queue.filter(
      item => item.scheduledFor <= now && !this.processing.has(item.delivery.id) && item.target.enabled,
    );
  }

  /**
   * Sort queue by priority and scheduled time
   */
  private sortQueue(): void {
    this.queue.sort((a, b) => {
      // Higher priority first
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      // Earlier scheduled time first
      return a.scheduledFor - b.scheduledFor;
    });
  }

  /**
   * Get or create rate limiter for target
   *
   * @param target - Webhook target
   * @returns Rate limiter instance
   */
  private getRateLimiter(target: WebhookTarget): RateLimiter {
    let limiter = this.rateLimiters.get(target.id);
    if (!limiter) {
      limiter = new RateLimiter(target.rateLimitConfig);
      this.rateLimiters.set(target.id, limiter);
    }
    return limiter;
  }

  /**
   * Process dead letter queue
   * Allows manual retry of failed deliveries
   *
   * @param deliveryId - Delivery ID to retry
   * @returns True if found and re-enqueued
   */
  public retryDeadLetter(deliveryId: string): boolean {
    const index = this.deadLetterQueue.findIndex(item => item.delivery.id === deliveryId);
    if (index === -1) {
      return false;
    }

    const item = this.deadLetterQueue.splice(index, 1)[0];
    item.delivery.status = WebhookDeliveryStatus.PENDING;
    item.scheduledFor = Date.now();
    this.enqueue(item.delivery, item.target, item.priority);
    return true;
  }

  /**
   * Purge old dead letter items
   *
   * @param maxAgeMs - Maximum age in milliseconds
   * @returns Number of items purged
   */
  public purgeDeadLetter(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs;
    const initialSize = this.deadLetterQueue.length;
    this.deadLetterQueue = this.deadLetterQueue.filter(
      item => item.delivery.createdAt > cutoff,
    );
    return initialSize - this.deadLetterQueue.length;
  }
}

/**
 * Singleton instance
 */
export const webhookQueue = new WebhookQueue();
