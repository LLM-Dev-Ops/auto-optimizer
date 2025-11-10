/**
 * Slack API Client
 *
 * Production-ready Slack API client with rate limiting, retry logic, and error handling
 * @module slack-client
 */

import * as crypto from 'crypto';
import type {
  SlackConfig,
  MessagePayload,
  ChatPostMessageResponse,
  ModalView,
  HomeTabView,
  ViewsOpenResponse,
  ViewsUpdateResponse,
  SlackAPIResponse,
  RateLimitInfo,
  RetryConfig,
  SlackError,
  Block,
  SlackUser,
  SlackChannel,
} from './slack-types';

/**
 * Token bucket for rate limiting per channel
 */
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number;

  /**
   * Creates a new token bucket
   * @param capacity - Maximum number of tokens
   * @param refillRate - Tokens added per second
   */
  constructor(capacity: number, refillRate: number) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Refills tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.refillRate;
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Attempts to consume a token
   * @returns True if token was consumed, false otherwise
   */
  tryConsume(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * Gets time until next token is available (in milliseconds)
   */
  getTimeUntilNextToken(): number {
    this.refill();
    if (this.tokens >= 1) {
      return 0;
    }
    const tokensNeeded = 1 - this.tokens;
    return (tokensNeeded / this.refillRate) * 1000;
  }

  /**
   * Gets current rate limit info
   */
  getInfo(): Omit<RateLimitInfo, 'channel'> {
    this.refill();
    return {
      tokens: this.tokens,
      lastRefill: this.lastRefill,
      capacity: this.capacity,
      refillRate: this.refillRate,
    };
  }
}

/**
 * Slack API Client with enterprise-grade features
 */
export class SlackClient {
  private readonly config: Required<SlackConfig>;
  private readonly rateLimiters: Map<string, TokenBucket> = new Map();
  private readonly retryConfig: RetryConfig;
  private readonly baseUrl = 'https://slack.com/api';

  /**
   * Creates a new Slack client
   * @param config - Slack configuration
   */
  constructor(config: SlackConfig) {
    this.config = {
      botToken: config.botToken,
      appToken: config.appToken || '',
      signingSecret: config.signingSecret,
      clientId: config.clientId || '',
      clientSecret: config.clientSecret || '',
      redirectUri: config.redirectUri || '',
      rateLimit: config.rateLimit || 1, // 1 request per second per channel
      timeout: config.timeout || 30000,
      enableRetry: config.enableRetry !== false,
      maxRetries: config.maxRetries || 3,
      enableTokenRotation: config.enableTokenRotation || false,
      tokenRotationInterval: config.tokenRotationInterval || 24,
    };

    this.retryConfig = {
      maxRetries: this.config.maxRetries,
      baseDelay: 1000,
      maxDelay: 32000,
      factor: 2,
    };
  }

  /**
   * Gets or creates a rate limiter for a channel
   * @param channel - Channel ID
   */
  private getRateLimiter(channel: string): TokenBucket {
    if (!this.rateLimiters.has(channel)) {
      this.rateLimiters.set(
        channel,
        new TokenBucket(this.config.rateLimit, this.config.rateLimit)
      );
    }
    return this.rateLimiters.get(channel)!;
  }

