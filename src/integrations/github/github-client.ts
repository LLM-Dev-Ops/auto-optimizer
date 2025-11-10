/**
 * GitHub Integration - Main API Client
 *
 * Enterprise-grade GitHub API client with comprehensive features:
 * - Repository operations (create, read, update, list)
 * - Issue/PR management with full CRUD operations
 * - Rate limiting with automatic throttling (5000 req/hour)
 * - Exponential backoff retry logic
 * - Request/response logging with sensitive data redaction
 * - Complete error handling and validation
 *
 * @module github-client
 * @version 1.0.0
 */

import crypto from 'crypto';
import {
  GitHubClientConfig,
  Repository,
  CreateRepositoryOptions,
  UpdateRepositoryOptions,
  ListRepositoriesOptions,
  Issue,
  CreateIssueOptions,
  UpdateIssueOptions,
  ListIssuesOptions,
  PullRequest,
  CreatePullRequestOptions,
  UpdatePullRequestOptions,
  MergePullRequestOptions,
  APIResponse,
  APIError,
  RateLimitInfo,
  RateLimitConfig,
  RetryConfig,
  LoggingConfig,
  PaginationInfo,
  RequestMetadata,
  ScopeRequirement,
} from './github-types';
import GitHubAuthManager, { SCOPE_REQUIREMENTS } from './github-auth';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_BASE_URL = 'https://api.github.com';
const DEFAULT_USER_AGENT = 'llm-auto-optimizer-github-integration/1.0.0';
const DEFAULT_TIMEOUT = 30000; // 30 seconds

const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  maxRequestsPerHour: 5000,
  enableAutoThrottle: true,
  throttleThreshold: 100,
  enableQueueing: true,
  maxQueueSize: 1000,
};

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  logRequests: true,
  logResponses: true,
  logErrors: true,
  level: 'info',
  redactSensitive: true,
};

// ============================================================================
// Rate Limiter Implementation
// ============================================================================

