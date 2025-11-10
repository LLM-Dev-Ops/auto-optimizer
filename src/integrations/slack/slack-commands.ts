/**
 * Slack Slash Command Handler
 *
 * Handles slash commands with routing, validation, and response helpers
 * @module slack-commands
 */

import type {
  SlashCommandPayload,
  SlashCommandResponse,
  Block,
  SlackError,
} from './slack-types';
import { SlackClient } from './slack-client';

/**
 * Command handler function type
 */
export type CommandHandler = (
  payload: SlashCommandPayload,
  context: CommandContext
) => Promise<SlashCommandResponse | void> | SlashCommandResponse | void;

/**
 * Command context
 */
export interface CommandContext {
  client: SlackClient;
  args: string[];
  rawText: string;
  respond: (response: SlashCommandResponse) => Promise<void>;
  respondLater: (response: SlashCommandResponse) => Promise<void>;
}

/**
 * Command configuration
 */
export interface CommandConfig {
  name: string;
  description: string;
  usage?: string;
  examples?: string[];
  requiresAuth?: boolean;
  allowedChannels?: string[];
  allowedUsers?: string[];
  rateLimit?: number; // requests per minute
  timeout?: number; // milliseconds
}

/**
 * Command validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Rate limiter for commands
 */
class CommandRateLimiter {
  private usage: Map<string, number[]> = new Map();
  private readonly limit: number;
  private readonly window: number;

  constructor(limit: number, windowMinutes = 1) {
    this.limit = limit;
    this.window = windowMinutes * 60 * 1000;
  }

  /**
   * Checks if user can execute command
   * @param userId - User ID
   */
  canExecute(userId: string): boolean {
    const now = Date.now();
    const timestamps = this.usage.get(userId) || [];

    // Remove old timestamps
    const recentTimestamps = timestamps.filter((ts) => now - ts < this.window);

    if (recentTimestamps.length >= this.limit) {
      return false;
    }

    // Add current timestamp
    recentTimestamps.push(now);
    this.usage.set(userId, recentTimestamps);

    return true;
  }

  /**
   * Gets time until user can execute command again (in milliseconds)
   * @param userId - User ID
   */
  getTimeUntilAvailable(userId: string): number {
    const now = Date.now();
    const timestamps = this.usage.get(userId) || [];
    const recentTimestamps = timestamps.filter((ts) => now - ts < this.window);

    if (recentTimestamps.length < this.limit) {
      return 0;
    }

    const oldestTimestamp = Math.min(...recentTimestamps);
    return this.window - (now - oldestTimestamp);
  }

  /**
   * Clears rate limit for user (for testing)
   * @param userId - User ID
   */
  clear(userId: string): void {
    this.usage.delete(userId);
  }

  /**
   * Clears all rate limits (for testing)
   */
  clearAll(): void {
    this.usage.clear();
  }
}

/**
 * Slash Command Router
 */
export class SlashCommandRouter {
  private readonly commands: Map<string, CommandHandler> = new Map();
  private readonly configs: Map<string, CommandConfig> = new Map();
  private readonly rateLimiters: Map<string, CommandRateLimiter> = new Map();
  private readonly client: SlackClient;
  private readonly defaultTimeout = 3000;

  constructor(client: SlackClient) {
    this.client = client;
  }

  /**
   * Registers a command handler
   * @param config - Command configuration
   * @param handler - Handler function
   */
  command(config: CommandConfig, handler: CommandHandler): void {
    this.commands.set(config.name, handler);
    this.configs.set(config.name, config);

    // Create rate limiter if configured
    if (config.rateLimit) {
      this.rateLimiters.set(config.name, new CommandRateLimiter(config.rateLimit));
    }
  }

  /**
   * Processes a slash command
   * @param payload - Command payload
   */
  async processCommand(payload: SlashCommandPayload): Promise<SlashCommandResponse | void> {
    const commandName = payload.command.replace(/^\//, '');
    const handler = this.commands.get(commandName);
    const config = this.configs.get(commandName);

    // Check if command exists
    if (!handler || !config) {
      return this.createErrorResponse(`Unknown command: ${payload.command}`);
    }

    // Validate command
    const validation = this.validateCommand(payload, config);
    if (!validation.valid) {
      return this.createErrorResponse(validation.errors.join('\n'));
    }

    // Check rate limit
    const rateLimiter = this.rateLimiters.get(commandName);
    if (rateLimiter && !rateLimiter.canExecute(payload.user_id)) {
      const timeUntilAvailable = rateLimiter.getTimeUntilAvailable(payload.user_id);
      const seconds = Math.ceil(timeUntilAvailable / 1000);
      return this.createErrorResponse(
        `Rate limit exceeded. Please try again in ${seconds} seconds.`
      );
    }

    // Parse arguments
    const args = this.parseArguments(payload.text);

    // Create context
    const context: CommandContext = {
      client: this.client,
      args,
      rawText: payload.text,
      respond: async (response: SlashCommandResponse) => {
        // Immediate response (must be within 3 seconds)
        return;
      },
      respondLater: async (response: SlashCommandResponse) => {
        // Use response_url for delayed response
        await this.client.respondToUrl(payload.response_url, response);
      },
    };

    // Execute handler with timeout
    const timeout = config.timeout || this.defaultTimeout;
    try {
      const result = await this.executeWithTimeout(
        handler(payload, context),
        timeout
      );
      return result;
    } catch (error) {
      console.error(`Error executing command ${commandName}:`, error);
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Command execution failed'
      );
    }
  }

