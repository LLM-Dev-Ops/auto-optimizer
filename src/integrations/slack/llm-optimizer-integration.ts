/**
 * LLM Auto Optimizer - Slack Integration Bridge
 *
 * Connects the Slack integration with the LLM Auto Optimizer core system
 * for real-time notifications, interactive control, and monitoring.
 */

import { createSlackIntegration, SlackConfig } from './index';
import type {
  MessageEvent,
  AppMentionEvent,
  BlockActionsPayload,
  SlashCommandPayload,
  CommandContext,
} from './index';

/**
 * LLM Optimizer Event Types
 */
export interface OptimizationEvent {
  type: 'optimization_complete' | 'performance_degradation' | 'cost_savings' | 'error';
  timestamp: Date;
  data: {
    model?: string;
    costSavings?: number;
    latencyImprovement?: number;
    qualityScore?: number;
    error?: string;
  };
}

/**
 * Configuration for LLM Optimizer Slack Integration
 */
export interface LLMOptimizerSlackConfig extends SlackConfig {
  notificationChannel: string;
  alertChannel: string;
  enableInteractiveControl?: boolean;
  enableAutoReporting?: boolean;
  reportingInterval?: number; // minutes
}

/**
 * LLM Optimizer Slack Integration
 */
export class LLMOptimizerSlackIntegration {
  private readonly slack;
  private readonly config: LLMOptimizerSlackConfig;
  private reportingInterval?: NodeJS.Timeout;

  constructor(config: LLMOptimizerSlackConfig) {
    this.config = config;
    this.slack = createSlackIntegration(config);
    this.setupHandlers();

    if (config.enableAutoReporting) {
      this.startAutoReporting();
    }
  }

  /**
   * Sets up all Slack event handlers
   */
  private setupHandlers(): void {
    // Handle app mentions for help
    this.slack.webhook.onAppMention(async (event: AppMentionEvent) => {
      await this.handleAppMention(event);
    });

    // Handle messages with keywords
    this.slack.webhook.onMessage(async (event: MessageEvent) => {
      if (event.bot_id) return; // Ignore bot messages

      if (event.text?.toLowerCase().includes('optimize')) {
        await this.slack.client.postThreadReply(
          event.channel,
          event.ts,
          'Use `/optimize` to start optimization or mention me for help!'
        );
      }
    });

    // Interactive button handlers
    if (this.config.enableInteractiveControl) {
      this.setupInteractiveHandlers();
    }

    // Slash commands
    this.setupCommands();
  }

  /**
   * Sets up interactive component handlers
   */
  private setupInteractiveHandlers(): void {
    // Start optimization button
    this.slack.webhook.onInteractive('start_optimization', async (payload: BlockActionsPayload) => {
      await this.slack.client.respondToUrl(payload.response_url!, {
        text: 'Starting LLM optimization...',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: ':rocket: Starting LLM optimization...\nThis may take a few minutes.',
            },
          },
        ],
        replace_original: true,
      });

