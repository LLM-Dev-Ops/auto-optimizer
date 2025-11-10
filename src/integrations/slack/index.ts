/**
 * Slack Integration for LLM Auto Optimizer
 *
 * Enterprise-grade Slack integration with OAuth 2.0, webhooks, slash commands,
 * and interactive components.
 *
 * @module slack-integration
 * @packageDocumentation
 */

// Client exports
export {
  SlackClient,
  createErrorBlock,
  createSuccessBlock,
  createInfoBlock,
  createWarningBlock,
} from './slack-client';

// Auth exports
export {
  SlackOAuthHandler,
  InMemoryTokenStorage,
  OAuthStateManager,
  generateOAuthState,
  validateScopes,
} from './slack-auth';

// Webhook exports
export {
  SlackWebhookProcessor,
  EventDeduplicator,
  extractWebhookRequest,
  verifyWebhookSignature,
  createWebhookProcessor,
} from './slack-webhooks';
export type {
  EventHandler,
  InteractiveHandler,
  EventContext,
  InteractiveContext,
  WebhookProcessorConfig,
} from './slack-webhooks';

// Command exports
export {
  SlashCommandRouter,
  CommandRateLimiter,
  createSuccessResponse,
  createErrorResponse,
  createInfoResponse,
  createHelpResponse,
  validatePayload,
  parseCommandArgs,
} from './slack-commands';
export type {
  CommandHandler,
  CommandContext,
  CommandConfig,
  ValidationResult,
} from './slack-commands';

// Type exports
export type {
  SlackConfig,
  OAuthAccessResponse,
  OAuthTokenRefreshResponse,
  BlockElement,
  ButtonElement,
  StaticSelectElement,
  MultiStaticSelectElement,
  OverflowElement,
  DatepickerElement,
  PlainTextInputElement,
  RadioButtonsElement,
  CheckboxesElement,
  Block,
  SectionBlock,
  DividerBlock,
  ImageBlock,
  ActionsBlock,
  ContextBlock,
  InputBlock,
  HeaderBlock,
  TextObject,
  PlainTextObject,
  MrkdwnObject,
  ImageElement,
  OptionObject,
  ConfirmationDialog,
  MessagePayload,
  Attachment,
  AttachmentField,
  AttachmentAction,
  MessageMetadata,
  ModalView,
  HomeTabView,
  SlashCommandPayload,
  SlashCommandResponse,
  InteractivePayload,
  BlockActionsPayload,
  ViewSubmissionPayload,
  ViewClosedPayload,
  MessageActionPayload,
  ShortcutPayload,
  BlockAction,
  ViewState,
  MessageContainer,
  ResponseUrl,
  EventPayload,
  UrlVerificationPayload,
  SlackEvent,
  MessageEvent,
  AppMentionEvent,
  ReactionAddedEvent,
  ReactionRemovedEvent,
  ChannelCreatedEvent,
  ChannelDeletedEvent,
  MemberJoinedChannelEvent,
  MemberLeftChannelEvent,
  UserChangeEvent,
  TeamJoinEvent,
  Authorization,
  SlackUser,
  SlackTeam,
  SlackEnterprise,
  SlackChannel,
  SlackMessage,
  SlackAPIResponse,
  ChatPostMessageResponse,
  ViewsOpenResponse,
  ViewsUpdateResponse,
  RateLimitInfo,
  RetryConfig,
  SlackError,
  TokenStorage,
  WebhookRequest,
  WebhookVerificationResult,
} from './slack-types';

/**
 * Creates a complete Slack integration instance
 *
 * @param config - Slack configuration
 * @returns Object containing all integration components
 *
 * @example
 * ```typescript
 * const slack = createSlackIntegration({
 *   botToken: process.env.SLACK_BOT_TOKEN!,
 *   signingSecret: process.env.SLACK_SIGNING_SECRET!,
 *   clientId: process.env.SLACK_CLIENT_ID,
 *   clientSecret: process.env.SLACK_CLIENT_SECRET,
 *   redirectUri: 'https://yourapp.com/oauth/callback',
 * });
 *
 * // Use the client
 * await slack.client.postMessage({
 *   channel: 'C123456',
 *   text: 'Hello, World!',
 * });
 *
 * // Process webhook
 * const result = await slack.webhook.processWebhook(request);
 *
 * // Handle command
 * const response = await slack.commands.processCommand(payload);
 * ```
 */
export function createSlackIntegration(config: import('./slack-types').SlackConfig) {
  const client = new SlackClient(config);
  const auth = new SlackOAuthHandler(config);
  const webhook = new SlackWebhookProcessor({
    signingSecret: config.signingSecret,
  });
  const commands = new SlashCommandRouter(client);

  return {
    client,
    auth,
    webhook,
    commands,
  };
}

/**
 * Version information
 */
export const VERSION = '1.0.0';

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  rateLimit: 1,
  timeout: 30000,
  enableRetry: true,
  maxRetries: 3,
  enableTokenRotation: false,
  tokenRotationInterval: 24,
} as const;
