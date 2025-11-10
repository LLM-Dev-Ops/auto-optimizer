/**
 * Slack Integration Example Usage
 *
 * Complete example demonstrating all features of the Slack integration
 */

import {
  createSlackIntegration,
  SlackConfig,
  MessageEvent,
  AppMentionEvent,
  BlockActionsPayload,
  ViewSubmissionPayload,
  SlashCommandPayload,
  CommandContext,
} from './index';

// Configuration
const config: SlackConfig = {
  botToken: process.env.SLACK_BOT_TOKEN!,
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
  clientId: process.env.SLACK_CLIENT_ID,
  clientSecret: process.env.SLACK_CLIENT_SECRET,
  redirectUri: process.env.SLACK_REDIRECT_URI || 'https://yourapp.com/oauth/callback',
  rateLimit: 1,
  timeout: 30000,
  enableRetry: true,
  maxRetries: 3,
};

// Initialize integration
const slack = createSlackIntegration(config);

// ============================================================================
// Example 1: OAuth Flow
// ============================================================================

/**
 * Generate OAuth authorization URL
 */
export function generateAuthUrl(): string {
  const scopes = [
    'chat:write',
    'channels:read',
    'channels:history',
    'commands',
    'reactions:write',
    'users:read',
  ];

  return slack.auth.generateAuthUrl(scopes);
}

/**
 * Handle OAuth callback
 */
export async function handleOAuthCallback(code: string, state: string) {
  try {
    const result = await slack.auth.exchangeCode(code, state);
    console.log('OAuth successful!');
    console.log('Team:', result.team.name);
    console.log('Bot User ID:', result.bot_user_id);
    return result;
  } catch (error) {
    console.error('OAuth failed:', error);
    throw error;
  }
}

// ============================================================================
// Example 2: Posting Messages
// ============================================================================

/**
 * Send a simple message
 */
export async function sendSimpleMessage(channel: string, text: string) {
  return slack.client.postMessage({
    channel,
    text,
  });
}

/**
 * Send a rich message with Block Kit
 */
export async function sendRichMessage(channel: string) {
  return slack.client.postMessage({
    channel,
    text: 'LLM Optimization Report',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: 'LLM Optimization Report',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Cost Reduction:* 45%\n*Latency Improvement:* 23%\n*Quality Score:* 98/100',
        },
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Recommended model: *GPT-4 Turbo*',
        },
        accessory: {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Apply Changes',
            emoji: true,
          },
          action_id: 'apply_optimization',
          style: 'primary',
        },
      },
    ],
  });
}

/**
 * Send a thread reply
 */
export async function replyToThread(channel: string, threadTs: string, text: string) {
  return slack.client.postThreadReply(channel, threadTs, text);
}

/**
 * Send an ephemeral message (visible only to one user)
 */
export async function sendEphemeralMessage(channel: string, user: string, text: string) {
  return slack.client.postEphemeral(channel, user, text);
}

// ============================================================================
// Example 3: Interactive Components
// ============================================================================

/**
 * Open a configuration modal
 */
export async function openConfigModal(triggerId: string) {
  return slack.client.openModal(triggerId, {
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
          text: 'Select Model',
        },
        element: {
          type: 'static_select',
          action_id: 'model_select',
          placeholder: {
            type: 'plain_text',
            text: 'Choose a model',
          },
          options: [
            {
              text: { type: 'plain_text', text: 'GPT-4 Turbo' },
              value: 'gpt-4-turbo',
            },
            {
              text: { type: 'plain_text', text: 'Claude 3 Opus' },
              value: 'claude-3-opus',
            },
            {
              text: { type: 'plain_text', text: 'Gemini Pro' },
              value: 'gemini-pro',
            },
          ],
        },
      },
      {
        type: 'input',
        block_id: 'temperature_block',
        label: {
          type: 'plain_text',
          text: 'Temperature',
        },
        element: {
          type: 'plain_text_input',
          action_id: 'temperature_input',
          placeholder: {
            type: 'plain_text',
            text: '0.7',
          },
        },
      },
      {
        type: 'input',
        block_id: 'optimization_block',
        label: {
          type: 'plain_text',
          text: 'Optimization Goal',
        },
        element: {
          type: 'radio_buttons',
          action_id: 'optimization_radio',
          options: [
            {
              text: { type: 'plain_text', text: 'Cost' },
              value: 'cost',
            },
            {
              text: { type: 'plain_text', text: 'Quality' },
              value: 'quality',
            },
            {
              text: { type: 'plain_text', text: 'Latency' },
              value: 'latency',
            },
          ],
        },
      },
    ],
    submit: {
      type: 'plain_text',
      text: 'Submit',
    },
  });
}

// ============================================================================
// Example 4: Webhook Event Handling
// ============================================================================

/**
 * Setup webhook event handlers
 */
