/**
 * GitHub Integration - TypeScript Type Definitions
 *
 * Complete type system for GitHub API interactions with enterprise-grade quality.
 * Supports OAuth authentication, repository operations, issue/PR management, and webhooks.
 *
 * @module github-types
 * @version 1.0.0
 */

// ============================================================================
// Authentication Types
// ============================================================================

/**
 * OAuth authentication configuration for GitHub Apps and OAuth Apps
 */
export interface GitHubOAuthConfig {
  /** OAuth client ID */
  clientId: string;

  /** OAuth client secret (encrypted at rest) */
  clientSecret: string;

  /** OAuth callback URL for authorization flow */
  callbackUrl: string;

  /** OAuth scopes requested (e.g., 'repo', 'user', 'admin:org') */
  scopes: string[];
}

/**
 * Personal Access Token configuration
 */
export interface GitHubTokenConfig {
  /** Personal access token (encrypted at rest) */
  token: string;

  /** Token scopes for validation */
  scopes: string[];

  /** Token expiration timestamp (optional) */
  expiresAt?: Date;
}

/**
 * GitHub App authentication configuration
 */
export interface GitHubAppConfig {
  /** GitHub App ID */
  appId: string;

  /** GitHub App private key (PEM format, encrypted at rest) */
  privateKey: string;

  /** Installation ID for the GitHub App */
  installationId: string;

  /** Client ID for the GitHub App */
  clientId?: string;

  /** Client secret for the GitHub App */
  clientSecret?: string;
}

/**
 * Unified authentication configuration
 */
export type GitHubAuthConfig =
  | { type: 'oauth'; config: GitHubOAuthConfig }
  | { type: 'token'; config: GitHubTokenConfig }
  | { type: 'app'; config: GitHubAppConfig };

/**
 * OAuth token response from GitHub
 */
export interface GitHubOAuthToken {
  /** Access token */
  access_token: string;

  /** Token type (usually 'bearer') */
  token_type: string;

  /** Granted scopes */
  scope: string;

  /** Refresh token (if available) */
  refresh_token?: string;

  /** Token expiration in seconds */
  expires_in?: number;

  /** Refresh token expiration in seconds */
  refresh_token_expires_in?: number;
}

// ============================================================================
// Rate Limiting Types
// ============================================================================

/**
 * GitHub API rate limit information
 */
export interface RateLimitInfo {
  /** Maximum requests per hour */
  limit: number;

  /** Remaining requests in current window */
  remaining: number;

  /** Timestamp when rate limit resets */
  reset: number;

  /** Number of requests used in current window */
  used: number;

  /** Resource type (core, search, graphql, etc.) */
  resource: string;
}

/**
 * Rate limit configuration for client
 */
export interface RateLimitConfig {
  /** Maximum requests per hour (default: 5000) */
  maxRequestsPerHour: number;

  /** Enable automatic rate limit handling */
  enableAutoThrottle: boolean;

  /** Minimum remaining requests before throttling */
  throttleThreshold: number;

  /** Enable request queuing when rate limited */
  enableQueueing: boolean;

  /** Maximum queue size */
  maxQueueSize: number;
}

// ============================================================================
// Repository Types
// ============================================================================

/**
 * Repository owner information
 */
export interface RepositoryOwner {
  /** Owner login (username or organization name) */
  login: string;

  /** Owner ID */
  id: number;

  /** Owner type */
  type: 'User' | 'Organization';

  /** Avatar URL */
  avatar_url?: string;

  /** Profile URL */
  html_url?: string;
}

/**
 * Complete repository information
 */
export interface Repository {
  /** Repository ID */
  id: number;

  /** Repository node ID (GraphQL) */
  node_id: string;

  /** Repository name */
  name: string;

  /** Full repository name (owner/repo) */
  full_name: string;

  /** Repository owner */
  owner: RepositoryOwner;

  /** Is private repository */
  private: boolean;

  /** Repository description */
  description: string | null;

  /** Is fork */
  fork: boolean;

  /** Repository URL */
  html_url: string;

  /** Clone URL (HTTPS) */
  clone_url: string;

