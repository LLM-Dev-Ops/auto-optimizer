/**
 * Webhook Client
 * Main delivery system with tracking, retries, and monitoring
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import {
  WebhookPayload,
  WebhookTarget,
  WebhookDelivery,
  WebhookDeliveryResult,
  WebhookDeliveryStatus,
  WebhookDeliveryAttempt,
  WebhookEventType,
  WebhookClientConfig,
  WebhookError,
  WebhookErrorType,
  WebhookStatistics,
  DEFAULT_CLIENT_CONFIG,
} from './webhook-types';
import { webhookSignatureService } from './webhook-signatures';
import { webhookRetryService } from './webhook-retry';
import { WebhookQueue } from './webhook-queue';

/**
 * Webhook delivery client with full tracking and retry support
 */
export class WebhookClient {
  private httpClient: AxiosInstance;
  private queue: WebhookQueue;
  private targets: Map<string, WebhookTarget> = new Map();
  private deliveries: Map<string, WebhookDelivery> = new Map();
  private statistics: Map<string, number> = new Map();
  private processingLoop?: NodeJS.Timer;

  constructor(private config: WebhookClientConfig = DEFAULT_CLIENT_CONFIG) {
    this.httpClient = axios.create({
      timeout: config.defaultTimeout,
      headers: {
        'User-Agent': config.userAgent,
        'Content-Type': 'application/json',
      },
      validateStatus: () => true, // Handle all status codes ourselves
    });

    this.queue = new WebhookQueue();
  }

  /**
   * Register webhook target
   *
   * @param target - Webhook target configuration
   */
  public registerTarget(target: WebhookTarget): void {
    if (!target.url || !target.secret) {
      throw new WebhookError(
        'Target must have url and secret',
        WebhookErrorType.VALIDATION_ERROR,
        undefined,
        false,
      );
    }

    this.targets.set(target.id, target);
  }

  /**
   * Unregister webhook target
   *
   * @param targetId - Target identifier
   */
  public unregisterTarget(targetId: string): void {
    this.targets.delete(targetId);
    this.queue.clearTarget(targetId);
  }

  /**
   * Send webhook to all matching targets
   *
   * @param eventType - Event type
   * @param data - Event data
   * @param options - Optional delivery options
   * @returns Array of delivery IDs
   */
  public async send<T = unknown>(
    eventType: WebhookEventType,
    data: T,
    options: {
      correlationId?: string;
      metadata?: Record<string, unknown>;
      priority?: number;
      targets?: string[];
    } = {},
  ): Promise<string[]> {
    const payload = this.createPayload(eventType, data, options);
    const deliveryIds: string[] = [];

    // Find matching targets
    const targets = this.getMatchingTargets(eventType, options.targets);

    for (const target of targets) {
      const delivery = this.createDelivery(payload, target);
      this.deliveries.set(delivery.id, delivery);

      // Add to queue
      const priority = options.priority || 0;
      this.queue.enqueue(delivery, target, priority);

      deliveryIds.push(delivery.id);
    }

    return deliveryIds;
  }

  /**
   * Start processing queue
   */
  public start(): void {
    if (this.processingLoop) {
      return;
    }

    this.processingLoop = setInterval(
      () => this.processQueue(),
      this.config.queueCheckInterval,
    );
  }

  /**
   * Stop processing queue
   */
  public stop(): void {
    if (this.processingLoop) {
      clearInterval(this.processingLoop);
      this.processingLoop = undefined;
    }
  }

  /**
   * Process webhook queue
   */
  private async processQueue(): Promise<void> {
    const concurrentLimit = this.config.maxConcurrentDeliveries;
    const processing = this.queue.processingCount();

    // Process up to concurrent limit
    const available = concurrentLimit - processing;
    for (let i = 0; i < available; i++) {
      const item = this.queue.dequeue();
      if (!item) {
        break;
      }

      // Process delivery asynchronously
      this.deliverWebhook(item.delivery, item.target)
        .then(result => this.handleDeliveryResult(result, item))
        .catch(error => this.handleDeliveryError(error, item));
    }
  }

