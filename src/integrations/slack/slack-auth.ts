/**
 * Slack OAuth 2.0 Authentication Handler
 *
 * Handles OAuth flow, token management, and token rotation
 * @module slack-auth
 */

import * as crypto from 'crypto';
import type {
  SlackConfig,
  OAuthAccessResponse,
  OAuthTokenRefreshResponse,
  TokenStorage,
  SlackError,
} from './slack-types';

/**
 * In-memory token storage (default implementation)
 */
class InMemoryTokenStorage implements TokenStorage {
  private tokens: Map<string, { token: string; expiresAt?: Date }> = new Map();

  async store(teamId: string, token: string, expiresAt?: Date): Promise<void> {
    this.tokens.set(teamId, { token, expiresAt });
  }

  async retrieve(teamId: string): Promise<string | null> {
    const data = this.tokens.get(teamId);
    if (!data) return null;

    // Check expiration
    if (data.expiresAt && data.expiresAt < new Date()) {
      this.tokens.delete(teamId);
      return null;
    }

    return data.token;
  }

  async delete(teamId: string): Promise<void> {
    this.tokens.delete(teamId);
  }

  async isExpired(teamId: string): Promise<boolean> {
    const data = this.tokens.get(teamId);
    if (!data || !data.expiresAt) return false;
    return data.expiresAt < new Date();
  }

  /**
   * Gets all stored team IDs (for testing)
   */
  getAllTeamIds(): string[] {
    return Array.from(this.tokens.keys());
  }

  /**
   * Clears all tokens (for testing)
   */
  clear(): void {
    this.tokens.clear();
  }
}

/**
 * OAuth state manager for CSRF protection
 */
class OAuthStateManager {
  private states: Map<string, { timestamp: number; data?: unknown }> = new Map();
  private readonly ttl = 600000; // 10 minutes

  /**
   * Generates a new OAuth state
   * @param data - Optional data to associate with state
   */
  generate(data?: unknown): string {
    const state = crypto.randomBytes(32).toString('hex');
    this.states.set(state, {
      timestamp: Date.now(),
      data,
    });

    // Clean up expired states
    this.cleanup();

    return state;
  }

  /**
   * Validates and consumes an OAuth state
   * @param state - State to validate
   */
  validate(state: string): { valid: boolean; data?: unknown } {
    const entry = this.states.get(state);

    if (!entry) {
      return { valid: false };
    }

    // Check expiration
    if (Date.now() - entry.timestamp > this.ttl) {
      this.states.delete(state);
      return { valid: false };
    }

    // Consume state (one-time use)
    this.states.delete(state);
    return { valid: true, data: entry.data };
  }

  /**
   * Cleans up expired states
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [state, entry] of this.states.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.states.delete(state);
      }
    }
  }

  /**
   * Clears all states (for testing)
   */
  clear(): void {
    this.states.clear();
  }
}

/**
 * Slack OAuth Handler
 */
export class SlackOAuthHandler {
  private readonly config: Required<SlackConfig>;
  private readonly storage: TokenStorage;
  private readonly stateManager: OAuthStateManager;
  private readonly baseUrl = 'https://slack.com/api';
  private rotationIntervals: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Creates a new OAuth handler
   * @param config - Slack configuration
   * @param storage - Token storage implementation
   */
  constructor(config: SlackConfig, storage?: TokenStorage) {
    this.config = {
      botToken: config.botToken,
      appToken: config.appToken || '',
      signingSecret: config.signingSecret,
      clientId: config.clientId || '',
      clientSecret: config.clientSecret || '',
      redirectUri: config.redirectUri || '',
      rateLimit: config.rateLimit || 1,
      timeout: config.timeout || 30000,
      enableRetry: config.enableRetry !== false,
      maxRetries: config.maxRetries || 3,
      enableTokenRotation: config.enableTokenRotation || false,
      tokenRotationInterval: config.tokenRotationInterval || 24,
    };

    this.storage = storage || new InMemoryTokenStorage();
    this.stateManager = new OAuthStateManager();
  }