  /** SSH URL */
  ssh_url: string;

  /** Default branch */
  default_branch: string;

  /** Creation timestamp */
  created_at: string;

  /** Last update timestamp */
  updated_at: string;

  /** Last push timestamp */
  pushed_at: string;

  /** Size in KB */
  size: number;

  /** Star count */
  stargazers_count: number;

  /** Watcher count */
  watchers_count: number;

  /** Fork count */
  forks_count: number;

  /** Open issue count */
  open_issues_count: number;

  /** Primary language */
  language: string | null;

  /** Has issues enabled */
  has_issues: boolean;

  /** Has projects enabled */
  has_projects: boolean;

  /** Has wiki enabled */
  has_wiki: boolean;

  /** Is archived */
  archived: boolean;

  /** Is disabled */
  disabled: boolean;

  /** Repository visibility */
  visibility?: 'public' | 'private' | 'internal';

  /** Repository license */
  license?: {
    key: string;
    name: string;
    spdx_id: string;
    url: string | null;
  };

  /** Repository topics */
  topics?: string[];
}

/**
 * Options for creating a repository
 */
export interface CreateRepositoryOptions {
  /** Repository name (required) */
  name: string;

  /** Repository description */
  description?: string;

  /** Homepage URL */
  homepage?: string;

  /** Create as private repository */
  private?: boolean;

  /** Initialize with README */
  auto_init?: boolean;

  /** gitignore template name */
  gitignore_template?: string;

  /** License template key */
  license_template?: string;

  /** Allow squash merging */
  allow_squash_merge?: boolean;

  /** Allow merge commits */
  allow_merge_commit?: boolean;

  /** Allow rebase merging */
  allow_rebase_merge?: boolean;

  /** Allow auto-merge */
  allow_auto_merge?: boolean;

  /** Delete head branch on merge */
  delete_branch_on_merge?: boolean;

  /** Has issues enabled */
  has_issues?: boolean;

  /** Has projects enabled */
  has_projects?: boolean;

  /** Has wiki enabled */
  has_wiki?: boolean;

  /** Organization name (for org repos) */
  org?: string;
}

/**
 * Options for updating a repository
 */
export interface UpdateRepositoryOptions {
  /** Repository name */
  name?: string;

  /** Repository description */
  description?: string;

  /** Homepage URL */
  homepage?: string;

  /** Make private/public */
  private?: boolean;

  /** Default branch */
  default_branch?: string;

  /** Allow squash merging */
  allow_squash_merge?: boolean;

  /** Allow merge commits */
  allow_merge_commit?: boolean;

  /** Allow rebase merging */
  allow_rebase_merge?: boolean;

  /** Archive repository */
  archived?: boolean;
}

/**
 * Options for listing repositories
 */
export interface ListRepositoriesOptions {
  /** Filter by visibility */
  visibility?: 'all' | 'public' | 'private';

  /** Filter by affiliation */
  affiliation?: 'owner' | 'collaborator' | 'organization_member';

  /** Filter by type */
  type?: 'all' | 'owner' | 'public' | 'private' | 'member';

  /** Sort by */
  sort?: 'created' | 'updated' | 'pushed' | 'full_name';

  /** Sort direction */
  direction?: 'asc' | 'desc';

  /** Results per page (max 100) */
  per_page?: number;

  /** Page number */
  page?: number;
}

// ============================================================================
// Issue Types
// ============================================================================

/**
 * Issue label
 */
export interface IssueLabel {
  /** Label ID */
  id: number;

  /** Label node ID */
  node_id: string;

  /** Label name */
  name: string;

  /** Label description */
  description: string | null;

  /** Label color (hex without #) */
  color: string;

  /** Is default label */
  default: boolean;
}

/**
 * Issue milestone
 */
export interface IssueMilestone {
  /** Milestone ID */
  id: number;

  /** Milestone node ID */
  node_id: string;

  /** Milestone number */
  number: number;

  /** Milestone title */
  title: string;

  /** Milestone description */
  description: string | null;

  /** Milestone state */
  state: 'open' | 'closed';

  /** Open issue count */
  open_issues: number;

  /** Closed issue count */
  closed_issues: number;