export function setupWebhookHandlers() {
  // Handle message events
  slack.webhook.onMessage(async (event: MessageEvent, context) => {
    console.log('Message received:', event.text);
    console.log('From channel:', event.channel);
    console.log('Team:', context.teamId);

    // Ignore bot messages
    if (event.bot_id) return;

    // Respond to specific keywords
    if (event.text?.toLowerCase().includes('optimize')) {
      await slack.client.postMessage({
        channel: event.channel,
        text: 'I can help with that! Use `/optimize` to get started.',
        thread_ts: event.ts,
      });
    }
  });

  // Handle app mentions
  slack.webhook.onAppMention(async (event: AppMentionEvent, context) => {
    console.log('App mentioned by:', event.user);

    await slack.client.postMessage({
      channel: event.channel,
      text: `Hi <@${event.user}>! I'm the LLM Auto Optimizer. How can I help you today?`,
      thread_ts: event.ts,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `Hi <@${event.user}>! I'm the LLM Auto Optimizer.`,
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
              action_id: 'get_status',
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
  });

  // Handle button clicks
  slack.webhook.onInteractive('apply_optimization', async (payload: BlockActionsPayload, context) => {
    console.log('Button clicked by:', context.user.id);

    // Send acknowledgment
    if (context.responseUrl) {
      await slack.client.respondToUrl(context.responseUrl, {
        text: 'Applying optimization...',
        replace_original: true,
      });
    }

    // Apply optimization (simulate)
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Send completion message
    if (context.responseUrl) {
      await slack.client.respondToUrl(context.responseUrl, {
        text: 'Optimization applied successfully!',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: ':white_check_mark: *Optimization Applied Successfully*\n\nModel: GPT-4 Turbo\nEstimated savings: 45%',
            },
          },
        ],
        replace_original: true,
      });
    }
  });

  // Handle modal submission
  slack.webhook.onInteractive('config_modal', async (payload: ViewSubmissionPayload, context) => {
    const values = payload.view.state.values;

    const model = values.model_block.model_select.selected_option?.value;
    const temperature = values.temperature_block.temperature_input.value;
    const optimization = values.optimization_block.optimization_radio.selected_option?.value;

    console.log('Configuration submitted:');
    console.log('Model:', model);
    console.log('Temperature:', temperature);
    console.log('Optimization:', optimization);

    // Process configuration
    // Return success or error response
    return {
      response_action: 'clear',
    };
  });
}

// ============================================================================
// Example 5: Slash Commands
// ============================================================================

/**
 * Setup slash command handlers
 */
export function setupCommandHandlers() {
  // /optimize command
  slack.commands.command(
    {
      name: 'optimize',
      description: 'Start LLM optimization',
      usage: '/optimize [model] [options]',
      examples: [
        '/optimize',
        '/optimize gpt-4',
        '/optimize claude-3 --cost-optimized',
      ],
      rateLimit: 5, // 5 requests per minute
    },
    async (payload: SlashCommandPayload, context: CommandContext) => {
      const [model, ...options] = context.args;

      // Start optimization asynchronously
      context.respondLater({
        response_type: 'in_channel',
        text: `Optimization started for ${model || 'default model'}...`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `:rocket: Starting optimization for *${model || 'default model'}*...`,
            },
          },
        ],
      }).catch(console.error);

      // Return immediate response
      return {
        response_type: 'ephemeral',
        text: 'Optimization initiated! You will be notified when complete.',
      };
    }
  );

  // /status command
  slack.commands.command(
    {
      name: 'status',
      description: 'Get optimization status',
      usage: '/status',
      rateLimit: 10,
    },
    async (payload: SlashCommandPayload, context: CommandContext) => {
      return {
        response_type: 'ephemeral',
        text: 'Current Status',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: 'LLM Auto Optimizer Status',
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: '*Active Models:*\n3',
              },
              {
                type: 'mrkdwn',
                text: '*Cost Savings:*\n$2,450/month',
              },
              {
                type: 'mrkdwn',
                text: '*Avg Latency:*\n240ms',
              },
              {
                type: 'mrkdwn',
                text: '*Quality Score:*\n98/100',
              },
            ],
          },
        ],
      };
    }
  );

  // /help command
  slack.commands.command(
    {
      name: 'help',
      description: 'Show available commands',
      usage: '/help [command]',
    },
    async (payload: SlashCommandPayload, context: CommandContext) => {
      const [commandName] = context.args;

      if (commandName) {
        // Show help for specific command
        const help = slack.commands.getCommandHelp(commandName);
        return {
          response_type: 'ephemeral',
          text: help || `Command not found: ${commandName}`,
        };
      }

      // Show all commands
      const commands = slack.commands.getAllCommands();
      return {
        response_type: 'ephemeral',
        text: 'Available Commands',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: 'Available Commands',
            },
          },
          {
            type: 'divider',
          },
          ...commands.map((cmd) => ({
            type: 'section' as const,
            text: {
              type: 'mrkdwn' as const,
              text: `*/${cmd.name}*\n${cmd.description}`,
            },
          })),
        ],
      };
    }
  );
}

// ============================================================================
// Example 6: Error Handling
// ============================================================================

/**
 * Example with comprehensive error handling
 */
export async function sendMessageWithErrorHandling(channel: string, text: string) {
  try {
    const result = await slack.client.postMessage({
      channel,
      text,
    });

    console.log('Message sent successfully:', result.ts);
    return result;
  } catch (error: any) {
    console.error('Failed to send message:', error);

    // Handle specific error types
    if (error.code === 'channel_not_found') {
      console.error('Channel does not exist');
    } else if (error.code === 'not_in_channel') {
      console.error('Bot is not in the channel');
      // Try joining the channel
      await slack.client.joinChannel(channel);
      // Retry sending message
      return slack.client.postMessage({ channel, text });
    } else if (error.code === 'RATE_LIMITED') {
      console.error('Rate limited, retry after:', error.retryAfter);
    }

    throw error;
  }
}

// ============================================================================
// Example 7: Complete Integration Setup
// ============================================================================

/**
 * Initialize complete Slack integration
 */
export async function initializeSlackIntegration() {
  console.log('Initializing Slack integration...');

  // Setup webhook handlers
  setupWebhookHandlers();

  // Setup command handlers
  setupCommandHandlers();

  // Test authentication
  try {
    const authTest = await slack.client.testAuth();
    console.log('Authentication successful!');
    console.log('Bot User ID:', authTest);
  } catch (error) {
    console.error('Authentication failed:', error);
    throw error;
  }

  console.log('Slack integration ready!');

  return slack;
}

// Export for use in other modules
export { slack };
