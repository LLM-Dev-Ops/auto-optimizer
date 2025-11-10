/**
 * GitHub Integration - Authentication Module
 *
 * Handles OAuth authentication, token management, and encryption for GitHub API.
 * Implements enterprise-grade security with token encryption, scope validation,
 * and automatic token refresh.
 *
 * @module github-auth
 * @version 1.0.0
 */

import crypto from 'crypto';
import {
  GitHubAuthConfig,
  GitHubOAuthConfig,
  GitHubTokenConfig,
  GitHubAppConfig,
  GitHubOAuthToken,
  EncryptedString,
  ScopeRequirement,
} from './github-types';

// ============================================================================
// Constants
// ============================================================================

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

/**
 * Predefined scope requirements for common operations
 */
export const SCOPE_REQUIREMENTS: Record<string, ScopeRequirement> = {
  REPO_READ: {
    required: ['repo'],
    description: 'Read repository data',
  },
  REPO_WRITE: {
    required: ['repo'],
    description: 'Write to repositories',
  },
  ISSUE_READ: {
    required: ['repo'],
    optional: ['public_repo'],
    description: 'Read issues',
  },
  ISSUE_WRITE: {
    required: ['repo'],
    description: 'Create and modify issues',
  },
  PR_READ: {
    required: ['repo'],
    optional: ['public_repo'],
    description: 'Read pull requests',
  },
  PR_WRITE: {
    required: ['repo'],
    description: 'Create and modify pull requests',
  },
  WEBHOOK_ADMIN: {
    required: ['admin:repo_hook'],
    description: 'Manage repository webhooks',
  },
  ORG_READ: {
    required: ['read:org'],
    description: 'Read organization data',
  },
  ORG_WRITE: {
    required: ['admin:org'],
    description: 'Manage organization',
  },
};

// ============================================================================
// Token Encryption Utilities
// ============================================================================

/**
 * Derives an encryption key from a password using PBKDF2
 *
 * @param password - Base password/key
 * @param salt - Salt for key derivation
 * @returns Derived encryption key
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
}

/**
 * Encrypts sensitive data using AES-256-GCM
 *
 * @param plaintext - Data to encrypt
 * @param encryptionKey - Base64 encoded encryption key
 * @returns Encrypted string with IV, salt, and auth tag
 * @throws Error if encryption fails
 */
