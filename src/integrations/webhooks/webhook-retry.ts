/**
 * Webhook Retry Logic
 * Exponential backoff retry system with jitter
 */

import {
  WebhookRetryConfig,
  WebhookDeliveryAttempt,
  WebhookError,
  WebhookErrorType,
  DEFAULT_RETRY_CONFIG,
} from './webhook-types';

/**
 * Retry strategy service for webhook deliveries
 */
export class WebhookRetryService {
  /**
   * Calculate next retry delay using exponential backoff with jitter
   *
   * @param attemptNumber - Current attempt number (0-indexed)
   * @param config - Retry configuration
   * @returns Delay in milliseconds before next retry
   */
  public calculateRetryDelay(attemptNumber: number, config: WebhookRetryConfig): number {
    const { initialDelayMs, maxDelayMs, backoffMultiplier, jitterFactor } = config;

    // Calculate base delay with exponential backoff
    const exponentialDelay = initialDelayMs * Math.pow(backoffMultiplier, attemptNumber);

    // Cap at maximum delay
    const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

    // Add jitter to prevent thundering herd
    const jitter = this.calculateJitter(cappedDelay, jitterFactor);
    const finalDelay = cappedDelay + jitter;

    return Math.floor(finalDelay);
  }

  /**
   * Determine if retry should be attempted
   *
   * @param attempts - Array of previous delivery attempts
   * @param config - Retry configuration
   * @param statusCode - HTTP status code from last attempt
   * @returns True if retry should be attempted
   */
  public shouldRetry(
    attempts: WebhookDeliveryAttempt[],
    config: WebhookRetryConfig,
    statusCode?: number,
  ): boolean {
    // Check if max attempts reached
    if (attempts.length >= config.maxAttempts) {
      return false;
    }

    // Don't retry client errors (4xx) except specific cases
    if (statusCode) {
      if (statusCode >= 400 && statusCode < 500) {
        // Retry rate limiting and timeout errors
        const retryableClientErrors = [408, 429];
        if (!retryableClientErrors.includes(statusCode)) {
          return false;
        }
      }

      // Retry server errors (5xx)
      if (statusCode >= 500 && statusCode < 600) {
        return true;
      }

      // Success (2xx) - no retry needed
      if (statusCode >= 200 && statusCode < 300) {
        return false;
      }
    }

    // Retry network errors and timeouts
    return true;
  }

  /**
   * Calculate next retry timestamp
   *
   * @param lastAttemptTime - Timestamp of last attempt
   * @param attemptNumber - Current attempt number
   * @param config - Retry configuration
   * @param retryAfter - Optional Retry-After header value (seconds or timestamp)
   * @returns Timestamp for next retry
   */
  public calculateNextRetryTime(
    lastAttemptTime: number,
    attemptNumber: number,
    config: WebhookRetryConfig,
    retryAfter?: number,
  ): number {
    // Honor Retry-After header if provided
    if (retryAfter) {
      const retryAfterMs = this.parseRetryAfter(retryAfter, lastAttemptTime);
      if (retryAfterMs > 0) {
        return lastAttemptTime + retryAfterMs;
      }
    }

    // Calculate exponential backoff delay
    const delay = this.calculateRetryDelay(attemptNumber, config);
    return lastAttemptTime + delay;
  }

  /**
   * Get retry strategy summary
   *
   * @param attempts - Array of delivery attempts
   * @param config - Retry configuration
   * @returns Retry strategy information
   */
  public getRetryStrategy(
    attempts: WebhookDeliveryAttempt[],
    config: WebhookRetryConfig,
  ): {
    currentAttempt: number;
    maxAttempts: number;
    remainingAttempts: number;
    nextRetryDelay?: number;
    totalElapsedTime: number;
    canRetry: boolean;
  } {
    const currentAttempt = attempts.length;
    const maxAttempts = config.maxAttempts;
    const remainingAttempts = Math.max(0, maxAttempts - currentAttempt);

    const lastAttempt = attempts[attempts.length - 1];
    const canRetry = this.shouldRetry(attempts, config, lastAttempt?.statusCode);

    const nextRetryDelay = canRetry
      ? this.calculateRetryDelay(currentAttempt, config)
      : undefined;

    const totalElapsedTime = attempts.length > 0
      ? attempts[attempts.length - 1].timestamp - attempts[0].timestamp
      : 0;

    return {
      currentAttempt,
      maxAttempts,
      remainingAttempts,
      nextRetryDelay,
      totalElapsedTime,
      canRetry,
    };
  }