/**
 * Token bucket rate limiter for request throttling
 */
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly config: RateLimitConfig;
  private queue: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
    timestamp: number;
  }> = [];

  constructor(config: RateLimitConfig) {
    this.config = config;
    this.tokens = config.maxRequestsPerHour;
    this.lastRefill = Date.now();
  }

  /**
   * Acquires a token for making a request
   *
   * @returns Promise that resolves when token is available
   * @throws Error if queue is full
   */
  async acquireToken(): Promise<void> {
    this.refillTokens();

    if (this.tokens > 0) {
      this.tokens--;
      return;
    }

    if (!this.config.enableQueueing) {
      throw new Error('Rate limit exceeded and queueing is disabled');
    }

    if (this.queue.length >= this.config.maxQueueSize) {
      throw new Error('Rate limit queue is full');
    }

    return new Promise((resolve, reject) => {
      this.queue.push({
        resolve,
        reject,
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Refills tokens based on time elapsed
   */
  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = Math.floor(
      (elapsed / 3600000) * this.config.maxRequestsPerHour
    );

    if (tokensToAdd > 0) {
      this.tokens = Math.min(
        this.config.maxRequestsPerHour,
        this.tokens + tokensToAdd
      );
      this.lastRefill = now;

      // Process queued requests
      while (this.queue.length > 0 && this.tokens > 0) {
        const request = this.queue.shift();
        if (request) {
          this.tokens--;
          request.resolve();
        }
      }
    }
  }

  /**
   * Updates rate limit based on GitHub API headers
   *
   * @param rateLimitInfo - Rate limit information from API
   */
  updateFromHeaders(rateLimitInfo: RateLimitInfo): void {
    this.tokens = rateLimitInfo.remaining;
    this.lastRefill = Date.now();
  }

  /**
   * Gets current rate limit status
   *
   * @returns Current available tokens and queue length
   */
  getStatus(): { available: number; queued: number } {
    this.refillTokens();
    return {
      available: this.tokens,
      queued: this.queue.length,
    };
  }
}

// ============================================================================
// Logger Implementation
// ============================================================================

/**
 * Request/response logger with sensitive data redaction
 */
class Logger {
  private readonly config: LoggingConfig;

  constructor(config: LoggingConfig) {
    this.config = config;
  }

  /**
   * Logs a request
   *
   * @param metadata - Request metadata
   * @param body - Request body
   */
  logRequest(metadata: RequestMetadata, body?: any): void {
    if (!this.config.logRequests) return;

    const level = this.config.level;
    const message = `[GitHub API Request] ${metadata.method} ${metadata.url}`;
    const data = {
      requestId: metadata.requestId,
      timestamp: new Date(metadata.timestamp).toISOString(),
      method: metadata.method,
      url: this.redactUrl(metadata.url),
      body: this.config.redactSensitive ? this.redactData(body) : body,
    };

    this.log(level, message, data);
  }

  /**
   * Logs a response
   *
   * @param metadata - Request metadata
   * @param status - HTTP status code
   * @param body - Response body
   */
  logResponse(metadata: RequestMetadata, status: number, body?: any): void {
    if (!this.config.logResponses) return;

    const level = status >= 400 ? 'warn' : this.config.level;
    const message = `[GitHub API Response] ${metadata.method} ${metadata.url} - ${status}`;
    const data = {
      requestId: metadata.requestId,
      duration: metadata.duration,
      status,
      body: this.config.redactSensitive ? this.redactData(body) : body,
    };

    this.log(level, message, data);
  }

  /**
   * Logs an error
   *
   * @param metadata - Request metadata
   * @param error - Error object
   */
  logError(metadata: RequestMetadata, error: Error | APIError): void {
    if (!this.config.logErrors) return;

    const message = `[GitHub API Error] ${metadata.method} ${metadata.url}`;
    const data = {
      requestId: metadata.requestId,
      error: error.message,
      retryAttempt: metadata.retryAttempt,
    };

    this.log('error', message, data);
  }

  /**
   * Internal logging method
   *
   * @param level - Log level
   * @param message - Log message
   * @param data - Additional data
   */
  private log(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    data?: any
  ): void {
    const logData = data ? ` ${JSON.stringify(data)}` : '';
    console[level](`${message}${logData}`);
  }

  /**
   * Redacts sensitive data from objects
   *
   * @param data - Data to redact
   * @returns Redacted data
   */
  private redactData(data: any): any {
    if (!data) return data;
    if (typeof data !== 'object') return data;

    const sensitiveKeys = [
      'token',
      'access_token',
      'refresh_token',
      'client_secret',
      'private_key',
      'password',
      'authorization',
    ];

    const redacted = { ...data };
    for (const key of Object.keys(redacted)) {
      if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
        redacted[key] = '[REDACTED]';
      } else if (typeof redacted[key] === 'object') {
        redacted[key] = this.redactData(redacted[key]);
      }
    }

    return redacted;
  }

  /**
   * Redacts sensitive parts of URLs
   *
   * @param url - URL to redact
   * @returns Redacted URL
   */
  private redactUrl(url: string): string {
    if (!this.config.redactSensitive) return url;

    // Redact tokens in URL parameters
    return url.replace(
      /([?&])(access_token|token)=[^&]*/gi,
      '$1$2=[REDACTED]'
    );
  }
}

// ============================================================================
// Main GitHub Client
// ============================================================================

/**
 * Enterprise-grade GitHub API client
 */
export class GitHubClient {
  private readonly config: GitHubClientConfig;
  private readonly authManager: GitHubAuthManager;
  private readonly rateLimiter: RateLimiter;
  private readonly retryConfig: RetryConfig;
  private readonly logger: Logger;
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly timeout: number;

  /**
   * Creates a new GitHub client
   *
   * @param config - Client configuration
   */
  constructor(config: GitHubClientConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    this.userAgent = config.userAgent || DEFAULT_USER_AGENT;
    this.timeout = config.timeout || DEFAULT_TIMEOUT;

    // Initialize authentication manager
    this.authManager = new GitHubAuthManager(
      config.auth,
      config.encryptionKey
    );

    // Initialize rate limiter
    this.rateLimiter = new RateLimiter({
      ...DEFAULT_RATE_LIMIT_CONFIG,
      ...config.rateLimit,
    });

    // Initialize retry configuration
    this.retryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...config.retry,
    };

    // Initialize logger
    this.logger = new Logger({
      ...DEFAULT_LOGGING_CONFIG,
      ...config.logging,
    });
  }

  // ============================================================================
  // Repository Operations
  // ============================================================================

  /**
   * Lists repositories for the authenticated user
   *
   * @param options - List options
   * @returns Paginated repository list
   */
  async listRepositories(
    options: ListRepositoriesOptions = {}
  ): Promise<APIResponse<Repository[]>> {
    await this.validateScopes(SCOPE_REQUIREMENTS.REPO_READ);

    const params = new URLSearchParams();
    if (options.visibility) params.append('visibility', options.visibility);
    if (options.affiliation) params.append('affiliation', options.affiliation);
    if (options.type) params.append('type', options.type);
    if (options.sort) params.append('sort', options.sort);
    if (options.direction) params.append('direction', options.direction);
    if (options.per_page) params.append('per_page', options.per_page.toString());
    if (options.page) params.append('page', options.page.toString());

    return this.request<Repository[]>('GET', `/user/repos?${params.toString()}`);
  }

  /**
   * Gets a repository by owner and name
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @returns Repository data
   */
  async getRepository(owner: string, repo: string): Promise<APIResponse<Repository>> {
    await this.validateScopes(SCOPE_REQUIREMENTS.REPO_READ);
    return this.request<Repository>('GET', `/repos/${owner}/${repo}`);
  }

  /**
   * Creates a new repository
   *
   * @param options - Repository creation options
   * @returns Created repository
   */
  async createRepository(
    options: CreateRepositoryOptions
  ): Promise<APIResponse<Repository>> {
    await this.validateScopes(SCOPE_REQUIREMENTS.REPO_WRITE);

    const endpoint = options.org ? `/orgs/${options.org}/repos` : '/user/repos';
    return this.request<Repository>('POST', endpoint, options);
  }

  /**
   * Updates a repository
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param options - Update options
   * @returns Updated repository
   */
  async updateRepository(
    owner: string,
    repo: string,
    options: UpdateRepositoryOptions
  ): Promise<APIResponse<Repository>> {
    await this.validateScopes(SCOPE_REQUIREMENTS.REPO_WRITE);
    return this.request<Repository>('PATCH', `/repos/${owner}/${repo}`, options);
  }

  /**
   * Deletes a repository
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   */
  async deleteRepository(owner: string, repo: string): Promise<void> {
    await this.validateScopes(SCOPE_REQUIREMENTS.REPO_WRITE);
    await this.request<void>('DELETE', `/repos/${owner}/${repo}`);
  }

  // ============================================================================
  // Issue Operations
  // ============================================================================

  /**
   * Lists issues for a repository
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param options - List options
   * @returns Paginated issue list
   */
  async listIssues(
    owner: string,
    repo: string,
    options: ListIssuesOptions = {}
  ): Promise<APIResponse<Issue[]>> {
    await this.validateScopes(SCOPE_REQUIREMENTS.ISSUE_READ);

    const params = new URLSearchParams();
    if (options.state) params.append('state', options.state);
    if (options.labels) params.append('labels', options.labels);
    if (options.sort) params.append('sort', options.sort);
    if (options.direction) params.append('direction', options.direction);
    if (options.since) params.append('since', options.since);
    if (options.per_page) params.append('per_page', options.per_page.toString());
    if (options.page) params.append('page', options.page.toString());

    return this.request<Issue[]>(
      'GET',
      `/repos/${owner}/${repo}/issues?${params.toString()}`
    );
  }

  /**
   * Gets a single issue
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param issueNumber - Issue number
   * @returns Issue data
   */
  async getIssue(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<APIResponse<Issue>> {
    await this.validateScopes(SCOPE_REQUIREMENTS.ISSUE_READ);
    return this.request<Issue>(
      'GET',
      `/repos/${owner}/${repo}/issues/${issueNumber}`
    );
  }

  /**
   * Creates a new issue
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param options - Issue creation options
   * @returns Created issue
   */
  async createIssue(
    owner: string,
    repo: string,
    options: CreateIssueOptions
  ): Promise<APIResponse<Issue>> {
    await this.validateScopes(SCOPE_REQUIREMENTS.ISSUE_WRITE);
    return this.request<Issue>('POST', `/repos/${owner}/${repo}/issues`, options);
  }

  /**
   * Updates an issue
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param issueNumber - Issue number
   * @param options - Update options
   * @returns Updated issue
   */
  async updateIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    options: UpdateIssueOptions
  ): Promise<APIResponse<Issue>> {
    await this.validateScopes(SCOPE_REQUIREMENTS.ISSUE_WRITE);
    return this.request<Issue>(
      'PATCH',
      `/repos/${owner}/${repo}/issues/${issueNumber}`,
      options
    );
  }

  /**
   * Adds a comment to an issue
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param issueNumber - Issue number
   * @param body - Comment body
   * @returns Created comment
   */
  async addIssueComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string
  ): Promise<APIResponse<any>> {
    await this.validateScopes(SCOPE_REQUIREMENTS.ISSUE_WRITE);
    return this.request<any>(
      'POST',
      `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
      { body }
    );
  }

  // ============================================================================
  // Pull Request Operations
  // ============================================================================

  /**
   * Lists pull requests for a repository
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param options - List options
   * @returns Paginated PR list
   */
  async listPullRequests(
    owner: string,
    repo: string,
    options: Partial<ListIssuesOptions> = {}
  ): Promise<APIResponse<PullRequest[]>> {
    await this.validateScopes(SCOPE_REQUIREMENTS.PR_READ);

    const params = new URLSearchParams();
    if (options.state) params.append('state', options.state);
    if (options.sort) params.append('sort', options.sort);
    if (options.direction) params.append('direction', options.direction);
    if (options.per_page) params.append('per_page', options.per_page.toString());
    if (options.page) params.append('page', options.page.toString());

    return this.request<PullRequest[]>(
      'GET',
      `/repos/${owner}/${repo}/pulls?${params.toString()}`
    );
  }

  /**
   * Gets a single pull request
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param prNumber - Pull request number
   * @returns Pull request data
   */
  async getPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<APIResponse<PullRequest>> {
    await this.validateScopes(SCOPE_REQUIREMENTS.PR_READ);
    return this.request<PullRequest>(
      'GET',
      `/repos/${owner}/${repo}/pulls/${prNumber}`
    );
  }

  /**
   * Creates a new pull request
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param options - PR creation options
   * @returns Created pull request
   */
  async createPullRequest(
    owner: string,
    repo: string,
    options: CreatePullRequestOptions
  ): Promise<APIResponse<PullRequest>> {
    await this.validateScopes(SCOPE_REQUIREMENTS.PR_WRITE);
    return this.request<PullRequest>(
      'POST',
      `/repos/${owner}/${repo}/pulls`,
      options
    );
  }

  /**
   * Updates a pull request
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param prNumber - Pull request number
   * @param options - Update options
   * @returns Updated pull request
   */
  async updatePullRequest(
    owner: string,
    repo: string,
    prNumber: number,
    options: UpdatePullRequestOptions
  ): Promise<APIResponse<PullRequest>> {
    await this.validateScopes(SCOPE_REQUIREMENTS.PR_WRITE);
    return this.request<PullRequest>(
      'PATCH',
      `/repos/${owner}/${repo}/pulls/${prNumber}`,
      options
    );
  }

  /**
   * Merges a pull request
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param prNumber - Pull request number
   * @param options - Merge options
   * @returns Merge result
   */
  async mergePullRequest(
    owner: string,
    repo: string,
    prNumber: number,
    options: MergePullRequestOptions = {}
  ): Promise<APIResponse<{ merged: boolean; message: string; sha: string }>> {
    await this.validateScopes(SCOPE_REQUIREMENTS.PR_WRITE);
    return this.request<{ merged: boolean; message: string; sha: string }>(
      'PUT',
      `/repos/${owner}/${repo}/pulls/${prNumber}/merge`,
      options
    );
  }

  // ============================================================================
  // Core Request Methods
  // ============================================================================

  /**
   * Makes an HTTP request to the GitHub API
   *
   * @param method - HTTP method
   * @param path - API endpoint path
   * @param body - Request body
   * @param retryAttempt - Current retry attempt
   * @returns API response
   */
  private async request<T>(
    method: string,
    path: string,
    body?: any,
    retryAttempt = 0
  ): Promise<APIResponse<T>> {
    // Generate request ID
    const requestId = crypto.randomUUID();
    const startTime = Date.now();

    const metadata: RequestMetadata = {
      requestId,
      timestamp: startTime,
      method,
      url: `${this.baseUrl}${path}`,
      retryAttempt,
    };

    try {
      // Acquire rate limit token
      await this.rateLimiter.acquireToken();

      // Get authentication token
      const token = await this.authManager.getAccessToken();

      // Log request
      this.logger.logRequest(metadata, body);

      // Make request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': this.userAgent,
          'Content-Type': 'application/json',
          'X-Request-Id': requestId,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Update rate limiter from headers
      const rateLimitInfo = this.extractRateLimitInfo(response.headers);
      if (rateLimitInfo) {
        this.rateLimiter.updateFromHeaders(rateLimitInfo);
      }

      // Calculate duration
      metadata.duration = Date.now() - startTime;

      // Handle response
      if (!response.ok) {
        return this.handleErrorResponse(response, metadata, method, path, body, retryAttempt);
      }

      // Parse response
      const data = await this.parseResponse<T>(response);

      // Log response
      this.logger.logResponse(metadata, response.status, data);

      // Extract pagination info
      const pagination = this.extractPaginationInfo(response.headers);

      return {
        data,
        pagination,
        rateLimit: rateLimitInfo!,
        headers: Object.fromEntries(response.headers.entries()),
        status: response.status,
      };
    } catch (error) {
      this.logger.logError(metadata, error as Error);

      // Retry on retryable errors
      if (
        retryAttempt < this.retryConfig.maxRetries &&
        this.isRetryableError(error)
      ) {
        const delay = this.calculateRetryDelay(retryAttempt);
        await this.sleep(delay);
        return this.request<T>(method, path, body, retryAttempt + 1);
      }

      throw error;
    }
  }

  /**
   * Handles error responses with retry logic
   *
   * @param response - HTTP response
   * @param metadata - Request metadata
   * @param method - HTTP method
   * @param path - API path
   * @param body - Request body
   * @param retryAttempt - Current retry attempt
   * @returns API response or throws error
   */
  private async handleErrorResponse<T>(
    response: Response,
    metadata: RequestMetadata,
    method: string,
    path: string,
    body: any,
    retryAttempt: number
  ): Promise<APIResponse<T>> {
    const errorData = await this.parseResponse<APIError>(response);

    this.logger.logResponse(metadata, response.status, errorData);

    const error: APIError = {
      message: errorData.message || response.statusText,
      status: response.status,
      ...errorData,
    };

    // Retry on retryable status codes
    if (
      this.retryConfig.retryableStatusCodes.includes(response.status) &&
      retryAttempt < this.retryConfig.maxRetries
    ) {
      const delay = this.calculateRetryDelay(retryAttempt);
      await this.sleep(delay);
      return this.request<T>(method, path, body, retryAttempt + 1);
    }

    throw new Error(
      `GitHub API error (${error.status}): ${error.message}`
    );
  }

  /**
   * Parses API response
   *
   * @param response - HTTP response
   * @returns Parsed data
   */
  private async parseResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      return response.json();
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  /**
   * Extracts rate limit information from response headers
   *
   * @param headers - Response headers
   * @returns Rate limit information
   */
  private extractRateLimitInfo(headers: Headers): RateLimitInfo | null {
    const limit = headers.get('x-ratelimit-limit');
    const remaining = headers.get('x-ratelimit-remaining');
    const reset = headers.get('x-ratelimit-reset');
    const used = headers.get('x-ratelimit-used');
    const resource = headers.get('x-ratelimit-resource');

    if (!limit || !remaining || !reset) {
      return null;
    }

    return {
      limit: parseInt(limit, 10),
      remaining: parseInt(remaining, 10),
      reset: parseInt(reset, 10),
      used: used ? parseInt(used, 10) : 0,
      resource: resource || 'core',
    };
  }

  /**
   * Extracts pagination information from response headers
   *
   * @param headers - Response headers
   * @returns Pagination information
   */
  private extractPaginationInfo(headers: Headers): PaginationInfo | undefined {
    const linkHeader = headers.get('link');
    if (!linkHeader) {
      return undefined;
    }

    const links = this.parseLinkHeader(linkHeader);
    const page = parseInt(links.current?.page || '1', 10);
    const perPage = parseInt(links.current?.per_page || '30', 10);

    return {
      page,
      per_page: perPage,
      hasNext: !!links.next,
      hasPrev: !!links.prev,
      nextPage: links.next ? parseInt(links.next.page || '', 10) : undefined,
      prevPage: links.prev ? parseInt(links.prev.page || '', 10) : undefined,
    };
  }

  /**
   * Parses Link header for pagination
   *
   * @param linkHeader - Link header value
   * @returns Parsed links
   */
  private parseLinkHeader(linkHeader: string): Record<string, any> {
    const links: Record<string, any> = {};
    const parts = linkHeader.split(',');

    for (const part of parts) {
      const [urlPart, relPart] = part.split(';');
      const url = urlPart.trim().slice(1, -1);
      const rel = relPart.match(/rel="([^"]+)"/)?.[1];

      if (rel && url) {
        const params = new URL(url).searchParams;
        links[rel] = {
          page: params.get('page'),
          per_page: params.get('per_page'),
        };
      }
    }

    return links;
  }

  /**
   * Calculates retry delay with exponential backoff
   *
   * @param retryAttempt - Current retry attempt
   * @returns Delay in milliseconds
   */
  private calculateRetryDelay(retryAttempt: number): number {
    const delay =
      this.retryConfig.baseDelay *
      Math.pow(this.retryConfig.backoffMultiplier, retryAttempt);

    return Math.min(delay, this.retryConfig.maxDelay);
  }

  /**
   * Checks if an error is retryable
   *
   * @param error - Error object
   * @returns True if error is retryable
   */
  private isRetryableError(error: any): boolean {
    // Network errors
    if (
      error.name === 'AbortError' ||
      error.name === 'TimeoutError' ||
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT'
    ) {
      return true;
    }

    return false;
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

  /**
   * Validates token scopes for an operation
   *
   * @param requirement - Scope requirement
   */
  private async validateScopes(requirement: ScopeRequirement): Promise<void> {
    if (!this.config.validateScopes) {
      return;
    }

    await this.authManager.validateTokenScopes(requirement);
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Gets the current rate limit status
   *
   * @returns Rate limit status
   */
  getRateLimitStatus(): { available: number; queued: number } {
    return this.rateLimiter.getStatus();
  }

  /**
   * Gets the current authentication type
   *
   * @returns Auth type
   */
  getAuthType(): 'token' | 'oauth' | 'app' {
    return this.authManager.getAuthType();
  }

  /**
   * Refreshes the authentication token
   */
  async refreshAuth(): Promise<void> {
    await this.authManager.refreshToken();
  }
}

// ============================================================================
// Exports
// ============================================================================

export default GitHubClient;
