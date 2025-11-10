/**
 * Slack Webhook Event Processor
 *
 * Handles webhook events, signature verification, and event processing
 * @module slack-webhooks
 */

import * as crypto from 'crypto';
import type {
  SlackConfig,
  EventPayload,
  UrlVerificationPayload,
  WebhookRequest,
  WebhookVerificationResult,
  SlackEvent,
  MessageEvent,
  AppMentionEvent,
  InteractivePayload,
  BlockActionsPayload,
  ViewSubmissionPayload,
  SlackError,
} from './slack-types';

/**
 * Event handler function type
 */
export type EventHandler<T = SlackEvent> = (event: T, context: EventContext) => Promise<void> | void;

/**
 * Interactive handler function type
 */
export type InteractiveHandler<T = InteractivePayload> = (
  payload: T,
  context: InteractiveContext
) => Promise<void | Record<string, unknown>> | void | Record<string, unknown>;

/**
 * Event context
 */
export interface EventContext {
  teamId: string;
  apiAppId: string;
  eventId: string;
  eventTime: number;
  authorizations?: Array<{
    enterprise_id: string | null;
    team_id: string;
    user_id: string;
    is_bot: boolean;
  }>;
}

/**
 * Interactive context
 */
export interface InteractiveContext {
  triggerId?: string;
  responseUrl?: string;
  user: {
    id: string;
    username?: string;
    team_id?: string;
  };
  team: {
    id: string;
    domain: string;
  };
}

/**
 * Webhook processor configuration
 */
export interface WebhookProcessorConfig {
  signingSecret: string;
  enableSignatureVerification?: boolean;
  maxRequestAge?: number; // seconds
  enableEventDeduplication?: boolean;
  deduplicationWindow?: number; // seconds
}

/**
 * Event deduplication manager
 */
class EventDeduplicator {
  private processedEvents: Map<string, number> = new Map();
  private readonly window: number;

  constructor(windowSeconds: number = 300) {
    this.window = windowSeconds * 1000;
  }

  /**
   * Checks if event has been processed
   * @param eventId - Event ID
   */
  isDuplicate(eventId: string): boolean {
    const timestamp = this.processedEvents.get(eventId);
    if (!timestamp) return false;

    // Check if still within deduplication window
    return Date.now() - timestamp < this.window;
  }

  /**
   * Marks event as processed
   * @param eventId - Event ID
   */
  markProcessed(eventId: string): void {
    this.processedEvents.set(eventId, Date.now());
    this.cleanup();
  }

  /**
   * Cleans up old processed events
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [eventId, timestamp] of this.processedEvents.entries()) {
      if (now - timestamp > this.window) {
        this.processedEvents.delete(eventId);
      }
    }
  }

  /**
   * Clears all processed events (for testing)
   */
  clear(): void {
    this.processedEvents.clear();
  }
}

/**
 * Slack Webhook Processor
 */
export class SlackWebhookProcessor {
  private readonly config: Required<WebhookProcessorConfig>;
  private readonly eventHandlers: Map<string, EventHandler[]> = new Map();
  private readonly interactiveHandlers: Map<string, InteractiveHandler[]> = new Map();
  private readonly deduplicator: EventDeduplicator;

  constructor(config: WebhookProcessorConfig) {
    this.config = {
      signingSecret: config.signingSecret,
      enableSignatureVerification: config.enableSignatureVerification !== false,
      maxRequestAge: config.maxRequestAge || 300, // 5 minutes
      enableEventDeduplication: config.enableEventDeduplication !== false,
      deduplicationWindow: config.deduplicationWindow || 300, // 5 minutes
    };

    this.deduplicator = new EventDeduplicator(this.config.deduplicationWindow);
  }