  /** Creation timestamp */
  created_at: string;

  /** Last update timestamp */
  updated_at: string;

  /** Due date */
  due_on: string | null;

  /** Closed timestamp */
  closed_at: string | null;
}

/**
 * GitHub user (simplified)
 */
export interface User {
  /** User ID */
  id: number;

  /** User login */
  login: string;

  /** User type */
  type: 'User' | 'Bot' | 'Organization';

  /** Avatar URL */
  avatar_url?: string;

  /** Profile URL */
  html_url?: string;
}

/**
 * Issue information
 */
export interface Issue {
  /** Issue ID */
  id: number;

  /** Issue node ID */
  node_id: string;

  /** Issue number */
  number: number;

  /** Issue title */
  title: string;

  /** Issue body */
  body: string | null;

  /** Issue state */
  state: 'open' | 'closed';

  /** State reason */
  state_reason?: 'completed' | 'not_planned' | 'reopened' | null;

  /** Issue creator */
  user: User;

  /** Issue labels */
  labels: IssueLabel[];

  /** Issue assignees */
  assignees: User[];

  /** Issue milestone */
  milestone: IssueMilestone | null;

  /** Comment count */
  comments: number;

  /** Creation timestamp */
  created_at: string;

  /** Last update timestamp */
  updated_at: string;

  /** Closed timestamp */
  closed_at: string | null;

  /** Issue URL */
  html_url: string;

  /** Is locked */
  locked: boolean;

  /** Is pull request */
  pull_request?: {
    url: string;
    html_url: string;
    diff_url: string;
    patch_url: string;
  };
}

/**
 * Options for creating an issue
 */
export interface CreateIssueOptions {
  /** Issue title (required) */
  title: string;

  /** Issue body */
  body?: string;

  /** Assignees (usernames) */
  assignees?: string[];

  /** Milestone number */
  milestone?: number;

  /** Label names */
  labels?: string[];
}

/**
 * Options for updating an issue
 */
export interface UpdateIssueOptions {
  /** Issue title */
  title?: string;

  /** Issue body */
  body?: string;

  /** Issue state */
  state?: 'open' | 'closed';

  /** State reason */
  state_reason?: 'completed' | 'not_planned' | 'reopened';

  /** Assignees (usernames) */
  assignees?: string[];

  /** Milestone number */
  milestone?: number | null;

  /** Label names */
  labels?: string[];
}

/**
 * Options for listing issues
 */
export interface ListIssuesOptions {
  /** Filter by state */
  state?: 'open' | 'closed' | 'all';

  /** Filter by labels (comma-separated) */
  labels?: string;

  /** Sort by */
  sort?: 'created' | 'updated' | 'comments';

  /** Sort direction */
  direction?: 'asc' | 'desc';

  /** Filter by milestone number */
  milestone?: number | 'none' | '*';

  /** Filter by assignee */
  assignee?: string | 'none' | '*';

  /** Filter by creator */
  creator?: string;

  /** Filter by mentioned user */
  mentioned?: string;

  /** Filter since timestamp */
  since?: string;

  /** Results per page (max 100) */
  per_page?: number;

  /** Page number */
  page?: number;
}

// ============================================================================
// Pull Request Types
// ============================================================================

/**
 * Pull request information
 */
export interface PullRequest extends Omit<Issue, 'pull_request'> {
  /** PR head (source branch) */
  head: {
    ref: string;
    sha: string;
    repo: Repository;
  };

  /** PR base (target branch) */
  base: {
    ref: string;
    sha: string;
    repo: Repository;
  };

  /** Is draft PR */
  draft: boolean;

  /** Is merged */
  merged: boolean;

  /** Mergeable state */
  mergeable: boolean | null;

  /** Mergeable state detail */
  mergeable_state?: string;

  /** Merged by user */
  merged_by: User | null;

  /** Merge timestamp */
  merged_at: string | null;

  /** Diff URL */
  diff_url: string;

  /** Patch URL */
  patch_url: string;

  /** Changed files count */
  changed_files: number;

  /** Additions count */
  additions: number;

  /** Deletions count */
  deletions: number;

