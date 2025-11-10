/**
 * GitHub Integration - Webhook Event Handler
 *
 * Handles GitHub webhook events with enterprise-grade features:
 * - HMAC-SHA256 signature validation for security
 * - Event type routing and processing
 * - Payload validation and parsing
 * - Error handling and retry logic
 * - Event logging and auditing
 *
 * @module github-webhooks
 * @version 1.0.0
 */

import crypto from 'crypto';
import {
  WebhookEventType,
  WebhookPayload,
  PushWebhookPayload,
  PullRequestWebhookPayload,
  IssuesWebhookPayload,
  CreateWebhookOptions,
  WebhookConfig,
} from './github-types';

// ============================================================================
// Constants
// ============================================================================

const WEBHOOK_SIGNATURE_HEADER = 'x-hub-signature-256';
const WEBHOOK_EVENT_HEADER = 'x-github-event';
const WEBHOOK_DELIVERY_HEADER = 'x-github-delivery';
const WEBHOOK_HOOK_ID_HEADER = 'x-github-hook-id';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Webhook event handler function
 */
export type WebhookEventHandler<T extends WebhookPayload = WebhookPayload> = (
  payload: T,
  context: WebhookContext
) => void | Promise<void>;

/**
 * Webhook event context
 */
export interface WebhookContext {
  /** Event type */
  eventType: WebhookEventType;

  /** Delivery ID */
  deliveryId: string;

  /** Hook ID */
  hookId?: string;

  /** Request timestamp */
  timestamp: number;

  /** Signature validation result */
  signatureValid: boolean;

  /** Additional headers */
  headers: Record<string, string>;
}

/**
 * Webhook validation result
 */
export interface WebhookValidationResult {
  /** Is webhook valid */
  valid: boolean;

  /** Validation error message */
  error?: string;

  /** Event type */
  eventType?: WebhookEventType;

  /** Delivery ID */
  deliveryId?: string;
}

/**
 * Webhook processing result
 */
export interface WebhookProcessingResult {
  /** Was processing successful */
  success: boolean;

  /** Error message if failed */
  error?: string;

  /** Processing duration in milliseconds */
  duration: number;

  /** Event type */
  eventType: WebhookEventType;

  /** Delivery ID */
  deliveryId: string;
}

// ============================================================================
// Webhook Signature Validation
// ============================================================================

/**
 * Validates a GitHub webhook signature
 *
 * @param payload - Webhook payload (raw string)
 * @param signature - Signature from x-hub-signature-256 header
 * @param secret - Webhook secret
 * @returns True if signature is valid
 */
export function validateWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !secret) {
    return false;
  }

  // GitHub uses sha256=<signature> format
  if (!signature.startsWith('sha256=')) {
    return false;
  }

  const expectedSignature = signature.substring(7);

  try {
    // Calculate HMAC-SHA256
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload, 'utf8');
    const calculatedSignature = hmac.digest('hex');

    // Use timing-safe comparison
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(calculatedSignature)
    );
  } catch (error) {
    return false;
  }
}

/**
 * Generates a webhook signature for testing
 *
 * @param payload - Webhook payload
 * @param secret - Webhook secret
 * @returns Signature with sha256= prefix
 */
export function generateWebhookSignature(
  payload: string,
  secret: string
): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload, 'utf8');
  return `sha256=${hmac.digest('hex')}`;
}

// ============================================================================
// Webhook Validation
// ============================================================================

/**
 * Validates a webhook request
 *
 * @param headers - Request headers
 * @param body - Request body (raw string)
 * @param secret - Webhook secret (optional)
 * @returns Validation result
 */