  /**
   * Verifies webhook signature
   * @param request - Webhook request
   */
  verifySignature(request: WebhookRequest): WebhookVerificationResult {
    if (!this.config.enableSignatureVerification) {
      return { valid: true };
    }

    const { signature, timestamp, body } = request;

    // Check timestamp to prevent replay attacks
    const requestTime = parseInt(timestamp, 10);
    const currentTime = Math.floor(Date.now() / 1000);

    if (Math.abs(currentTime - requestTime) > this.config.maxRequestAge) {
      return {
        valid: false,
        error: 'Request timestamp is too old',
      };
    }

    // Compute expected signature
    const sigBasestring = `v0:${timestamp}:${body}`;
    const expectedSignature = `v0=${crypto
      .createHmac('sha256', this.config.signingSecret)
      .update(sigBasestring)
      .digest('hex')}`;

    // Compare signatures using timing-safe comparison
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

    return {
      valid: isValid,
      error: isValid ? undefined : 'Invalid signature',
    };
  }

  /**
   * Registers an event handler
   * @param eventType - Event type (e.g., 'message', 'app_mention')
   * @param handler - Handler function
   */
  on<T extends SlackEvent = SlackEvent>(eventType: string, handler: EventHandler<T>): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType)!.push(handler as EventHandler);
  }

  /**
   * Registers an interactive handler
   * @param actionId - Action ID or callback ID
   * @param handler - Handler function
   */
  onInteractive<T extends InteractivePayload = InteractivePayload>(
    actionId: string,
    handler: InteractiveHandler<T>
  ): void {
    if (!this.interactiveHandlers.has(actionId)) {
      this.interactiveHandlers.set(actionId, []);
    }
    this.interactiveHandlers.get(actionId)!.push(handler as InteractiveHandler);
  }

  /**
   * Registers a message event handler (convenience method)
   * @param handler - Handler function
   */
  onMessage(handler: EventHandler<MessageEvent>): void {
    this.on<MessageEvent>('message', handler);
  }

  /**
   * Registers an app mention event handler (convenience method)
   * @param handler - Handler function
   */
  onAppMention(handler: EventHandler<AppMentionEvent>): void {
    this.on<AppMentionEvent>('app_mention', handler);
  }

  /**
   * Processes a webhook request
   * @param request - Webhook request
   */
  async processWebhook(request: WebhookRequest): Promise<unknown> {
    // Verify signature
    if (this.config.enableSignatureVerification) {
      const verification = this.verifySignature(request);
      if (!verification.valid) {
        const error = new Error(verification.error || 'Signature verification failed') as SlackError;
        error.code = 'INVALID_SIGNATURE';
        throw error;
      }
    }

    // Parse body
    let payload: unknown;
    try {
      const bodyStr = typeof request.body === 'string' ? request.body : request.body.toString('utf-8');
      payload = JSON.parse(bodyStr);
    } catch (error) {
      const parseError = new Error('Failed to parse request body') as SlackError;
      parseError.code = 'INVALID_BODY';
      throw parseError;
    }

    // Handle URL verification challenge
    if ((payload as UrlVerificationPayload).type === 'url_verification') {
      return { challenge: (payload as UrlVerificationPayload).challenge };
    }

    // Handle event callbacks
    if ((payload as EventPayload).type === 'event_callback') {
      await this.processEvent(payload as EventPayload);
      return { ok: true };
    }

    // Handle interactive payloads
    if (this.isInteractivePayload(payload)) {
      const result = await this.processInteractive(payload as InteractivePayload);
      return result || { ok: true };
    }

    // Unknown payload type
    console.warn('Unknown webhook payload type:', payload);
    return { ok: true };
  }

  /**
   * Processes an event callback
   * @param payload - Event payload
   */
  private async processEvent(payload: EventPayload): Promise<void> {
    const { event, event_id, team_id, api_app_id, event_time, authorizations } = payload;

    // Check for duplicate events
    if (this.config.enableEventDeduplication) {
      if (this.deduplicator.isDuplicate(event_id)) {
        console.log(`Duplicate event detected: ${event_id}`);
        return;
      }
      this.deduplicator.markProcessed(event_id);
    }

    // Create event context
    const context: EventContext = {
      teamId: team_id,
      apiAppId: api_app_id,
      eventId: event_id,
      eventTime: event_time,
      authorizations,
    };

    // Get handlers for this event type
    const handlers = this.eventHandlers.get(event.type) || [];

    // Execute all handlers
    await Promise.all(
      handlers.map(async (handler) => {
        try {
          await handler(event, context);
        } catch (error) {
          console.error(`Error in event handler for ${event.type}:`, error);
        }
      })
    );
  }

  /**
   * Processes an interactive payload
   * @param payload - Interactive payload
   */
  private async processInteractive(payload: InteractivePayload): Promise<unknown> {
    // Create interactive context
    const context: InteractiveContext = {
      triggerId: (payload as BlockActionsPayload).trigger_id,
      responseUrl: (payload as BlockActionsPayload).response_url,
      user: payload.user,
      team: payload.team,
    };

    // Determine action/callback IDs to check
    const actionIds: string[] = [];

    if (payload.type === 'block_actions') {
      const blockPayload = payload as BlockActionsPayload;
      actionIds.push(...blockPayload.actions.map((a) => a.action_id));
    } else if (payload.type === 'view_submission' || payload.type === 'view_closed') {
      const viewPayload = payload as ViewSubmissionPayload;
      if (viewPayload.view.callback_id) {
        actionIds.push(viewPayload.view.callback_id);
      }
    } else if (payload.type === 'message_action' || payload.type === 'shortcut') {
      actionIds.push((payload as any).callback_id);
    }

    // Execute handlers
    let result: unknown;
    for (const actionId of actionIds) {
      const handlers = this.interactiveHandlers.get(actionId) || [];

      for (const handler of handlers) {
        try {
          const handlerResult = await handler(payload, context);
          if (handlerResult) {
            result = handlerResult;
          }
        } catch (error) {
          console.error(`Error in interactive handler for ${actionId}:`, error);
        }
      }
    }

    return result;
  }

  /**
   * Checks if payload is an interactive payload
   * @param payload - Payload to check
   */
  private isInteractivePayload(payload: unknown): boolean {
    const type = (payload as any)?.type;
    return [
      'block_actions',
      'view_submission',
      'view_closed',
      'message_action',
      'shortcut',
    ].includes(type);
  }

  /**
   * Removes an event handler
   * @param eventType - Event type
   * @param handler - Handler to remove
   */
  off(eventType: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Removes an interactive handler
   * @param actionId - Action ID
   * @param handler - Handler to remove
   */
  offInteractive(actionId: string, handler: InteractiveHandler): void {
    const handlers = this.interactiveHandlers.get(actionId);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Removes all handlers
   */
  removeAllHandlers(): void {
    this.eventHandlers.clear();
    this.interactiveHandlers.clear();
  }

  /**
   * Gets event deduplicator (for testing)
   */
  getDeduplicator(): EventDeduplicator {
    return this.deduplicator;
  }
}

/**
 * Extracts webhook request data from HTTP request
 * @param body - Request body
 * @param headers - Request headers
 */
export function extractWebhookRequest(
  body: string | Buffer,
  headers: Record<string, string | string[] | undefined>
): WebhookRequest {
  const timestamp = getHeader(headers, 'x-slack-request-timestamp') || '';
  const signature = getHeader(headers, 'x-slack-signature') || '';

  return {
    body,
    headers,
    timestamp,
    signature,
  };
}

/**
 * Gets header value (case-insensitive)
 * @param headers - Headers object
 * @param name - Header name
 */
function getHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | undefined {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return Array.isArray(value) ? value[0] : value;
    }
  }
  return undefined;
}

/**
 * Verifies a webhook signature (standalone function)
 * @param body - Request body
 * @param timestamp - Request timestamp
 * @param signature - Request signature
 * @param signingSecret - Signing secret
 */
export function verifyWebhookSignature(
  body: string | Buffer,
  timestamp: string,
  signature: string,
  signingSecret: string
): boolean {
  const bodyStr = typeof body === 'string' ? body : body.toString('utf-8');
  const sigBasestring = `v0:${timestamp}:${bodyStr}`;
  const expectedSignature = `v0=${crypto
    .createHmac('sha256', signingSecret)
    .update(sigBasestring)
    .digest('hex')}`;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    return false;
  }
}

/**
 * Creates a webhook processor with default configuration
 * @param signingSecret - Signing secret
 */
export function createWebhookProcessor(signingSecret: string): SlackWebhookProcessor {
  return new SlackWebhookProcessor({ signingSecret });
}

export { EventDeduplicator };
export default SlackWebhookProcessor;