export function encryptToken(
  plaintext: string,
  encryptionKey: string
): EncryptedString {
  try {
    // Generate random IV and salt
    const iv = crypto.randomBytes(IV_LENGTH);
    const salt = crypto.randomBytes(SALT_LENGTH);

    // Derive encryption key
    const key = deriveKey(encryptionKey, salt);

    // Create cipher
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

    // Encrypt data
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    // Combine salt, IV, auth tag, and encrypted data
    const result = Buffer.concat([
      salt,
      iv,
      authTag,
      Buffer.from(encrypted, 'hex'),
    ]);

    return result.toString('base64') as EncryptedString;
  } catch (error) {
    throw new Error(
      `Token encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Decrypts encrypted token data
 *
 * @param encrypted - Encrypted string to decrypt
 * @param encryptionKey - Base64 encoded encryption key
 * @returns Decrypted plaintext
 * @throws Error if decryption fails
 */
export function decryptToken(
  encrypted: EncryptedString,
  encryptionKey: string
): string {
  try {
    // Decode base64
    const buffer = Buffer.from(encrypted, 'base64');

    // Extract components
    const salt = buffer.subarray(0, SALT_LENGTH);
    const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = buffer.subarray(
      SALT_LENGTH + IV_LENGTH,
      SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
    );
    const encryptedData = buffer.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

    // Derive encryption key
    const key = deriveKey(encryptionKey, salt);

    // Create decipher
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt data
    let decrypted = decipher.update(encryptedData.toString('hex'), 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    throw new Error(
      `Token decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Generates a secure random encryption key
 *
 * @returns Base64 encoded encryption key
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('base64');
}

// ============================================================================
// Scope Validation
// ============================================================================

/**
 * Validates that granted scopes meet requirements
 *
 * @param grantedScopes - Scopes granted to the token
 * @param requirement - Scope requirement to validate
 * @returns Validation result
 */
export function validateScopes(
  grantedScopes: string[],
  requirement: ScopeRequirement
): {
  valid: boolean;
  missing: string[];
  message: string;
} {
  const missing = requirement.required.filter(
    (scope) => !grantedScopes.includes(scope)
  );

  if (missing.length > 0) {
    return {
      valid: false,
      missing,
      message: `Missing required scopes for ${requirement.description}: ${missing.join(', ')}`,
    };
  }

  return {
    valid: true,
    missing: [],
    message: 'All required scopes are present',
  };
}

/**
 * Parses scope string into array
 *
 * @param scopeString - Comma-separated scope string
 * @returns Array of scope names
 */
export function parseScopes(scopeString: string): string[] {
  return scopeString
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Checks if a specific scope or scope group is present
 *
 * @param grantedScopes - Scopes granted to the token
 * @param requiredScope - Scope or scope pattern to check
 * @returns True if scope is present
 */
export function hasScope(grantedScopes: string[], requiredScope: string): boolean {
  // Check for exact match
  if (grantedScopes.includes(requiredScope)) {
    return true;
  }

  // Check for parent scope (e.g., 'repo' includes 'repo:status')
  const parts = requiredScope.split(':');
  if (parts.length > 1) {
    return grantedScopes.includes(parts[0]);
  }

  return false;
}

// ============================================================================
// GitHub Authentication Manager
// ============================================================================

/**
 * Manages GitHub authentication and token lifecycle
 */
export class GitHubAuthManager {
  private config: GitHubAuthConfig;
  private encryptionKey?: string;
  private cachedToken?: string;
  private tokenExpiry?: number;

  /**
   * Creates a new authentication manager
   *
   * @param config - Authentication configuration
   * @param encryptionKey - Optional encryption key for token storage
   */
  constructor(config: GitHubAuthConfig, encryptionKey?: string) {
    this.config = config;
    this.encryptionKey = encryptionKey;
  }

  /**
   * Gets the current access token, refreshing if necessary
   *
   * @returns Access token
   * @throws Error if token retrieval fails
   */
  async getAccessToken(): Promise<string> {
    // Check cached token
    if (this.cachedToken && !this.isTokenExpired()) {
      return this.cachedToken;
    }

    // Get token based on auth type
    switch (this.config.type) {
      case 'token':
        return this.getPersonalAccessToken();
      case 'oauth':
        return this.getOAuthToken();
      case 'app':
        return this.getAppInstallationToken();
      default:
        throw new Error('Invalid authentication type');
    }
  }

  /**
   * Gets a personal access token
   *
   * @returns Access token
   */
  private getPersonalAccessToken(): string {
    const config = this.config.config as GitHubTokenConfig;

    // Decrypt if encryption is enabled
    if (this.encryptionKey) {
      return decryptToken(config.token as EncryptedString, this.encryptionKey);
    }

    return config.token;
  }

  /**
   * Gets an OAuth access token
   *
   * @returns Access token
   * @throws Error if OAuth flow fails
   */
  private async getOAuthToken(): Promise<string> {
    // In production, this would implement the full OAuth flow
    // For now, return cached token if available
    if (this.cachedToken) {
      return this.cachedToken;
    }

    throw new Error('OAuth token not available. Complete OAuth flow first.');
  }

  /**
   * Gets a GitHub App installation token
   *
   * @returns Installation access token
   * @throws Error if token generation fails
   */
  private async getAppInstallationToken(): Promise<string> {
    const config = this.config.config as GitHubAppConfig;

    try {
      // Generate JWT for GitHub App authentication
      const jwt = this.generateAppJWT(config);

      // Get installation token from GitHub API
      const response = await fetch(
        `https://api.github.com/app/installations/${config.installationId}/access_tokens`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${jwt}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'llm-auto-optimizer-github-integration/1.0.0',
          },
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to get installation token: ${error}`);
      }

      const data = await response.json();
      this.cachedToken = data.token;
      this.tokenExpiry = Date.now() + 3600000; // 1 hour

      return data.token;
    } catch (error) {
      throw new Error(
        `Failed to get app installation token: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generates a JWT for GitHub App authentication
   *
   * @param config - GitHub App configuration
   * @returns JWT token
   */
  private generateAppJWT(config: GitHubAppConfig): string {
    // Decrypt private key if encryption is enabled
    let privateKey = config.privateKey;
    if (this.encryptionKey) {
      privateKey = decryptToken(
        config.privateKey as EncryptedString,
        this.encryptionKey
      );
    }

    // Create JWT payload
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iat: now - 60, // Issued 1 minute ago (clock skew)
      exp: now + 600, // Expires in 10 minutes
      iss: config.appId,
    };

    // Sign JWT
    const header = Buffer.from(
      JSON.stringify({ alg: 'RS256', typ: 'JWT' })
    ).toString('base64url');
    const claims = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createSign('RSA-SHA256')
      .update(`${header}.${claims}`)
      .sign(privateKey, 'base64url');

    return `${header}.${claims}.${signature}`;
  }

  /**
   * Checks if the cached token is expired
   *
   * @returns True if token is expired or expiring soon
   */
  private isTokenExpired(): boolean {
    if (!this.tokenExpiry) {
      return true;
    }

    // Consider token expired 5 minutes before actual expiry
    return Date.now() >= this.tokenExpiry - 300000;
  }

  /**
   * Validates token scopes against requirements
   *
   * @param requirement - Scope requirement to validate
   * @returns Validation result
   * @throws Error if validation fails
   */
  async validateTokenScopes(requirement: ScopeRequirement): Promise<boolean> {
    const scopes = await this.getTokenScopes();
    const validation = validateScopes(scopes, requirement);

    if (!validation.valid) {
      throw new Error(validation.message);
    }

    return true;
  }

  /**
   * Gets the scopes granted to the current token
   *
   * @returns Array of scope names
   */
  async getTokenScopes(): Promise<string[]> {
    switch (this.config.type) {
      case 'token':
        return (this.config.config as GitHubTokenConfig).scopes;
      case 'oauth':
        return (this.config.config as GitHubOAuthConfig).scopes;
      case 'app':
        // GitHub Apps have installation-specific permissions
        return ['repo', 'issues', 'pull_requests'];
      default:
        return [];
    }
  }

  /**
   * Refreshes the cached token
   *
   * @returns New access token
   */
  async refreshToken(): Promise<string> {
    this.cachedToken = undefined;
    this.tokenExpiry = undefined;
    return this.getAccessToken();
  }

  /**
   * Clears cached token data
   */
  clearCache(): void {
    this.cachedToken = undefined;
    this.tokenExpiry = undefined;
  }

  /**
   * Gets the authentication type
   *
   * @returns Authentication type
   */
  getAuthType(): 'token' | 'oauth' | 'app' {
    return this.config.type;
  }

  /**
   * Securely stores an OAuth token
   *
   * @param token - OAuth token response
   */
  storeOAuthToken(token: GitHubOAuthToken): void {
    this.cachedToken = token.access_token;

    if (token.expires_in) {
      this.tokenExpiry = Date.now() + token.expires_in * 1000;
    }
  }

  /**
   * Encrypts and stores a personal access token
   *
   * @param token - Personal access token
   * @param scopes - Token scopes
   * @returns Encrypted token configuration
   */
  encryptAndStoreToken(
    token: string,
    scopes: string[]
  ): GitHubTokenConfig {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not configured');
    }

    const encryptedToken = encryptToken(token, this.encryptionKey);

    return {
      token: encryptedToken,
      scopes,
    };
  }
}

// ============================================================================
// OAuth Flow Helpers
// ============================================================================

/**
 * Generates the OAuth authorization URL
 *
 * @param config - OAuth configuration
 * @param state - CSRF state token
 * @returns Authorization URL
 */
export function getOAuthAuthorizationUrl(
  config: GitHubOAuthConfig,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    scope: config.scopes.join(' '),
    state,
  });

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/**
 * Exchanges an OAuth authorization code for an access token
 *
 * @param config - OAuth configuration
 * @param code - Authorization code
 * @param state - CSRF state token (for validation)
 * @returns OAuth token response
 * @throws Error if exchange fails
 */
export async function exchangeOAuthCode(
  config: GitHubOAuthConfig,
  code: string,
  state?: string
): Promise<GitHubOAuthToken> {
  try {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.callbackUrl,
        state,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OAuth token exchange failed: ${error}`);
    }

    const token: GitHubOAuthToken = await response.json();

    if ('error' in token) {
      throw new Error(
        `OAuth error: ${(token as any).error_description || (token as any).error}`
      );
    }

    return token;
  } catch (error) {
    throw new Error(
      `OAuth code exchange failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Generates a secure CSRF state token
 *
 * @returns Random state token
 */
export function generateStateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// ============================================================================
// Exports
// ============================================================================

export default GitHubAuthManager;