export function validateWebhookRequest(
  headers: Record<string, string>,
  body: string,
  secret?: string
): WebhookValidationResult {
  // Check required headers
  const eventType = headers[WEBHOOK_EVENT_HEADER.toLowerCase()];
  const deliveryId = headers[WEBHOOK_DELIVERY_HEADER.toLowerCase()];
  const signature = headers[WEBHOOK_SIGNATURE_HEADER.toLowerCase()];

  if (!eventType) {
    return {
      valid: false,
      error: `Missing required header: ${WEBHOOK_EVENT_HEADER}`,
    };
  }

  if (!deliveryId) {
    return {
      valid: false,
      error: `Missing required header: ${WEBHOOK_DELIVERY_HEADER}`,
    };
  }

  // Validate signature if secret is provided
  if (secret) {
    if (!signature) {
      return {
        valid: false,
        error: `Missing required header: ${WEBHOOK_SIGNATURE_HEADER}`,
      };
    }

    const signatureValid = validateWebhookSignature(body, signature, secret);
    if (!signatureValid) {
      return {
        valid: false,
        error: 'Invalid webhook signature',
      };
    }
  }

  return {
    valid: true,
    eventType: eventType as WebhookEventType,
    deliveryId,
  };
}

/**
 * Parses a webhook payload
 *
 * @param body - Request body (string or object)
 * @returns Parsed webhook payload
 * @throws Error if parsing fails
 */