  /**
   * Validates command execution
   * @param payload - Command payload
   * @param config - Command configuration
   */
  private validateCommand(
    payload: SlashCommandPayload,
    config: CommandConfig
  ): ValidationResult {
    const errors: string[] = [];

    // Check allowed channels
    if (config.allowedChannels && config.allowedChannels.length > 0) {
      if (!config.allowedChannels.includes(payload.channel_id)) {
        errors.push(
          `This command can only be used in specific channels: ${config.allowedChannels.join(', ')}`
        );
      }
    }

    // Check allowed users
    if (config.allowedUsers && config.allowedUsers.length > 0) {
      if (!config.allowedUsers.includes(payload.user_id)) {
        errors.push('You do not have permission to use this command.');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Parses command arguments
   * @param text - Command text
   */
  private parseArguments(text: string): string[] {
    if (!text || text.trim() === '') {
      return [];
    }

    // Split by spaces, preserving quoted strings
    const regex = /[^\s"]+|"([^"]*)"/gi;
    const args: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      args.push(match[1] || match[0]);
    }

    return args;
  }

  /**
   * Executes a promise with timeout
   * @param promise - Promise to execute
   * @param timeoutMs - Timeout in milliseconds
   */
  private async executeWithTimeout<T>(
    promise: Promise<T> | T,
    timeoutMs: number
  ): Promise<T> {
    const resolvedPromise = Promise.resolve(promise);

    return Promise.race([
      resolvedPromise,
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Command execution timeout'));
        }, timeoutMs);
      }),
    ]);
  }

  /**
   * Creates an error response
   * @param error - Error message
   */
  private createErrorResponse(error: string): SlashCommandResponse {
    return {
      response_type: 'ephemeral',
      text: error,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:x: *Error*\n${error}`,
          },
        },
      ],
    };
  }

  /**
   * Gets help text for a command
   * @param commandName - Command name
   */
  getCommandHelp(commandName: string): string | null {
    const config = this.configs.get(commandName);
    if (!config) return null;

    let help = `*${config.name}* - ${config.description}\n`;

    if (config.usage) {
      help += `\n*Usage:* \`${config.usage}\`\n`;
    }

    if (config.examples && config.examples.length > 0) {
      help += '\n*Examples:*\n';
      config.examples.forEach((example) => {
        help += `• \`${example}\`\n`;
      });
    }

    return help;
  }

  /**
   * Gets all registered commands
   */
  getAllCommands(): CommandConfig[] {
    return Array.from(this.configs.values());
  }

  /**
   * Removes a command
   * @param commandName - Command name
   */
  removeCommand(commandName: string): void {
    this.commands.delete(commandName);
    this.configs.delete(commandName);
    this.rateLimiters.delete(commandName);
  }

  /**
   * Removes all commands
   */
  removeAllCommands(): void {
    this.commands.clear();
    this.configs.clear();
    this.rateLimiters.clear();
  }

  /**
   * Gets rate limiter for command (for testing)
   * @param commandName - Command name
   */
  getRateLimiter(commandName: string): CommandRateLimiter | undefined {
    return this.rateLimiters.get(commandName);
  }
}

/**
 * Creates a success response
 * @param message - Success message
 * @param ephemeral - Whether response is ephemeral
 */
export function createSuccessResponse(
  message: string,
  ephemeral = false
): SlashCommandResponse {
  return {
    response_type: ephemeral ? 'ephemeral' : 'in_channel',
    text: message,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:white_check_mark: ${message}`,
        },
      },
    ],
  };
}

/**
 * Creates an error response
 * @param error - Error message
 */
export function createErrorResponse(error: string): SlashCommandResponse {
  return {
    response_type: 'ephemeral',
    text: error,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:x: *Error*\n${error}`,
        },
      },
    ],
  };
}

/**
 * Creates an info response
 * @param message - Info message
 * @param ephemeral - Whether response is ephemeral
 */
export function createInfoResponse(
  message: string,
  ephemeral = false
): SlashCommandResponse {
  return {
    response_type: ephemeral ? 'ephemeral' : 'in_channel',
    text: message,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:information_source: ${message}`,
        },
      },
    ],
  };
}

/**
 * Creates a help response with command list
 * @param commands - List of commands
 */
export function createHelpResponse(commands: CommandConfig[]): SlashCommandResponse {
  const blocks: Block[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: 'Available Commands',
        emoji: true,
      },
    },
    {
      type: 'divider',
    },
  ];

  for (const cmd of commands) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*/${cmd.name}*\n${cmd.description}`,
      },
    });

    if (cmd.usage) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Usage: \`${cmd.usage}\``,
          },
        ],
      });
    }
  }

  return {
    response_type: 'ephemeral',
    text: 'Available Commands',
    blocks,
  };
}

/**
 * Validates slash command payload
 * @param payload - Payload to validate
 */
export function validatePayload(payload: unknown): ValidationResult {
  const errors: string[] = [];

  if (!payload || typeof payload !== 'object') {
    errors.push('Invalid payload format');
    return { valid: false, errors };
  }

  const p = payload as Partial<SlashCommandPayload>;

  const requiredFields: Array<keyof SlashCommandPayload> = [
    'token',
    'team_id',
    'channel_id',
    'user_id',
    'command',
    'response_url',
  ];

  for (const field of requiredFields) {
    if (!p[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Parses command arguments from text
 * @param text - Command text
 */
export function parseCommandArgs(text: string): string[] {
  if (!text || text.trim() === '') {
    return [];
  }

  const regex = /[^\s"]+|"([^"]*)"/gi;
  const args: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    args.push(match[1] || match[0]);
  }

  return args;
}

export { CommandRateLimiter };
export default SlashCommandRouter;