  /**
   * Deliver webhook to target
   *
   * @param delivery - Webhook delivery
   * @param target - Webhook target
   * @returns Delivery result
   */
  private async deliverWebhook(
    delivery: WebhookDelivery,
    target: WebhookTarget,
  ): Promise<WebhookDeliveryResult> {
    const startTime = Date.now();
    const attemptNumber = delivery.attempts.length;

    try {
      // Generate signature
      const signatureHeaders = webhookSignatureService.createSignatureHeaders(
        delivery.payload,
        target.secret,
      );

      // Merge headers
      const headers = {
        ...signatureHeaders,
        ...target.headers,
      };

      // Send request
      const response = await this.httpClient.post(target.url, delivery.payload, {
        headers,
        timeout: target.timeout,
      });

      const responseTime = Date.now() - startTime;

      // Create attempt record
      const attempt: WebhookDeliveryAttempt = {
        attemptNumber,
        timestamp: Date.now(),
        statusCode: response.status,
        responseTime,
      };

      delivery.attempts.push(attempt);

      // Check if successful
      const success = response.status >= 200 && response.status < 300;

      // Extract Retry-After header if present
      const retryAfter = response.headers['retry-after']
        ? parseInt(response.headers['retry-after'], 10)
        : undefined;

      return {
        success,
        deliveryId: delivery.id,
        targetId: target.id,
        statusCode: response.status,
        responseTime,
        attemptNumber,
        willRetry: !success && webhookRetryService.shouldRetry(delivery.attempts, target.retryConfig, response.status),
        nextRetryAt: retryAfter,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const axiosError = error as AxiosError;

      // Create error attempt
      const attempt: WebhookDeliveryAttempt = {
        attemptNumber,
        timestamp: Date.now(),
        responseTime,
        error: axiosError.message,
        statusCode: axiosError.response?.status,
      };

      delivery.attempts.push(attempt);

      // Determine error type
      const errorType = this.classifyError(axiosError);
      const willRetry = webhookRetryService.shouldRetry(
        delivery.attempts,
        target.retryConfig,
        axiosError.response?.status,
      );

      return {
        success: false,
        deliveryId: delivery.id,
        targetId: target.id,
        statusCode: axiosError.response?.status,
        responseTime,
        attemptNumber,
        error: axiosError.message,
        willRetry,
      };
    }
  }

  /**
   * Handle delivery result
   *
   * @param result - Delivery result
   * @param item - Queue item
   */
  private handleDeliveryResult(result: WebhookDeliveryResult, item: any): void {
    const delivery = this.deliveries.get(result.deliveryId);
    if (!delivery) {
      return;
    }

    if (result.success) {
      // Mark as delivered
      delivery.status = WebhookDeliveryStatus.DELIVERED;
      delivery.completedAt = Date.now();
      delivery.updatedAt = Date.now();
      this.queue.complete(result.deliveryId);

      // Update statistics
      this.updateStatistics(result.targetId, 'success');
    } else if (result.willRetry) {
      // Schedule retry
      const nextRetryAt = webhookRetryService.calculateNextRetryTime(
        Date.now(),
        result.attemptNumber,
        item.target.retryConfig,
        result.nextRetryAt,
      );

      delivery.nextRetryAt = nextRetryAt;
      delivery.updatedAt = Date.now();
      this.queue.requeueForRetry(item, nextRetryAt);
    } else {
      // Move to dead letter queue
      delivery.status = WebhookDeliveryStatus.DEAD_LETTER;
      delivery.updatedAt = Date.now();
      this.queue.moveToDeadLetter(item);

      // Update statistics
      this.updateStatistics(result.targetId, 'dead_letter');
    }
  }

  /**
   * Handle delivery error
   *
   * @param error - Error object
   * @param item - Queue item
   */
  private handleDeliveryError(error: Error, item: any): void {
    console.error('Webhook delivery error:', error);
    this.queue.complete(item.delivery.id);
  }

  /**
   * Create webhook payload
   *
   * @param eventType - Event type
   * @param data - Event data
   * @param options - Optional metadata
   * @returns Webhook payload
   */
  private createPayload<T>(
    eventType: WebhookEventType,
    data: T,
    options: { correlationId?: string; metadata?: Record<string, unknown> } = {},
  ): WebhookPayload<T> {
    return {
      id: uuidv4(),
      eventType,
      timestamp: Date.now(),
      source: 'llm-auto-optimizer',
      data,
      version: '1.0',
      correlationId: options.correlationId,
      metadata: options.metadata,
    };
  }

  /**
   * Create delivery record
   *
   * @param payload - Webhook payload
   * @param target - Webhook target
   * @returns Webhook delivery
   */
  private createDelivery(payload: WebhookPayload, target: WebhookTarget): WebhookDelivery {
    const signature = webhookSignatureService.generateSignature(payload, target.secret);

    return {
      id: uuidv4(),
      targetId: target.id,
      payload,
      status: WebhookDeliveryStatus.PENDING,
      attempts: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      signature: signature.signature,
    };
  }

  /**
   * Get matching targets for event type
   *
   * @param eventType - Event type
   * @param targetIds - Optional specific target IDs
   * @returns Array of matching targets
   */
  private getMatchingTargets(eventType: WebhookEventType, targetIds?: string[]): WebhookTarget[] {
    const targets: WebhookTarget[] = [];

    for (const [id, target] of this.targets) {
      // Skip disabled targets
      if (!target.enabled) {
        continue;
      }

      // Filter by target IDs if specified
      if (targetIds && !targetIds.includes(id)) {
        continue;
      }

      // Check event filter
      if (target.eventFilters.length > 0 && !target.eventFilters.includes(eventType)) {
        continue;
      }

      targets.push(target);
    }

    return targets;
  }

  /**
   * Classify error type
   *
   * @param error - Axios error
   * @returns Webhook error type
   */
  private classifyError(error: AxiosError): WebhookErrorType {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return WebhookErrorType.TIMEOUT_ERROR;
    }

    if (error.response?.status === 429) {
      return WebhookErrorType.RATE_LIMIT_EXCEEDED;
    }

    if (!error.response) {
      return WebhookErrorType.NETWORK_ERROR;
    }

    return WebhookErrorType.INVALID_RESPONSE;
  }