  /** Commits count */
  commits: number;

  /** Review comments count */
  review_comments: number;

  /** Maintainer can modify */
  maintainer_can_modify: boolean;
}

/**
 * Options for creating a pull request
 */
export interface CreatePullRequestOptions {
  /** PR title (required) */
  title: string;

  /** PR body */
  body?: string;

  /** Head branch (required) */
  head: string;

  /** Base branch (required) */
  base: string;

  /** Create as draft PR */
  draft?: boolean;

  /** Maintainer can modify */
  maintainer_can_modify?: boolean;
}

/**
 * Options for updating a pull request
 */
export interface UpdatePullRequestOptions {
  /** PR title */
  title?: string;

  /** PR body */
  body?: string;

  /** PR state */
  state?: 'open' | 'closed';

  /** Base branch */
  base?: string;

  /** Maintainer can modify */
  maintainer_can_modify?: boolean;
}

/**
 * Options for merging a pull request
 */
export interface MergePullRequestOptions {
  /** Commit title */
  commit_title?: string;

  /** Commit message */
  commit_message?: string;

  /** Merge method */
  merge_method?: 'merge' | 'squash' | 'rebase';

  /** SHA that PR head must match */
  sha?: string;
}

// ============================================================================
// Webhook Types
// ============================================================================

/**
 * Webhook event types
 */
export type WebhookEventType =
  | 'push'
  | 'pull_request'
  | 'pull_request_review'
  | 'pull_request_review_comment'
  | 'issues'
  | 'issue_comment'
  | 'create'
  | 'delete'
  | 'fork'
  | 'star'
  | 'watch'
  | 'release'
  | 'deployment'
  | 'deployment_status'
  | 'status'
  | 'check_run'
  | 'check_suite'
  | 'workflow_run'
  | 'workflow_job'
  | 'repository'
  | 'organization'
  | 'member'
  | 'team'
  | 'team_add'
  | 'membership'
  | 'ping';

/**
 * Webhook payload base interface
 */
export interface WebhookPayload {
  /** Action performed (varies by event type) */
  action?: string;

  /** Repository information */
  repository?: Repository;

  /** Organization information */
  organization?: RepositoryOwner;

  /** Sender (user who triggered the event) */
  sender?: User;

  /** Installation information (for GitHub Apps) */
  installation?: {
    id: number;
    node_id: string;
  };
}

/**
 * Push webhook payload
 */
export interface PushWebhookPayload extends WebhookPayload {
  /** Reference (e.g., refs/heads/main) */
  ref: string;

  /** Before commit SHA */
  before: string;

  /** After commit SHA */
  after: string;

  /** Created branch/tag */
  created: boolean;

  /** Deleted branch/tag */
  deleted: boolean;

  /** Forced push */
  forced: boolean;

  /** Base ref */
  base_ref: string | null;

  /** Compare URL */
  compare: string;

  /** Commit list */
  commits: Array<{
    id: string;
    message: string;
    timestamp: string;
    author: {
      name: string;
      email: string;
      username?: string;
    };
    url: string;
    distinct: boolean;
  }>;

  /** Head commit */
  head_commit: {
    id: string;
    message: string;
    timestamp: string;
    url: string;
  };
}

/**
 * Pull request webhook payload
 */
export interface PullRequestWebhookPayload extends WebhookPayload {
  /** Action performed */
  action: 'opened' | 'closed' | 'reopened' | 'synchronize' | 'edited' | 'assigned' | 'unassigned' | 'labeled' | 'unlabeled' | 'review_requested' | 'review_request_removed' | 'ready_for_review' | 'converted_to_draft';

  /** Pull request number */
  number: number;

  /** Pull request data */
  pull_request: PullRequest;
}

/**
 * Issues webhook payload
 */
export interface IssuesWebhookPayload extends WebhookPayload {
  /** Action performed */
  action: 'opened' | 'closed' | 'reopened' | 'edited' | 'assigned' | 'unassigned' | 'labeled' | 'unlabeled' | 'locked' | 'unlocked' | 'transferred' | 'pinned' | 'unpinned';

  /** Issue data */
  issue: Issue;
}