  /**
   * Create exponential backoff schedule
   *
   * @param config - Retry configuration
   * @returns Array of delay values for each retry attempt
   */
  public createBackoffSchedule(config: WebhookRetryConfig): number[] {
    const schedule: number[] = [];

    for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
      const delay = this.calculateRetryDelay(attempt, config);
      schedule.push(delay);
    }

    return schedule;
  }

  /**
   * Validate retry configuration
   *
   * @param config - Retry configuration to validate
   * @throws WebhookError if configuration is invalid
   */
  public validateRetryConfig(config: WebhookRetryConfig): void {
    if (config.maxAttempts < 1) {
      throw new WebhookError(
        'maxAttempts must be at least 1',
        WebhookErrorType.VALIDATION_ERROR,
        undefined,
        false,
      );
    }

    if (config.initialDelayMs < 0) {
      throw new WebhookError(
        'initialDelayMs must be non-negative',
        WebhookErrorType.VALIDATION_ERROR,
        undefined,
        false,
      );
    }

    if (config.maxDelayMs < config.initialDelayMs) {
      throw new WebhookError(
        'maxDelayMs must be greater than or equal to initialDelayMs',
        WebhookErrorType.VALIDATION_ERROR,
        undefined,
        false,
      );
    }

    if (config.backoffMultiplier < 1) {
      throw new WebhookError(
        'backoffMultiplier must be at least 1',
        WebhookErrorType.VALIDATION_ERROR,
        undefined,
        false,
      );
    }

    if (config.jitterFactor < 0 || config.jitterFactor > 1) {
      throw new WebhookError(
        'jitterFactor must be between 0 and 1',
        WebhookErrorType.VALIDATION_ERROR,
        undefined,
        false,
      );
    }
  }

  /**
   * Calculate jitter value
   *
   * @param baseDelay - Base delay without jitter
   * @param jitterFactor - Jitter factor (0-1)
   * @returns Jitter value in milliseconds
   */
  private calculateJitter(baseDelay: number, jitterFactor: number): number {
    // Use random jitter: ±(delay * jitterFactor)
    const maxJitter = baseDelay * jitterFactor;
    return (Math.random() * 2 - 1) * maxJitter;
  }

  /**
   * Parse Retry-After header value
   *
   * @param retryAfter - Retry-After value (seconds or HTTP date)
   * @param currentTime - Current timestamp
   * @returns Delay in milliseconds
   */
  private parseRetryAfter(retryAfter: number | string, currentTime: number): number {
    if (typeof retryAfter === 'number') {
      // Value in seconds
      return retryAfter * 1000;
    }

    // Try parsing as HTTP date
    const retryDate = new Date(retryAfter).getTime();
    if (!isNaN(retryDate)) {
      return Math.max(0, retryDate - currentTime);
    }

    // Try parsing as seconds string
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }

    return 0;
  }

  /**
   * Calculate total maximum retry time
   *
   * @param config - Retry configuration
   * @returns Maximum total time for all retries in milliseconds
   */
  public calculateMaxRetryTime(config: WebhookRetryConfig): number {
    const schedule = this.createBackoffSchedule(config);
    return schedule.reduce((total, delay) => total + delay, 0);
  }

  /**
   * Create retry context for logging/monitoring
   *
   * @param attempts - Delivery attempts
   * @param config - Retry configuration
   * @returns Retry context object
   */
  public createRetryContext(
    attempts: WebhookDeliveryAttempt[],
    config: WebhookRetryConfig,
  ): Record<string, unknown> {
    const strategy = this.getRetryStrategy(attempts, config);
    const schedule = this.createBackoffSchedule(config);

    return {
      attemptNumber: attempts.length,
      maxAttempts: config.maxAttempts,
      remainingAttempts: strategy.remainingAttempts,
      nextRetryDelay: strategy.nextRetryDelay,
      totalElapsedTime: strategy.totalElapsedTime,
      retrySchedule: schedule,
      canRetry: strategy.canRetry,
      lastStatusCode: attempts[attempts.length - 1]?.statusCode,
      lastError: attempts[attempts.length - 1]?.error,
    };
  }
}

/**
 * Singleton instance
 */
export const webhookRetryService = new WebhookRetryService();

/**
 * Helper function to create custom retry configuration
 *
 * @param overrides - Partial retry configuration to override defaults
 * @returns Complete retry configuration
 */
export function createRetryConfig(
  overrides: Partial<WebhookRetryConfig> = {},
): WebhookRetryConfig {
  return {
    ...DEFAULT_RETRY_CONFIG,
    ...overrides,
  };
}