  /**
   * Update statistics
   *
   * @param targetId - Target identifier
   * @param type - Statistic type
   */
  private updateStatistics(targetId: string, type: string): void {
    const key = `${targetId}:${type}`;
    this.statistics.set(key, (this.statistics.get(key) || 0) + 1);
  }

  /**
   * Get delivery status
   *
   * @param deliveryId - Delivery identifier
   * @returns Delivery record or undefined
   */
  public getDelivery(deliveryId: string): WebhookDelivery | undefined {
    return this.deliveries.get(deliveryId);
  }

  /**
   * Get statistics
   *
   * @returns Webhook statistics
   */
  public getStatistics(): WebhookStatistics {
    const stats: WebhookStatistics = {
      totalDeliveries: this.deliveries.size,
      successfulDeliveries: 0,
      failedDeliveries: 0,
      pendingDeliveries: 0,
      deadLetterDeliveries: 0,
      averageResponseTime: 0,
      successRate: 0,
      byEventType: {} as Record<WebhookEventType, number>,
      byTarget: {},
    };

    let totalResponseTime = 0;
    let responseCount = 0;

    for (const delivery of this.deliveries.values()) {
      // Count by status
      if (delivery.status === WebhookDeliveryStatus.DELIVERED) {
        stats.successfulDeliveries++;
      } else if (delivery.status === WebhookDeliveryStatus.DEAD_LETTER) {
        stats.deadLetterDeliveries++;
      } else if (delivery.status === WebhookDeliveryStatus.PENDING) {
        stats.pendingDeliveries++;
      } else if (delivery.status === WebhookDeliveryStatus.FAILED) {
        stats.failedDeliveries++;
      }

      // Count by event type
      const eventType = delivery.payload.eventType;
      stats.byEventType[eventType] = (stats.byEventType[eventType] || 0) + 1;

      // Calculate response times
      for (const attempt of delivery.attempts) {
        if (attempt.responseTime) {
          totalResponseTime += attempt.responseTime;
          responseCount++;
        }
      }
    }

    stats.averageResponseTime = responseCount > 0 ? totalResponseTime / responseCount : 0;
    stats.successRate = stats.totalDeliveries > 0
      ? stats.successfulDeliveries / stats.totalDeliveries
      : 0;

    return stats;
  }

  /**
   * Clear all deliveries and reset queue
   */
  public clear(): void {
    this.deliveries.clear();
    this.queue.clear();
    this.statistics.clear();
  }
}

/**
 * Create webhook client instance
 *
 * @param config - Optional client configuration
 * @returns Webhook client
 */
export function createWebhookClient(config?: Partial<WebhookClientConfig>): WebhookClient {
  return new WebhookClient({ ...DEFAULT_CLIENT_CONFIG, ...config });
}