  /**
   * Waits for rate limit to allow request
   * @param channel - Channel ID
   */
  private async waitForRateLimit(channel: string): Promise<void> {
    const limiter = this.getRateLimiter(channel);
    while (!limiter.tryConsume()) {
      const waitTime = limiter.getTimeUntilNextToken();
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Makes an API request with retry logic
   * @param method - HTTP method
   * @param endpoint - API endpoint
   * @param data - Request data
   * @param retryCount - Current retry attempt
   */
  private async makeRequest<T extends SlackAPIResponse>(
    method: string,
    endpoint: string,
    data?: unknown,
    retryCount = 0
  ): Promise<T> {
    const url = `${this.baseUrl}/${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${this.config.botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': 'LLM-Auto-Optimizer-Slack-Client/1.0',
      };

      const options: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      };

      if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        options.body = JSON.stringify(data);
      }

      const response = await fetch(url, options);
      clearTimeout(timeoutId);

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);

        if (this.config.enableRetry && retryCount < this.retryConfig.maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
          return this.makeRequest<T>(method, endpoint, data, retryCount + 1);
        }

        const error = new Error(`Rate limited. Retry after ${retryAfter}s`) as SlackError;
        error.code = 'RATE_LIMITED';
        error.statusCode = 429;
        error.retryAfter = retryAfter;
        throw error;
      }

      // Parse response
      const result = await response.json() as T;

      // Handle API errors
      if (!result.ok) {
        const error = new Error(result.error || 'Slack API error') as SlackError;
        error.code = result.error;
        error.data = result;
        error.statusCode = response.status;

        // Retry on transient errors
        if (
          this.config.enableRetry &&
          retryCount < this.retryConfig.maxRetries &&
          this.isRetryableError(result.error)
        ) {
          const delay = this.calculateRetryDelay(retryCount);
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.makeRequest<T>(method, endpoint, data, retryCount + 1);
        }

        throw error;
      }

      return result;
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle network errors
      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError = new Error('Request timeout') as SlackError;
        timeoutError.code = 'TIMEOUT';
        throw timeoutError;
      }

      // Retry on network errors
      if (
        this.config.enableRetry &&
        retryCount < this.retryConfig.maxRetries &&
        !(error as SlackError).code
      ) {
        const delay = this.calculateRetryDelay(retryCount);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.makeRequest<T>(method, endpoint, data, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * Checks if an error is retryable
   * @param error - Error code
   */
  private isRetryableError(error?: string): boolean {
    const retryableErrors = [
      'internal_error',
      'service_unavailable',
      'fatal_error',
      'ratelimited',
    ];
    return error ? retryableErrors.includes(error) : false;
  }

  /**
   * Calculates exponential backoff delay
   * @param retryCount - Current retry attempt
   */
  private calculateRetryDelay(retryCount: number): number {
    const delay = Math.min(
      this.retryConfig.baseDelay * Math.pow(this.retryConfig.factor, retryCount),
      this.retryConfig.maxDelay
    );
    // Add jitter
    return delay + Math.random() * 1000;
  }

  /**
   * Posts a message to a channel
   * @param payload - Message payload
   */
  async postMessage(payload: MessagePayload): Promise<ChatPostMessageResponse> {
    await this.waitForRateLimit(payload.channel);
    return this.makeRequest<ChatPostMessageResponse>('POST', 'chat.postMessage', payload);
  }

  /**
   * Posts a message to a thread
   * @param channel - Channel ID
   * @param threadTs - Thread timestamp
   * @param text - Message text
   * @param blocks - Message blocks
   */
  async postThreadReply(
    channel: string,
    threadTs: string,
    text: string,
    blocks?: Block[]
  ): Promise<ChatPostMessageResponse> {
    return this.postMessage({
      channel,
      text,
      thread_ts: threadTs,
      blocks,
    });
  }

  /**
   * Posts an ephemeral message (visible only to one user)
   * @param channel - Channel ID
   * @param user - User ID
   * @param text - Message text
   * @param blocks - Message blocks
   */
  async postEphemeral(
    channel: string,
    user: string,
    text: string,
    blocks?: Block[]
  ): Promise<SlackAPIResponse> {
    await this.waitForRateLimit(channel);
    return this.makeRequest('POST', 'chat.postEphemeral', {
      channel,
      user,
      text,
      blocks,
    });
  }

  /**
   * Updates an existing message
   * @param channel - Channel ID
   * @param ts - Message timestamp
   * @param text - New message text
   * @param blocks - New message blocks
   */
  async updateMessage(
    channel: string,
    ts: string,
    text: string,
    blocks?: Block[]
  ): Promise<ChatPostMessageResponse> {
    await this.waitForRateLimit(channel);
    return this.makeRequest<ChatPostMessageResponse>('POST', 'chat.update', {
      channel,
      ts,
      text,
      blocks,
    });
  }

  /**
   * Deletes a message
   * @param channel - Channel ID
   * @param ts - Message timestamp
   */
  async deleteMessage(channel: string, ts: string): Promise<SlackAPIResponse> {
    await this.waitForRateLimit(channel);
    return this.makeRequest('POST', 'chat.delete', {
      channel,
      ts,
    });
  }

  /**
   * Adds a reaction to a message
   * @param channel - Channel ID
   * @param timestamp - Message timestamp
   * @param name - Reaction name (e.g., 'thumbsup')
   */
  async addReaction(channel: string, timestamp: string, name: string): Promise<SlackAPIResponse> {
    await this.waitForRateLimit(channel);
    return this.makeRequest('POST', 'reactions.add', {
      channel,
      timestamp,
      name,
    });
  }

  /**
   * Removes a reaction from a message
   * @param channel - Channel ID
   * @param timestamp - Message timestamp
   * @param name - Reaction name
   */
  async removeReaction(channel: string, timestamp: string, name: string): Promise<SlackAPIResponse> {
    await this.waitForRateLimit(channel);
    return this.makeRequest('POST', 'reactions.remove', {
      channel,
      timestamp,
      name,
    });
  }

  /**
   * Opens a modal view
   * @param triggerId - Trigger ID from interaction
   * @param view - Modal view
   */
  async openModal(triggerId: string, view: ModalView): Promise<ViewsOpenResponse> {
    return this.makeRequest<ViewsOpenResponse>('POST', 'views.open', {
      trigger_id: triggerId,
      view,
    });
  }

  /**
   * Updates a modal view
   * @param viewId - View ID
   * @param view - Updated modal view
   * @param hash - View hash for optimistic locking
   */
  async updateModal(
    viewId: string,
    view: ModalView,
    hash?: string
  ): Promise<ViewsUpdateResponse> {
    return this.makeRequest<ViewsUpdateResponse>('POST', 'views.update', {
      view_id: viewId,
      view,
      hash,
    });
  }

  /**
   * Pushes a new view onto the modal stack
   * @param triggerId - Trigger ID from interaction
   * @param view - Modal view
   */
  async pushModal(triggerId: string, view: ModalView): Promise<ViewsOpenResponse> {
    return this.makeRequest<ViewsOpenResponse>('POST', 'views.push', {
      trigger_id: triggerId,
      view,
    });
  }

  /**
   * Publishes a home tab view
   * @param userId - User ID
   * @param view - Home tab view
   */
  async publishHomeTab(userId: string, view: HomeTabView): Promise<SlackAPIResponse> {
    return this.makeRequest('POST', 'views.publish', {
      user_id: userId,
      view,
    });
  }

  /**
   * Gets user information
   * @param userId - User ID
   */
  async getUserInfo(userId: string): Promise<SlackAPIResponse & { user: SlackUser }> {
    return this.makeRequest('GET', `users.info?user=${userId}`);
  }

  /**
   * Gets channel information
   * @param channelId - Channel ID
   */
  async getChannelInfo(channelId: string): Promise<SlackAPIResponse & { channel: SlackChannel }> {
    return this.makeRequest('GET', `conversations.info?channel=${channelId}`);
  }

  /**
   * Lists channels
   * @param cursor - Pagination cursor
   * @param limit - Number of results
   */
  async listChannels(
    cursor?: string,
    limit = 100
  ): Promise<SlackAPIResponse & { channels: SlackChannel[] }> {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (cursor) {
      params.append('cursor', cursor);
    }
    return this.makeRequest('GET', `conversations.list?${params.toString()}`);
  }

  /**
   * Joins a channel
   * @param channelId - Channel ID
   */
  async joinChannel(channelId: string): Promise<SlackAPIResponse> {
    return this.makeRequest('POST', 'conversations.join', {
      channel: channelId,
    });
  }

  /**
   * Leaves a channel
   * @param channelId - Channel ID
   */
  async leaveChannel(channelId: string): Promise<SlackAPIResponse> {
    return this.makeRequest('POST', 'conversations.leave', {
      channel: channelId,
    });
  }

  /**
   * Invites users to a channel
   * @param channelId - Channel ID
   * @param userIds - Array of user IDs
   */
  async inviteToChannel(channelId: string, userIds: string[]): Promise<SlackAPIResponse> {
    return this.makeRequest('POST', 'conversations.invite', {
      channel: channelId,
      users: userIds.join(','),
    });
  }

  /**
   * Archives a channel
   * @param channelId - Channel ID
   */
  async archiveChannel(channelId: string): Promise<SlackAPIResponse> {
    return this.makeRequest('POST', 'conversations.archive', {
      channel: channelId,
    });
  }

  /**
   * Unarchives a channel
   * @param channelId - Channel ID
   */
  async unarchiveChannel(channelId: string): Promise<SlackAPIResponse> {
    return this.makeRequest('POST', 'conversations.unarchive', {
      channel: channelId,
    });
  }

  /**
   * Sends a message to a response URL
   * @param responseUrl - Response URL from interaction
   * @param payload - Message payload
   */
  async respondToUrl(responseUrl: string, payload: Partial<MessagePayload>): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(responseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to respond to URL: ${response.statusText}`);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Tests API connection
   */
  async testAuth(): Promise<SlackAPIResponse> {
    return this.makeRequest('GET', 'auth.test');
  }

  /**
   * Gets rate limit info for a channel
   * @param channel - Channel ID
   */
  getRateLimitInfo(channel: string): RateLimitInfo {
    const limiter = this.getRateLimiter(channel);
    return {
      channel,
      ...limiter.getInfo(),
    };
  }

  /**
   * Clears rate limit for a channel (for testing)
   * @param channel - Channel ID
   */
  clearRateLimit(channel: string): void {
    this.rateLimiters.delete(channel);
  }

  /**
   * Clears all rate limits (for testing)
   */
  clearAllRateLimits(): void {
    this.rateLimiters.clear();
  }
}

/**
 * Creates a formatted error message block
 * @param error - Error message
 */
export function createErrorBlock(error: string): Block[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:x: *Error*\n${error}`,
      },
    },
  ];
}

/**
 * Creates a formatted success message block
 * @param message - Success message
 */
export function createSuccessBlock(message: string): Block[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:white_check_mark: *Success*\n${message}`,
      },
    },
  ];
}

/**
 * Creates a formatted info message block
 * @param message - Info message
 */
export function createInfoBlock(message: string): Block[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:information_source: ${message}`,
      },
    },
  ];
}

/**
 * Creates a formatted warning message block
 * @param message - Warning message
 */
export function createWarningBlock(message: string): Block[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:warning: *Warning*\n${message}`,
      },
    },
  ];
}

export default SlackClient;