  /**
   * Generates OAuth authorization URL
   * @param scopes - Required OAuth scopes
   * @param userScopes - User-level scopes (optional)
   * @param metadata - Additional metadata to include in state
   */
  generateAuthUrl(
    scopes: string[],
    userScopes?: string[],
    metadata?: unknown
  ): string {
    if (!this.config.clientId || !this.config.redirectUri) {
      throw new Error('Client ID and Redirect URI are required for OAuth');
    }

    const state = this.stateManager.generate(metadata);
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      scope: scopes.join(','),
      redirect_uri: this.config.redirectUri,
      state,
    });

    if (userScopes && userScopes.length > 0) {
      params.append('user_scope', userScopes.join(','));
    }

    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  }

  /**
   * Exchanges authorization code for access token
   * @param code - Authorization code
   * @param state - OAuth state
   */
  async exchangeCode(code: string, state: string): Promise<OAuthAccessResponse> {
    // Validate state
    const stateValidation = this.stateManager.validate(state);
    if (!stateValidation.valid) {
      const error = new Error('Invalid OAuth state') as SlackError;
      error.code = 'INVALID_STATE';
      throw error;
    }

    if (!this.config.clientId || !this.config.clientSecret || !this.config.redirectUri) {
      throw new Error('Client ID, Client Secret, and Redirect URI are required');
    }

    // Exchange code for token
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code,
      redirect_uri: this.config.redirectUri,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/oauth.v2.access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const result = await response.json() as OAuthAccessResponse;

      if (!result.ok) {
        const error = new Error(result.error || 'OAuth exchange failed') as SlackError;
        error.code = result.error;
        error.data = result;
        throw error;
      }

      // Store tokens
      await this.storage.store(result.team.id, result.access_token);

      if (result.authed_user?.access_token) {
        await this.storage.store(
          `${result.team.id}:user:${result.authed_user.id}`,
          result.authed_user.access_token
        );
      }

      // Start token rotation if enabled
      if (this.config.enableTokenRotation) {
        this.startTokenRotation(result.team.id);
      }

      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Refreshes an access token
   * @param teamId - Team ID
   * @param refreshToken - Refresh token
   */
  async refreshToken(teamId: string, refreshToken: string): Promise<OAuthTokenRefreshResponse> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('Client ID and Client Secret are required');
    }

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/oauth.v2.access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const result = await response.json() as OAuthTokenRefreshResponse;

      if (!result.ok) {
        const error = new Error(result.error || 'Token refresh failed') as SlackError;
        error.code = result.error;
        throw error;
      }

      // Store new token
      const expiresAt = new Date(Date.now() + result.expires_in * 1000);
      await this.storage.store(teamId, result.access_token, expiresAt);

      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Revokes an access token
   * @param token - Access token to revoke
   */
  async revokeToken(token: string): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/auth.revoke`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ token }).toString(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const result = await response.json();

      if (!result.ok) {
        const error = new Error(result.error || 'Token revocation failed') as SlackError;
        error.code = result.error;
        throw error;
      }
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Gets stored token for a team
   * @param teamId - Team ID
   */
  async getToken(teamId: string): Promise<string | null> {
    return this.storage.retrieve(teamId);
  }

  /**
   * Deletes stored token for a team
   * @param teamId - Team ID
   */
  async deleteToken(teamId: string): Promise<void> {
    // Stop token rotation
    this.stopTokenRotation(teamId);

    // Delete from storage
    await this.storage.delete(teamId);
  }

  /**
   * Checks if token is expired
   * @param teamId - Team ID
   */
  async isTokenExpired(teamId: string): Promise<boolean> {
    return this.storage.isExpired(teamId);
  }

  /**
   * Starts automatic token rotation
   * @param teamId - Team ID
   */
  private startTokenRotation(teamId: string): void {
    // Clear existing interval
    this.stopTokenRotation(teamId);

    // Set new interval
    const intervalMs = this.config.tokenRotationInterval * 60 * 60 * 1000;
    const interval = setInterval(async () => {
      try {
        const token = await this.storage.retrieve(teamId);
        if (token) {
          // Token rotation would require refresh token
          // This is a placeholder for actual rotation logic
          console.log(`Token rotation scheduled for team: ${teamId}`);
        } else {
          // Token no longer exists, stop rotation
          this.stopTokenRotation(teamId);
        }
      } catch (error) {
        console.error(`Token rotation failed for team ${teamId}:`, error);
      }
    }, intervalMs);

    this.rotationIntervals.set(teamId, interval);
  }

  /**
   * Stops automatic token rotation
   * @param teamId - Team ID
   */
  private stopTokenRotation(teamId: string): void {
    const interval = this.rotationIntervals.get(teamId);
    if (interval) {
      clearInterval(interval);
      this.rotationIntervals.delete(teamId);
    }
  }

  /**
   * Tests token validity
   * @param token - Token to test
   */
  async testToken(token: string): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/auth.test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const result = await response.json();
      return result.ok === true;
    } catch (error) {
      clearTimeout(timeoutId);
      return false;
    }
  }

  /**
   * Gets OAuth state manager (for testing)
   */
  getStateManager(): OAuthStateManager {
    return this.stateManager;
  }

  /**
   * Gets token storage (for testing)
   */
  getStorage(): TokenStorage {
    return this.storage;
  }

  /**
   * Cleans up all rotation intervals
   */
  cleanup(): void {
    for (const interval of this.rotationIntervals.values()) {
      clearInterval(interval);
    }
    this.rotationIntervals.clear();
  }
}

/**
 * Generates a secure random state for OAuth
 */
export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Validates OAuth scopes
 * @param scopes - Scopes to validate
 */
export function validateScopes(scopes: string[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!scopes || scopes.length === 0) {
    errors.push('At least one scope is required');
  }

  const validScopes = [
    'channels:read',
    'channels:write',
    'channels:history',
    'chat:write',
    'chat:write.public',
    'commands',
    'emoji:read',
    'files:read',
    'files:write',
    'groups:read',
    'groups:write',
    'groups:history',
    'im:read',
    'im:write',
    'im:history',
    'mpim:read',
    'mpim:write',
    'mpim:history',
    'reactions:read',
    'reactions:write',
    'team:read',
    'usergroups:read',
    'usergroups:write',
    'users:read',
    'users:read.email',
    'users:write',
  ];

  for (const scope of scopes) {
    if (!validScopes.includes(scope)) {
      errors.push(`Invalid scope: ${scope}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export { InMemoryTokenStorage, OAuthStateManager };
export default SlackOAuthHandler;
