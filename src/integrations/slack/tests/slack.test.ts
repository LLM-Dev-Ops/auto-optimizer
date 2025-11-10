/**
 * Slack Integration Test Suite
 *
 * Comprehensive tests for all Slack integration components
 * @module slack-test
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  SlackClient,
  createErrorBlock,
  createSuccessBlock,
  createInfoBlock,
  createWarningBlock,
} from '../slack-client';
import {
  SlackOAuthHandler,
  InMemoryTokenStorage,
  generateOAuthState,
  validateScopes,
} from '../slack-auth';
import {
  SlackWebhookProcessor,
  extractWebhookRequest,
  verifyWebhookSignature,
  createWebhookProcessor,
} from '../slack-webhooks';
import {
  SlashCommandRouter,
  createSuccessResponse,
  createErrorResponse,
  createInfoResponse,
  createHelpResponse,
  validatePayload,
  parseCommandArgs,
} from '../slack-commands';
import type {
  SlackConfig,
  MessagePayload,
  SlashCommandPayload,
  EventPayload,
  MessageEvent,
  WebhookRequest,
} from '../slack-types';

// Mock fetch globally
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('SlackClient', () => {
  let client: SlackClient;
  let config: SlackConfig;

  beforeEach(() => {
    config = {
      botToken: 'xoxb-test-token',
      signingSecret: 'test-secret',
      rateLimit: 1,
      timeout: 5000,
    };
    client = new SlackClient(config);
    (fetch as jest.MockedFunction<typeof fetch>).mockClear();
  });

  describe('postMessage', () => {
    it('should post a message successfully', async () => {
      const mockResponse = {
        ok: true,
        channel: 'C123456',
        ts: '1234567890.123456',
        message: {
          type: 'message',
          text: 'Hello, World!',
          ts: '1234567890.123456',
        },
      };

      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers(),
      } as Response);

      const payload: MessagePayload = {
        channel: 'C123456',
        text: 'Hello, World!',
      };

      const result = await client.postMessage(payload);

      expect(result.ok).toBe(true);
      expect(result.channel).toBe('C123456');
      expect(result.ts).toBe('1234567890.123456');
    });

    it('should handle API errors', async () => {
      const mockResponse = {
        ok: false,
        error: 'channel_not_found',
      };

      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers(),
      } as Response);

      const payload: MessagePayload = {
        channel: 'C123456',
        text: 'Hello, World!',
      };

      await expect(client.postMessage(payload)).rejects.toThrow('channel_not_found');
    });

    it('should respect rate limits', async () => {
      const mockResponse = {
        ok: true,
        channel: 'C123456',
        ts: '1234567890.123456',
        message: { type: 'message', text: 'Test', ts: '1234567890.123456' },
      };

      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers(),
      } as Response);

      const payload: MessagePayload = {
        channel: 'C123456',
        text: 'Test',
      };

      // First request should succeed immediately
      const start = Date.now();
      await client.postMessage(payload);
      const firstRequestTime = Date.now() - start;

      // Second request should be rate limited
      const start2 = Date.now();
      await client.postMessage(payload);
      const secondRequestTime = Date.now() - start2;

      expect(firstRequestTime).toBeLessThan(100);
      expect(secondRequestTime).toBeGreaterThan(900); // Should wait ~1 second
    });

    it('should handle 429 rate limit responses', async () => {
      (fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ 'Retry-After': '1' }),
          json: async () => ({ ok: false, error: 'rate_limited' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            channel: 'C123456',
            ts: '1234567890.123456',
            message: { type: 'message', text: 'Test', ts: '1234567890.123456' },
          }),
          headers: new Headers(),
        } as Response);

      const payload: MessagePayload = {
        channel: 'C123456',
        text: 'Test',
      };

      // Clear rate limit to test API rate limiting
      client.clearRateLimit('C123456');

      const result = await client.postMessage(payload);
      expect(result.ok).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    it('should get rate limit info', () => {
      const info = client.getRateLimitInfo('C123456');
      expect(info.channel).toBe('C123456');
      expect(info.capacity).toBe(1);
      expect(info.refillRate).toBe(1);
    });

    it('should clear rate limit', () => {
      client.clearRateLimit('C123456');
      const info = client.getRateLimitInfo('C123456');
      expect(info.tokens).toBe(1); // Should be reset to capacity
    });
  });

  describe('Message Helpers', () => {
    it('should create error block', () => {
      const blocks = createErrorBlock('Test error');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('section');
    });

    it('should create success block', () => {
      const blocks = createSuccessBlock('Test success');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('section');
    });

    it('should create info block', () => {
      const blocks = createInfoBlock('Test info');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('section');
    });

    it('should create warning block', () => {
      const blocks = createWarningBlock('Test warning');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('section');
    });
  });
});

describe('SlackOAuthHandler', () => {
  let handler: SlackOAuthHandler;
  let config: SlackConfig;
  let storage: InMemoryTokenStorage;

  beforeEach(() => {
    config = {
      botToken: 'xoxb-test-token',
      signingSecret: 'test-secret',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      redirectUri: 'https://example.com/oauth/callback',
    };
    storage = new InMemoryTokenStorage();
    handler = new SlackOAuthHandler(config, storage);
    (fetch as jest.MockedFunction<typeof fetch>).mockClear();
  });

  afterEach(() => {
    handler.cleanup();
  });

  describe('generateAuthUrl', () => {
    it('should generate valid OAuth URL', () => {
      const scopes = ['chat:write', 'channels:read'];
      const url = handler.generateAuthUrl(scopes);

      expect(url).toContain('https://slack.com/oauth/v2/authorize');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('scope=chat%3Awrite%2Cchannels%3Aread');
      expect(url).toContain('redirect_uri=https%3A%2F%2Fexample.com%2Foauth%2Fcallback');
      expect(url).toContain('state=');
    });

    it('should include user scopes if provided', () => {
      const scopes = ['chat:write'];
      const userScopes = ['users:read'];
      const url = handler.generateAuthUrl(scopes, userScopes);

      expect(url).toContain('user_scope=users%3Aread');
    });

    it('should throw error if client ID not configured', () => {
      const badConfig = { ...config, clientId: '' };
      const badHandler = new SlackOAuthHandler(badConfig);

      expect(() => badHandler.generateAuthUrl(['chat:write'])).toThrow(
        'Client ID and Redirect URI are required'
      );
    });
  });

  describe('exchangeCode', () => {
    it('should exchange code for access token', async () => {
      const stateManager = handler.getStateManager();
      const state = stateManager.generate();

      const mockResponse = {
        ok: true,
        access_token: 'xoxb-new-token',
        token_type: 'bot',
        scope: 'chat:write,channels:read',
        bot_user_id: 'U123456',
        app_id: 'A123456',
        team: {
          id: 'T123456',
          name: 'Test Team',
        },
      };

      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers(),
      } as Response);

      const result = await handler.exchangeCode('auth-code', state);

      expect(result.ok).toBe(true);
      expect(result.access_token).toBe('xoxb-new-token');
      expect(result.team.id).toBe('T123456');

      // Verify token was stored
      const storedToken = await storage.retrieve('T123456');
      expect(storedToken).toBe('xoxb-new-token');
    });

    it('should reject invalid state', async () => {
      await expect(handler.exchangeCode('auth-code', 'invalid-state')).rejects.toThrow(
        'Invalid OAuth state'
      );
    });

    it('should handle OAuth errors', async () => {
      const stateManager = handler.getStateManager();
      const state = stateManager.generate();

      const mockResponse = {
        ok: false,
        error: 'invalid_code',
      };

      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers(),
      } as Response);

      await expect(handler.exchangeCode('bad-code', state)).rejects.toThrow('invalid_code');
    });
  });

  describe('Token Management', () => {
    it('should store and retrieve tokens', async () => {
      await storage.store('T123456', 'xoxb-token');
      const token = await storage.retrieve('T123456');
      expect(token).toBe('xoxb-token');
    });

    it('should handle token expiration', async () => {
      const expiresAt = new Date(Date.now() - 1000); // Expired
      await storage.store('T123456', 'xoxb-token', expiresAt);
      const token = await storage.retrieve('T123456');
      expect(token).toBeNull();
    });

    it('should delete tokens', async () => {
      await storage.store('T123456', 'xoxb-token');
      await storage.delete('T123456');
      const token = await storage.retrieve('T123456');
      expect(token).toBeNull();
    });

    it('should check token expiration', async () => {
      const expiresAt = new Date(Date.now() - 1000);
      await storage.store('T123456', 'xoxb-token', expiresAt);
      const isExpired = await storage.isExpired('T123456');
      expect(isExpired).toBe(true);
    });
  });

  describe('Helpers', () => {
    it('should generate OAuth state', () => {
      const state = generateOAuthState();
      expect(state).toHaveLength(64); // 32 bytes hex = 64 characters
    });

    it('should validate scopes', () => {
      const result = validateScopes(['chat:write', 'channels:read']);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid scopes', () => {
      const result = validateScopes(['invalid:scope']);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid scope: invalid:scope');
    });

    it('should reject empty scopes', () => {
      const result = validateScopes([]);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one scope is required');
    });
  });
});

describe('SlackWebhookProcessor', () => {
  let processor: SlackWebhookProcessor;
  const signingSecret = 'test-signing-secret';

  beforeEach(() => {
    processor = createWebhookProcessor(signingSecret);
  });

  afterEach(() => {
    processor.removeAllHandlers();
    processor.getDeduplicator().clear();
  });

  describe('Signature Verification', () => {
    it('should verify valid signature', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = JSON.stringify({ type: 'event_callback' });
      const sigBasestring = `v0:${timestamp}:${body}`;
      const signature = `v0=${require('crypto')
        .createHmac('sha256', signingSecret)
        .update(sigBasestring)
        .digest('hex')}`;

      const result = verifyWebhookSignature(body, timestamp, signature, signingSecret);
      expect(result).toBe(true);
    });

    it('should reject invalid signature', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = JSON.stringify({ type: 'event_callback' });
      const signature = 'v0=invalid_signature';

      const result = verifyWebhookSignature(body, timestamp, signature, signingSecret);
      expect(result).toBe(false);
    });

    it('should reject old timestamps', () => {
      const oldTimestamp = Math.floor(Date.now() / 1000 - 400).toString(); // 400 seconds ago
      const body = JSON.stringify({ type: 'event_callback' });
      const sigBasestring = `v0:${oldTimestamp}:${body}`;
      const signature = `v0=${require('crypto')
        .createHmac('sha256', signingSecret)
        .update(sigBasestring)
        .digest('hex')}`;

      const request: WebhookRequest = {
        body,
        headers: {},
        timestamp: oldTimestamp,
        signature,
      };

      const result = processor.verifySignature(request);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too old');
    });
  });

  describe('Event Processing', () => {
    it('should handle URL verification', async () => {
      const challenge = 'test-challenge';
      const body = JSON.stringify({
        type: 'url_verification',
        challenge,
        token: 'test-token',
      });

      const request: WebhookRequest = {
        body,
        headers: {},
        timestamp: Math.floor(Date.now() / 1000).toString(),
        signature: 'v0=dummy', // Will be skipped if verification disabled
      };

      const result = await processor.processWebhook(request);
      expect(result).toEqual({ challenge });
    });

    it('should process message events', async () => {
      const messageHandler = jest.fn();
      processor.onMessage(messageHandler);

      const event: MessageEvent = {
        type: 'message',
        channel: 'C123456',
        user: 'U123456',
        text: 'Hello, World!',
        ts: '1234567890.123456',
        channel_type: 'channel',
      };

      const payload: EventPayload = {
        token: 'test-token',
        team_id: 'T123456',
        api_app_id: 'A123456',
        event,
        type: 'event_callback',
        event_id: 'Ev123456',
        event_time: Date.now(),
      };

      const body = JSON.stringify(payload);
      const request: WebhookRequest = {
        body,
        headers: {},
        timestamp: Math.floor(Date.now() / 1000).toString(),
        signature: 'v0=dummy',
      };

      await processor.processWebhook(request);

      expect(messageHandler).toHaveBeenCalledTimes(1);
      expect(messageHandler).toHaveBeenCalledWith(
        event,
        expect.objectContaining({
          teamId: 'T123456',
          eventId: 'Ev123456',
        })
      );
    });

    it('should deduplicate events', async () => {
      const messageHandler = jest.fn();
      processor.onMessage(messageHandler);

      const event: MessageEvent = {
        type: 'message',
        channel: 'C123456',
        user: 'U123456',
        text: 'Hello, World!',
        ts: '1234567890.123456',
        channel_type: 'channel',
      };

      const payload: EventPayload = {
        token: 'test-token',
        team_id: 'T123456',
        api_app_id: 'A123456',
        event,
        type: 'event_callback',
        event_id: 'Ev123456',
        event_time: Date.now(),
      };

      const body = JSON.stringify(payload);
      const request: WebhookRequest = {
        body,
        headers: {},
        timestamp: Math.floor(Date.now() / 1000).toString(),
        signature: 'v0=dummy',
      };

      // Process same event twice
      await processor.processWebhook(request);
      await processor.processWebhook(request);

      // Handler should only be called once
      expect(messageHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Helper Functions', () => {
    it('should extract webhook request', () => {
      const body = 'test body';
      const headers = {
        'X-Slack-Request-Timestamp': '1234567890',
        'X-Slack-Signature': 'v0=signature',
      };

      const request = extractWebhookRequest(body, headers);

      expect(request.body).toBe(body);
      expect(request.timestamp).toBe('1234567890');
      expect(request.signature).toBe('v0=signature');
    });
  });
});

describe('SlashCommandRouter', () => {
  let router: SlashCommandRouter;
  let client: SlackClient;

  beforeEach(() => {
    const config: SlackConfig = {
      botToken: 'xoxb-test-token',
      signingSecret: 'test-secret',
    };
    client = new SlackClient(config);
    router = new SlashCommandRouter(client);
  });

  afterEach(() => {
    router.removeAllCommands();
  });

  describe('Command Registration', () => {
    it('should register command', () => {
      const handler = jest.fn();
      router.command(
        {
          name: 'test',
          description: 'Test command',
        },
        handler
      );

      const commands = router.getAllCommands();
      expect(commands).toHaveLength(1);
      expect(commands[0].name).toBe('test');
    });

    it('should remove command', () => {
      const handler = jest.fn();
      router.command(
        {
          name: 'test',
          description: 'Test command',
        },
        handler
      );

      router.removeCommand('test');

      const commands = router.getAllCommands();
      expect(commands).toHaveLength(0);
    });
  });

  describe('Command Processing', () => {
    it('should process valid command', async () => {
      const handler = jest.fn().mockReturnValue(createSuccessResponse('Success!'));

      router.command(
        {
          name: 'test',
          description: 'Test command',
        },
        handler
      );

      const payload: SlashCommandPayload = {
        token: 'test-token',
        team_id: 'T123456',
        team_domain: 'test',
        channel_id: 'C123456',
        channel_name: 'general',
        user_id: 'U123456',
        user_name: 'testuser',
        command: '/test',
        text: 'arg1 arg2',
        api_app_id: 'A123456',
        response_url: 'https://hooks.slack.com/commands/1234',
        trigger_id: 'trigger123',
      };

      const result = await router.processCommand(payload);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
      expect(result?.text).toContain('Success');
    });

    it('should return error for unknown command', async () => {
      const payload: SlashCommandPayload = {
        token: 'test-token',
        team_id: 'T123456',
        team_domain: 'test',
        channel_id: 'C123456',
        channel_name: 'general',
        user_id: 'U123456',
        user_name: 'testuser',
        command: '/unknown',
        text: '',
        api_app_id: 'A123456',
        response_url: 'https://hooks.slack.com/commands/1234',
        trigger_id: 'trigger123',
      };

      const result = await router.processCommand(payload);

      expect(result).toBeDefined();
      expect(result?.text).toContain('Unknown command');
    });

    it('should enforce rate limits', async () => {
      const handler = jest.fn().mockReturnValue(createSuccessResponse('Success!'));

      router.command(
        {
          name: 'test',
          description: 'Test command',
          rateLimit: 1,
        },
        handler
      );

      const payload: SlashCommandPayload = {
        token: 'test-token',
        team_id: 'T123456',
        team_domain: 'test',
        channel_id: 'C123456',
        channel_name: 'general',
        user_id: 'U123456',
        user_name: 'testuser',
        command: '/test',
        text: '',
        api_app_id: 'A123456',
        response_url: 'https://hooks.slack.com/commands/1234',
        trigger_id: 'trigger123',
      };

      // First request should succeed
      await router.processCommand(payload);
      expect(handler).toHaveBeenCalledTimes(1);

      // Second request should be rate limited
      const result = await router.processCommand(payload);
      expect(result?.text).toContain('Rate limit exceeded');
      expect(handler).toHaveBeenCalledTimes(1); // Should not be called again
    });
  });

  describe('Response Helpers', () => {
    it('should create success response', () => {
      const response = createSuccessResponse('Success!', true);
      expect(response.response_type).toBe('ephemeral');
      expect(response.text).toBe('Success!');
    });

    it('should create error response', () => {
      const response = createErrorResponse('Error!');
      expect(response.response_type).toBe('ephemeral');
      expect(response.text).toBe('Error!');
    });

    it('should create info response', () => {
      const response = createInfoResponse('Info', false);
      expect(response.response_type).toBe('in_channel');
      expect(response.text).toBe('Info');
    });

    it('should create help response', () => {
      const commands = [
        { name: 'test', description: 'Test command' },
        { name: 'help', description: 'Help command', usage: '/help [command]' },
      ];
      const response = createHelpResponse(commands);
      expect(response.blocks).toBeDefined();
      expect(response.blocks!.length).toBeGreaterThan(2);
    });
  });

  describe('Validation', () => {
    it('should validate valid payload', () => {
      const payload: SlashCommandPayload = {
        token: 'test-token',
        team_id: 'T123456',
        team_domain: 'test',
        channel_id: 'C123456',
        channel_name: 'general',
        user_id: 'U123456',
        user_name: 'testuser',
        command: '/test',
        text: '',
        api_app_id: 'A123456',
        response_url: 'https://hooks.slack.com/commands/1234',
        trigger_id: 'trigger123',
      };

      const result = validatePayload(payload);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid payload', () => {
      const result = validatePayload({ invalid: 'payload' });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should parse command arguments', () => {
      const args = parseCommandArgs('arg1 "arg 2" arg3');
      expect(args).toEqual(['arg1', 'arg 2', 'arg3']);
    });

    it('should handle empty arguments', () => {
      const args = parseCommandArgs('');
      expect(args).toEqual([]);
    });
  });
});
