/**
 * Webhook System Type Definitions
 * Comprehensive TypeScript interfaces for webhook delivery system
 */

/**
 * Webhook event types
 */
export enum WebhookEventType {
  OPTIMIZATION_TRIGGERED = 'optimization.triggered',
  OPTIMIZATION_COMPLETED = 'optimization.completed',
  OPTIMIZATION_FAILED = 'optimization.failed',
  MODEL_SWITCHED = 'model.switched',
  THRESHOLD_EXCEEDED = 'threshold.exceeded',
  COST_ALERT = 'cost.alert',
  PERFORMANCE_DEGRADED = 'performance.degraded',
  ERROR_OCCURRED = 'error.occurred',
  HEALTH_CHECK = 'health.check',
}

/**
 * Webhook delivery status
 */
export enum WebhookDeliveryStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  DEAD_LETTER = 'dead_letter',
  RATE_LIMITED = 'rate_limited',
}

/**
 * Webhook retry strategy
 */
export interface WebhookRetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number;
}

/**
 * Rate limiting configuration per target
 */
export interface WebhookRateLimitConfig {
  requestsPerSecond: number;
  burstSize: number;
  enabled: boolean;
}

/**
 * Webhook target configuration
 */
export interface WebhookTarget {
  id: string;
  name: string;
  url: string;
  secret: string;
  enabled: boolean;
  eventFilters: WebhookEventType[];
  headers?: Record<string, string>;
  timeout: number;
  retryConfig: WebhookRetryConfig;
  rateLimitConfig: WebhookRateLimitConfig;
  metadata?: Record<string, unknown>;
}

/**
 * Webhook payload structure
 */
export interface WebhookPayload<T = unknown> {
  id: string;
  eventType: WebhookEventType;
  timestamp: number;
  source: string;
  data: T;
  version: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Webhook delivery attempt
 */
export interface WebhookDeliveryAttempt {
  attemptNumber: number;
  timestamp: number;
  statusCode?: number;
  responseTime?: number;
  error?: string;
  retryAfter?: number;
}

/**
 * Webhook delivery record
 */
export interface WebhookDelivery {
  id: string;
  targetId: string;
  payload: WebhookPayload;
  status: WebhookDeliveryStatus;
  attempts: WebhookDeliveryAttempt[];
  createdAt: number;
  updatedAt: number;
  nextRetryAt?: number;
  completedAt?: number;
  signature: string;
}

/**
 * Webhook signature result
 */
export interface WebhookSignature {
  signature: string;
  timestamp: number;
  algorithm: string;
}

/**
 * Webhook queue item
 */
export interface WebhookQueueItem {
  delivery: WebhookDelivery;
  target: WebhookTarget;
  priority: number;
  scheduledFor: number;
}

/**
 * Webhook delivery result
 */
export interface WebhookDeliveryResult {
  success: boolean;
  deliveryId: string;
  targetId: string;
  statusCode?: number;
  responseTime: number;
  attemptNumber: number;
  error?: string;
  willRetry: boolean;
  nextRetryAt?: number;
}

/**
 * Webhook statistics
 */
export interface WebhookStatistics {
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  pendingDeliveries: number;
  deadLetterDeliveries: number;
  averageResponseTime: number;
  successRate: number;
  byEventType: Record<WebhookEventType, number>;
  byTarget: Record<string, {
    total: number;
    successful: number;
    failed: number;
    averageResponseTime: number;
  }>;
}

/**
 * Webhook client configuration
 */
export interface WebhookClientConfig {
  userAgent: string;
  defaultTimeout: number;
  maxConcurrentDeliveries: number;
  queueCheckInterval: number;
  deadLetterThreshold: number;
  enableMetrics: boolean;
}

/**
 * Webhook error types
 */
export enum WebhookErrorType {
  NETWORK_ERROR = 'network_error',
  TIMEOUT_ERROR = 'timeout_error',
  INVALID_RESPONSE = 'invalid_response',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  SIGNATURE_ERROR = 'signature_error',
  VALIDATION_ERROR = 'validation_error',
  TARGET_DISABLED = 'target_disabled',
  UNKNOWN_ERROR = 'unknown_error',
}

/**
 * Webhook error
 */
export class WebhookError extends Error {
  constructor(
    message: string,
    public readonly type: WebhookErrorType,
    public readonly statusCode?: number,
    public readonly retryable: boolean = true,
    public readonly originalError?: Error,
  ) {
    super(message);
    this.name = 'WebhookError';
  }
}

/**
 * Default configurations
 */
export const DEFAULT_RETRY_CONFIG: WebhookRetryConfig = {
  maxAttempts: 5,
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
};

export const DEFAULT_RATE_LIMIT_CONFIG: WebhookRateLimitConfig = {
  requestsPerSecond: 10,
  burstSize: 20,
  enabled: true,
};

export const DEFAULT_CLIENT_CONFIG: WebhookClientConfig = {
  userAgent: 'LLM-Auto-Optimizer-Webhook/1.0',
  defaultTimeout: 30000,
  maxConcurrentDeliveries: 10,
  queueCheckInterval: 1000,
  deadLetterThreshold: 5,
  enableMetrics: true,
};
