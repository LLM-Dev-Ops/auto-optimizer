/**
 * GitHub Integration - Main Export
 *
 * Enterprise-grade GitHub API integration for the LLM Auto Optimizer.
 *
 * Features:
 * - OAuth authentication with token encryption
 * - Complete repository operations (CRUD)
 * - Issue and pull request management
 * - Webhook event handling with signature validation
 * - Rate limiting (5000 req/hour) with automatic throttling
 * - Exponential backoff retry logic
 * - Comprehensive logging with sensitive data redaction
 *
 * @module github-integration
 * @version 1.0.0
 *
 * @example
 * ```typescript
 * import { GitHubClient } from '@llm-auto-optimizer/github-integration';
 *
 * const client = new GitHubClient({
 *   auth: {
 *     type: 'token',
 *     config: {
 *       token: 'ghp_your_token_here',
 *       scopes: ['repo', 'user'],
 *     },
 *   },
 * });
 *
 * const repos = await client.listRepositories();
 * ```
 */

// ============================================================================
// Main Exports
// ============================================================================

export { default as GitHubClient } from './github-client';
export { default as GitHubAuthManager } from './github-auth';
export { default as GitHubWebhookProcessor } from './github-webhooks';

// ============================================================================
// Authentication Exports
// ============================================================================

export {
  encryptToken,
  decryptToken,
  generateEncryptionKey,
  validateScopes,
  parseScopes,
  hasScope,
  getOAuthAuthorizationUrl,
  exchangeOAuthCode,
  generateStateToken,
  SCOPE_REQUIREMENTS,
} from './github-auth';

// ============================================================================
// Webhook Exports
// ============================================================================

export {
  validateWebhookSignature,
  generateWebhookSignature,
  validateWebhookRequest,
  parseWebhookPayload,
  createWebhookConfig,
  generateWebhookSecret,
  verifyPingEvent,
  isPushToBranch,
  isPullRequestAction,
  isIssueAction,
  extractCommitInfo,
  isCreationEvent,
  isDeletionEvent,
  isForcePush,
  WebhookRetryHandler,
} from './github-webhooks';

export type {
  WebhookEventHandler,
  WebhookContext,
  WebhookValidationResult,
  WebhookProcessingResult,
} from './github-webhooks';

// ============================================================================
// Type Exports
// ============================================================================

export type {
  // Authentication types
  GitHubAuthConfig,
  GitHubOAuthConfig,
  GitHubTokenConfig,
  GitHubAppConfig,
  GitHubOAuthToken,
  EncryptedString,
  ScopeRequirement,

  // Rate limiting types
  RateLimitInfo,
  RateLimitConfig,

  // Repository types
  Repository,
  RepositoryOwner,
  CreateRepositoryOptions,
  UpdateRepositoryOptions,
  ListRepositoriesOptions,

  // Issue types
  Issue,
  IssueLabel,
  IssueMilestone,
  CreateIssueOptions,
  UpdateIssueOptions,
  ListIssuesOptions,

  // Pull request types
  PullRequest,
  CreatePullRequestOptions,
  UpdatePullRequestOptions,
  MergePullRequestOptions,

  // Webhook types
  WebhookEventType,
  WebhookPayload,
  PushWebhookPayload,
  PullRequestWebhookPayload,
  IssuesWebhookPayload,
  WebhookConfig,
  CreateWebhookOptions,

  // Client configuration types
  GitHubClientConfig,
  RetryConfig,
  LoggingConfig,

  // API response types
  APIResponse,
  APIError,
  PaginationInfo,
  RequestMetadata,

  // User type
  User,
} from './github-types';