      // Trigger optimization (would call actual optimizer here)
      // await optimizer.startOptimization();
    });

    // Apply configuration button
    this.slack.webhook.onInteractive('apply_config', async (payload: BlockActionsPayload) => {
      await this.slack.client.respondToUrl(payload.response_url!, {
        text: 'Applying configuration...',
        replace_original: true,
      });

      // Apply configuration (would call actual optimizer here)
      // await optimizer.applyConfiguration(config);
    });

    // View details button
    this.slack.webhook.onInteractive('view_details', async (payload: BlockActionsPayload) => {
      await this.slack.client.openModal(payload.trigger_id!, {
        type: 'modal',
        title: {
          type: 'plain_text',
          text: 'Optimization Details',
        },
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Current Status*\n\n• Active Models: 3\n• Cost Savings: $2,450/month\n• Avg Latency: 240ms\n• Quality Score: 98/100',
            },
          },
          {
            type: 'divider',
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Recommended Actions*\n\n1. Switch to GPT-4 Turbo for 30% cost reduction\n2. Enable caching for 15% latency improvement\n3. Adjust temperature to 0.7 for better quality',
            },
          },
        ],
      });
    });
  }

  /**
   * Sets up slash command handlers
   */
  private setupCommands(): void {
    // /optimize command
    this.slack.commands.command(
      {
        name: 'optimize',
        description: 'Start LLM optimization',
        usage: '/optimize [model] [--cost-optimized|--quality-optimized|--latency-optimized]',
        examples: [
          '/optimize',
          '/optimize gpt-4 --cost-optimized',
          '/optimize claude-3 --quality-optimized',
        ],
        rateLimit: 5,
      },
      async (payload: SlashCommandPayload, context: CommandContext) => {
        const [model, ...flags] = context.args;

        // Start optimization asynchronously
        this.startOptimization(payload.channel_id, model, flags).catch(console.error);

        return {
          response_type: 'ephemeral',
          text: `Optimization started for ${model || 'default model'}! You'll be notified when complete.`,
        };
      }
    );

    // /status command
    this.slack.commands.command(
      {
        name: 'status',
        description: 'Get current LLM optimizer status',
        usage: '/status',
        rateLimit: 10,
      },
      async (payload: SlashCommandPayload, context: CommandContext) => {
        return this.getStatusResponse();
      }
    );

    // /report command
    this.slack.commands.command(
      {
        name: 'report',
        description: 'Generate optimization report',
        usage: '/report [daily|weekly|monthly]',
        examples: ['/report', '/report weekly'],
        rateLimit: 5,
      },
      async (payload: SlashCommandPayload, context: CommandContext) => {
        const [period = 'daily'] = context.args;

        // Generate report asynchronously
        this.generateReport(payload.channel_id, period).catch(console.error);

        return {
          response_type: 'ephemeral',
          text: 'Generating report...',
        };
      }
    );

    // /config command
    this.slack.commands.command(
      {
        name: 'config',
        description: 'Configure LLM optimizer settings',
        usage: '/config',
        rateLimit: 5,
      },
      async (payload: SlashCommandPayload, context: CommandContext) => {
        // Open configuration modal
        await this.slack.client.openModal(payload.trigger_id, {
          type: 'modal',
          title: {
            type: 'plain_text',
            text: 'LLM Configuration',
          },
          callback_id: 'config_modal',
          blocks: [
            {
              type: 'input',
              block_id: 'model_block',
              label: {
                type: 'plain_text',
                text: 'Primary Model',
              },
              element: {
                type: 'static_select',
                action_id: 'model_select',
                placeholder: {
                  type: 'plain_text',
                  text: 'Choose a model',
                },
                options: [
                  { text: { type: 'plain_text', text: 'GPT-4 Turbo' }, value: 'gpt-4-turbo' },
                  { text: { type: 'plain_text', text: 'GPT-3.5 Turbo' }, value: 'gpt-3.5-turbo' },
                  { text: { type: 'plain_text', text: 'Claude 3 Opus' }, value: 'claude-3-opus' },
                  { text: { type: 'plain_text', text: 'Claude 3 Sonnet' }, value: 'claude-3-sonnet' },
                  { text: { type: 'plain_text', text: 'Gemini Pro' }, value: 'gemini-pro' },
                ],
              },
            },
            {
              type: 'input',
              block_id: 'optimization_goal_block',
              label: {
                type: 'plain_text',
                text: 'Optimization Goal',
              },
              element: {
                type: 'radio_buttons',
                action_id: 'goal_radio',
                options: [
                  { text: { type: 'plain_text', text: 'Minimize Cost' }, value: 'cost' },
                  { text: { type: 'plain_text', text: 'Maximize Quality' }, value: 'quality' },
                  { text: { type: 'plain_text', text: 'Minimize Latency' }, value: 'latency' },
                  { text: { type: 'plain_text', text: 'Balanced' }, value: 'balanced' },
                ],
              },
            },
          ],
          submit: {
            type: 'plain_text',
            text: 'Save',
          },
        });

        return undefined; // Modal already opened
      }
    );
  }

  /**
   * Handles app mentions
   */
  private async handleAppMention(event: AppMentionEvent): Promise<void> {
    await this.slack.client.postMessage({
      channel: event.channel,
      thread_ts: event.ts,
      text: 'Hello! I\'m the LLM Auto Optimizer bot.',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `Hi <@${event.user}>! I'm the *LLM Auto Optimizer* bot.`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Available Commands:*\n• `/optimize` - Start optimization\n• `/status` - Get current status\n• `/report` - Generate report\n• `/config` - Configure settings',
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Get Status',
                emoji: true,
              },
              action_id: 'view_details',
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Start Optimization',
                emoji: true,
              },
              action_id: 'start_optimization',
              style: 'primary',
            },
          ],
        },
      ],
    });
  }

  /**
   * Starts optimization process
   */
  private async startOptimization(channel: string, model?: string, flags?: string[]): Promise<void> {
    // Simulate optimization (replace with actual optimizer call)
    await new Promise((resolve) => setTimeout(resolve, 3000));

    await this.slack.client.postMessage({
      channel,
      text: 'Optimization complete!',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: 'Optimization Complete',
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Model:* ${model || 'GPT-4 Turbo'}\n*Cost Reduction:* 45%\n*Latency Improvement:* 23%\n*Quality Score:* 98/100`,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Apply Changes',
              },
              action_id: 'apply_config',
              style: 'primary',
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'View Details',
              },
              action_id: 'view_details',
            },
          ],
        },
      ],
    });
  }

  /**
   * Gets status response
   */
  private getStatusResponse() {
    return {
      response_type: 'ephemeral' as const,
      text: 'Current Status',
      blocks: [
        {
          type: 'header' as const,
          text: {
            type: 'plain_text' as const,
            text: 'LLM Auto Optimizer Status',
          },
        },
        {
          type: 'section' as const,
          fields: [
            {
              type: 'mrkdwn' as const,
              text: '*Active Models:*\n3',
            },
            {
              type: 'mrkdwn' as const,
              text: '*Total Requests:*\n1,234,567',
            },
            {
              type: 'mrkdwn' as const,
              text: '*Cost Savings:*\n$2,450/month',
            },
            {
              type: 'mrkdwn' as const,
              text: '*Avg Latency:*\n240ms',
            },
            {
              type: 'mrkdwn' as const,
              text: '*Quality Score:*\n98/100',
            },
            {
              type: 'mrkdwn' as const,
              text: '*Uptime:*\n99.9%',
            },
          ],
        },
      ],
    };
  }

  /**
   * Generates and sends report
   */
  private async generateReport(channel: string, period: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    await this.slack.client.postMessage({
      channel,
      text: `${period} Optimization Report`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${period.charAt(0).toUpperCase() + period.slice(1)} Optimization Report`,
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Summary*\n\n• Total Requests: 1,234,567\n• Cost Savings: $12,450\n• Average Latency: 240ms\n• Quality Score: 98/100',
          },
        },
        {
          type: 'divider',
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Top Models*\n\n1. GPT-4 Turbo (45%)\n2. Claude 3 Sonnet (30%)\n3. GPT-3.5 Turbo (25%)',
          },
        },
      ],
    });
  }

  /**
   * Starts automatic reporting
   */
  private startAutoReporting(): void {
    const interval = (this.config.reportingInterval || 60) * 60 * 1000;

    this.reportingInterval = setInterval(async () => {
      await this.generateReport(this.config.notificationChannel, 'hourly');
    }, interval);
  }

  /**
   * Sends optimization event notification
   */
  async notifyOptimizationEvent(event: OptimizationEvent): Promise<void> {
    const channel =
      event.type === 'error' ? this.config.alertChannel : this.config.notificationChannel;

    let emoji = ':information_source:';
    let color = '#2196F3';

    switch (event.type) {
      case 'optimization_complete':
        emoji = ':white_check_mark:';
        color = '#4CAF50';
        break;
      case 'performance_degradation':
        emoji = ':warning:';
        color = '#FF9800';
        break;
      case 'cost_savings':
        emoji = ':moneybag:';
        color = '#4CAF50';
        break;
      case 'error':
        emoji = ':x:';
        color = '#F44336';
        break;
    }

    await this.slack.client.postMessage({
      channel,
      text: `${emoji} ${event.type.replace(/_/g, ' ')}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${emoji} *${event.type.replace(/_/g, ' ').toUpperCase()}*`,
          },
        },
        {
          type: 'section',
          fields: Object.entries(event.data)
            .filter(([_, value]) => value !== undefined)
            .map(([key, value]) => ({
              type: 'mrkdwn' as const,
              text: `*${key}:*\n${value}`,
            })),
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `<!date^${Math.floor(event.timestamp.getTime() / 1000)}^{date_short_pretty} at {time}|${event.timestamp.toISOString()}>`,
            },
          ],
        },
      ],
    });
  }

  /**
   * Stops auto-reporting and cleans up
   */
  cleanup(): void {
    if (this.reportingInterval) {
      clearInterval(this.reportingInterval);
    }
  }
}

/**
 * Creates LLM Optimizer Slack Integration
 */
export function createLLMOptimizerSlackIntegration(
  config: LLMOptimizerSlackConfig
): LLMOptimizerSlackIntegration {
  return new LLMOptimizerSlackIntegration(config);
}

export default LLMOptimizerSlackIntegration;