/**
 * Webhook configuration
 */
export interface WebhookConfig {
  /** Webhook URL */
  url: string;

  /** Content type */
  content_type: 'json' | 'form';

  /** Secret for signature validation */
  secret?: string;

  /** Insecure SSL (development only) */
  insecure_ssl?: '0' | '1';
}

/**
 * Webhook creation options
 */
export interface CreateWebhookOptions {
  /** Webhook name */
  name: string;

  /** Webhook configuration */
  config: WebhookConfig;

  /** Events to subscribe to */
  events: WebhookEventType[];

  /** Is webhook active */
  active?: boolean;
}

// ============================================================================
// Client Configuration Types
// ============================================================================

/**
 * Retry configuration for failed requests
 */
export interface RetryConfig {
  /** Maximum retry attempts */
  maxRetries: number;

  /** Base delay in milliseconds */
  baseDelay: number;

  /** Maximum delay in milliseconds */
  maxDelay: number;

  /** Exponential backoff multiplier */
  backoffMultiplier: number;

  /** HTTP status codes to retry */
  retryableStatusCodes: number[];
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
  /** Enable request logging */
  logRequests: boolean;

  /** Enable response logging */
  logResponses: boolean;

  /** Enable error logging */
  logErrors: boolean;

  /** Log level */
  level: 'debug' | 'info' | 'warn' | 'error';

  /** Redact sensitive data */
  redactSensitive: boolean;
}

/**
 * Complete GitHub client configuration
 */
export interface GitHubClientConfig {
  /** Authentication configuration */
  auth: GitHubAuthConfig;

  /** GitHub API base URL (default: https://api.github.com) */
  baseUrl?: string;

  /** User agent string */
  userAgent?: string;

  /** Request timeout in milliseconds */
  timeout?: number;

  /** Rate limiting configuration */
  rateLimit?: Partial<RateLimitConfig>;

  /** Retry configuration */
  retry?: Partial<RetryConfig>;

  /** Logging configuration */
  logging?: Partial<LoggingConfig>;

  /** Enable token encryption at rest */
  enableTokenEncryption?: boolean;

  /** Encryption key for sensitive data (base64 encoded) */
  encryptionKey?: string;

  /** Validate scopes on initialization */
  validateScopes?: boolean;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Paginated response metadata
 */
export interface PaginationInfo {
  /** Current page */
  page: number;

  /** Results per page */
  per_page: number;

  /** Total count (if available) */
  total?: number;

  /** Has next page */
  hasNext: boolean;

  /** Has previous page */
  hasPrev: boolean;

  /** Next page number */
  nextPage?: number;

  /** Previous page number */
  prevPage?: number;
}

/**
 * Generic API response with pagination
 */
export interface APIResponse<T> {
  /** Response data */
  data: T;

  /** Pagination information */
  pagination?: PaginationInfo;

  /** Rate limit information */
  rateLimit: RateLimitInfo;

  /** Response headers */
  headers: Record<string, string>;

  /** HTTP status code */
  status: number;
}

/**
 * API error details
 */
export interface APIError {
  /** Error message */
  message: string;

  /** Error code */
  code?: string;

  /** HTTP status code */
  status: number;

  /** Documentation URL */
  documentation_url?: string;

  /** Detailed errors */
  errors?: Array<{
    resource: string;
    field: string;
    code: string;
    message?: string;
  }>;

  /** Request ID for debugging */
  request_id?: string;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Branded type for encrypted strings
 */
export type EncryptedString = string & { __brand: 'EncryptedString' };

/**
 * Required scope validator
 */
export interface ScopeRequirement {
  /** Required scopes */
  required: string[];

  /** Optional scopes */
  optional?: string[];

  /** Scope description */
  description: string;
}

/**
 * Request metadata for logging and debugging
 */
export interface RequestMetadata {
  /** Request ID */
  requestId: string;

  /** Request timestamp */
  timestamp: number;

  /** Request method */
  method: string;

  /** Request URL */
  url: string;

  /** Request duration in milliseconds */
  duration?: number;

  /** Retry attempt number */
  retryAttempt?: number;
}