export function parseWebhookPayload<T extends WebhookPayload = WebhookPayload>(
  body: string | object
): T {
  try {
    if (typeof body === 'string') {
      return JSON.parse(body) as T;
    }
    return body as T;
  } catch (error) {
    throw new Error(
      `Failed to parse webhook payload: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ============================================================================
// Webhook Event Processor
// ============================================================================

/**
 * GitHub webhook event processor with routing and validation
 */
export class GitHubWebhookProcessor {
  private handlers: Map<
    WebhookEventType,
    Set<WebhookEventHandler>
  > = new Map();
  private globalHandlers: Set<WebhookEventHandler> = new Set();
  private secret?: string;
  private enableLogging: boolean;

  /**
   * Creates a new webhook processor
   *
   * @param config - Webhook configuration
   * @param enableLogging - Enable event logging (default: true)
   */
  constructor(config?: { secret?: string }, enableLogging = true) {
    this.secret = config?.secret;
    this.enableLogging = enableLogging;
  }

  /**
   * Registers an event handler for a specific event type
   *
   * @param eventType - Event type to handle
   * @param handler - Event handler function
   */
  on<T extends WebhookPayload = WebhookPayload>(
    eventType: WebhookEventType,
    handler: WebhookEventHandler<T>
  ): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }

    this.handlers.get(eventType)!.add(handler as WebhookEventHandler);
  }

  /**
   * Registers a global event handler for all event types
   *
   * @param handler - Event handler function
   */
  onAny(handler: WebhookEventHandler): void {
    this.globalHandlers.add(handler);
  }

  /**
   * Removes an event handler
   *
   * @param eventType - Event type
   * @param handler - Handler to remove
   */
  off(eventType: WebhookEventType, handler: WebhookEventHandler): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Removes a global event handler
   *
   * @param handler - Handler to remove
   */
  offAny(handler: WebhookEventHandler): void {
    this.globalHandlers.delete(handler);
  }

  /**
   * Processes a webhook request
   *
   * @param headers - Request headers
   * @param body - Request body (raw string)
   * @returns Processing result
   */
  async process(
    headers: Record<string, string>,
    body: string
  ): Promise<WebhookProcessingResult> {
    const startTime = Date.now();

    // Normalize header keys to lowercase
    const normalizedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      normalizedHeaders[key.toLowerCase()] = value;
    }

    // Validate request
    const validation = validateWebhookRequest(
      normalizedHeaders,
      body,
      this.secret
    );

    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
        duration: Date.now() - startTime,
        eventType: 'ping',
        deliveryId: validation.deliveryId || 'unknown',
      };
    }

    const eventType = validation.eventType!;
    const deliveryId = validation.deliveryId!;
    const hookId = normalizedHeaders[WEBHOOK_HOOK_ID_HEADER.toLowerCase()];

    // Parse payload
    let payload: WebhookPayload;
    try {
      payload = parseWebhookPayload(body);
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse payload: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: Date.now() - startTime,
        eventType,
        deliveryId,
      };
    }

    // Create context
    const context: WebhookContext = {
      eventType,
      deliveryId,
      hookId,
      timestamp: Date.now(),
      signatureValid: !this.secret || true, // Already validated above
      headers: normalizedHeaders,
    };

    // Log event
    if (this.enableLogging) {
      this.logEvent(eventType, deliveryId, payload);
    }

    // Process event
    try {
      await this.dispatchEvent(eventType, payload, context);

      return {
        success: true,
        duration: Date.now() - startTime,
        eventType,
        deliveryId,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      if (this.enableLogging) {
        this.logError(eventType, deliveryId, errorMessage);
      }

      return {
        success: false,
        error: errorMessage,
        duration: Date.now() - startTime,
        eventType,
        deliveryId,
      };
    }
  }

  /**
   * Dispatches an event to registered handlers
   *
   * @param eventType - Event type
   * @param payload - Event payload
   * @param context - Event context
   */
  private async dispatchEvent(
    eventType: WebhookEventType,
    payload: WebhookPayload,
    context: WebhookContext
  ): Promise<void> {
    const promises: Promise<void>[] = [];

    // Call specific handlers
    const specificHandlers = this.handlers.get(eventType);
    if (specificHandlers) {
      for (const handler of specificHandlers) {
        promises.push(Promise.resolve(handler(payload, context)));
      }
    }

    // Call global handlers
    for (const handler of this.globalHandlers) {
      promises.push(Promise.resolve(handler(payload, context)));
    }

    // Wait for all handlers to complete
    await Promise.all(promises);
  }

  /**
   * Logs a webhook event
   *
   * @param eventType - Event type
   * @param deliveryId - Delivery ID
   * @param payload - Event payload
   */
  private logEvent(
    eventType: WebhookEventType,
    deliveryId: string,
    payload: WebhookPayload
  ): void {
    console.info(
      `[GitHub Webhook] Event received: ${eventType} (${deliveryId})`,
      {
        eventType,
        deliveryId,
        action: payload.action,
        repository: payload.repository?.full_name,
        sender: payload.sender?.login,
      }
    );
  }

  /**
   * Logs a webhook processing error
   *
   * @param eventType - Event type
   * @param deliveryId - Delivery ID
   * @param error - Error message
   */
  private logError(
    eventType: WebhookEventType,
    deliveryId: string,
    error: string
  ): void {
    console.error(
      `[GitHub Webhook] Error processing event: ${eventType} (${deliveryId})`,
      { error }
    );
  }

  /**
   * Updates the webhook secret
   *
   * @param secret - New webhook secret
   */
  setSecret(secret: string): void {
    this.secret = secret;
  }

  /**
   * Gets the number of registered handlers
   *
   * @returns Handler counts by event type
   */
  getHandlerCounts(): Record<string, number> {
    const counts: Record<string, number> = {
      global: this.globalHandlers.size,
    };

    for (const [eventType, handlers] of this.handlers.entries()) {
      counts[eventType] = handlers.size;
    }

    return counts;
  }
}

// ============================================================================
// Webhook Management Utilities
// ============================================================================

/**
 * Creates a webhook configuration for GitHub repository
 *
 * @param url - Webhook URL
 * @param events - Events to subscribe to
 * @param secret - Webhook secret (optional)
 * @returns Webhook creation options
 */
export function createWebhookConfig(
  url: string,
  events: WebhookEventType[],
  secret?: string
): CreateWebhookOptions {
  const config: WebhookConfig = {
    url,
    content_type: 'json',
  };

  if (secret) {
    config.secret = secret;
  }

  return {
    name: 'web',
    config,
    events,
    active: true,
  };
}

/**
 * Generates a secure webhook secret
 *
 * @returns Random webhook secret
 */
export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Verifies a webhook ping event
 *
 * @param payload - Ping event payload
 * @returns True if ping is valid
 */
export function verifyPingEvent(payload: any): boolean {
  return (
    payload &&
    payload.zen &&
    typeof payload.zen === 'string' &&
    payload.hook_id !== undefined
  );
}

// ============================================================================
// Event-Specific Utilities
// ============================================================================

/**
 * Checks if a push event is for a specific branch
 *
 * @param payload - Push webhook payload
 * @param branch - Branch name to check
 * @returns True if push is for the specified branch
 */
export function isPushToBranch(
  payload: PushWebhookPayload,
  branch: string
): boolean {
  const ref = payload.ref;
  return ref === `refs/heads/${branch}`;
}

/**
 * Checks if a pull request event is a specific action
 *
 * @param payload - Pull request webhook payload
 * @param action - Action to check
 * @returns True if action matches
 */
export function isPullRequestAction(
  payload: PullRequestWebhookPayload,
  action: PullRequestWebhookPayload['action']
): boolean {
  return payload.action === action;
}

/**
 * Checks if an issue event is a specific action
 *
 * @param payload - Issues webhook payload
 * @param action - Action to check
 * @returns True if action matches
 */
export function isIssueAction(
  payload: IssuesWebhookPayload,
  action: IssuesWebhookPayload['action']
): boolean {
  return payload.action === action;
}

/**
 * Extracts commit information from a push event
 *
 * @param payload - Push webhook payload
 * @returns Commit information
 */
export function extractCommitInfo(payload: PushWebhookPayload): {
  count: number;
  messages: string[];
  authors: string[];
  shas: string[];
} {
  return {
    count: payload.commits.length,
    messages: payload.commits.map((c) => c.message),
    authors: payload.commits.map((c) => c.author.username || c.author.name),
    shas: payload.commits.map((c) => c.id),
  };
}

/**
 * Checks if a push event created a new branch or tag
 *
 * @param payload - Push webhook payload
 * @returns True if created
 */
export function isCreationEvent(payload: PushWebhookPayload): boolean {
  return payload.created;
}

/**
 * Checks if a push event deleted a branch or tag
 *
 * @param payload - Push webhook payload
 * @returns True if deleted
 */
export function isDeletionEvent(payload: PushWebhookPayload): boolean {
  return payload.deleted;
}

/**
 * Checks if a push event was force-pushed
 *
 * @param payload - Push webhook payload
 * @returns True if force-pushed
 */
export function isForcePush(payload: PushWebhookPayload): boolean {
  return payload.forced;
}

// ============================================================================
// Webhook Retry Handler
// ============================================================================

/**
 * Webhook retry handler for failed webhook deliveries
 */
export class WebhookRetryHandler {
  private maxRetries: number;
  private retryDelay: number;
  private backoffMultiplier: number;

  /**
   * Creates a new retry handler
   *
   * @param maxRetries - Maximum retry attempts (default: 3)
   * @param retryDelay - Initial retry delay in ms (default: 1000)
   * @param backoffMultiplier - Backoff multiplier (default: 2)
   */
  constructor(
    maxRetries = 3,
    retryDelay = 1000,
    backoffMultiplier = 2
  ) {
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
    this.backoffMultiplier = backoffMultiplier;
  }

  /**
   * Retries a webhook delivery
   *
   * @param processor - Webhook processor
   * @param headers - Request headers
   * @param body - Request body
   * @param attempt - Current attempt number
   * @returns Processing result
   */
  async retry(
    processor: GitHubWebhookProcessor,
    headers: Record<string, string>,
    body: string,
    attempt = 0
  ): Promise<WebhookProcessingResult> {
    try {
      const result = await processor.process(headers, body);

      if (!result.success && attempt < this.maxRetries) {
        const delay = this.retryDelay * Math.pow(this.backoffMultiplier, attempt);
        await this.sleep(delay);
        return this.retry(processor, headers, body, attempt + 1);
      }

      return result;
    } catch (error) {
      if (attempt < this.maxRetries) {
        const delay = this.retryDelay * Math.pow(this.backoffMultiplier, attempt);
        await this.sleep(delay);
        return this.retry(processor, headers, body, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Sleeps for a specified duration
   *
   * @param ms - Duration in milliseconds
   * @returns Promise that resolves after delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Exports
// ============================================================================

export default GitHubWebhookProcessor;
