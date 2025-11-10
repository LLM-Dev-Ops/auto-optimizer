/**
 * Slack Integration Types
 *
 * Comprehensive TypeScript interfaces for Slack API integration
 * @module slack-types
 */

/**
 * Slack API Configuration
 */
export interface SlackConfig {
  /** Bot OAuth token (starts with xoxb-) */
  botToken: string;
  /** App-level token for socket mode (starts with xapp-) */
  appToken?: string;
  /** Signing secret for webhook verification */
  signingSecret: string;
  /** Client ID for OAuth flow */
  clientId?: string;
  /** Client secret for OAuth flow */
  clientSecret?: string;
  /** Redirect URL for OAuth flow */
  redirectUri?: string;
  /** Rate limit per channel (requests per second) */
  rateLimit?: number;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Enable retry on rate limit */
  enableRetry?: boolean;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Enable token rotation */
  enableTokenRotation?: boolean;
  /** Token rotation interval in hours */
  tokenRotationInterval?: number;
}

/**
 * OAuth Access Token Response
 */
export interface OAuthAccessResponse {
  ok: boolean;
  access_token: string;
  token_type: string;
  scope: string;
  bot_user_id?: string;
  app_id: string;
  team: {
    id: string;
    name: string;
  };
  enterprise?: {
    id: string;
    name: string;
  };
  authed_user?: {
    id: string;
    scope?: string;
    access_token?: string;
    token_type?: string;
  };
  incoming_webhook?: {
    channel: string;
    channel_id: string;
    configuration_url: string;
    url: string;
  };
  error?: string;
  error_description?: string;
}

/**
 * OAuth Token Refresh Response
 */
export interface OAuthTokenRefreshResponse {
  ok: boolean;
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  error?: string;
}

/**
 * Message Block Kit Element Types
 */
export type BlockElement =
  | ButtonElement
  | StaticSelectElement
  | MultiStaticSelectElement
  | OverflowElement
  | DatepickerElement
  | PlainTextInputElement
  | RadioButtonsElement
  | CheckboxesElement;

/**
 * Button Element
 */
export interface ButtonElement {
  type: 'button';
  text: PlainTextObject;
  action_id: string;
  url?: string;
  value?: string;
  style?: 'primary' | 'danger';
  confirm?: ConfirmationDialog;
  accessibility_label?: string;
}

/**
 * Static Select Element
 */
export interface StaticSelectElement {
  type: 'static_select';
  action_id: string;
  placeholder: PlainTextObject;
  options: OptionObject[];
  initial_option?: OptionObject;
  confirm?: ConfirmationDialog;
}

/**
 * Multi Static Select Element
 */
export interface MultiStaticSelectElement {
  type: 'multi_static_select';
  action_id: string;
  placeholder: PlainTextObject;
  options: OptionObject[];
  initial_options?: OptionObject[];
  max_selected_items?: number;
  confirm?: ConfirmationDialog;
}

/**
 * Overflow Element
 */
export interface OverflowElement {
  type: 'overflow';
  action_id: string;
  options: OptionObject[];
  confirm?: ConfirmationDialog;
}

/**
 * Datepicker Element
 */
export interface DatepickerElement {
  type: 'datepicker';
  action_id: string;
  placeholder?: PlainTextObject;
  initial_date?: string;
  confirm?: ConfirmationDialog;
}

/**
 * Plain Text Input Element
 */
export interface PlainTextInputElement {
  type: 'plain_text_input';
  action_id: string;
  placeholder?: PlainTextObject;
  initial_value?: string;
  multiline?: boolean;
  min_length?: number;
  max_length?: number;
}

/**
 * Radio Buttons Element
 */
export interface RadioButtonsElement {
  type: 'radio_buttons';
  action_id: string;
  options: OptionObject[];
  initial_option?: OptionObject;
  confirm?: ConfirmationDialog;
}

/**
 * Checkboxes Element
 */
export interface CheckboxesElement {
  type: 'checkboxes';
  action_id: string;
  options: OptionObject[];
  initial_options?: OptionObject[];
  confirm?: ConfirmationDialog;
}

/**
 * Block Kit Block Types
 */
export type Block =
  | SectionBlock
  | DividerBlock
  | ImageBlock
  | ActionsBlock
  | ContextBlock
  | InputBlock
  | HeaderBlock;

/**
 * Section Block
 */
export interface SectionBlock {
  type: 'section';
  text?: TextObject;
  block_id?: string;
  fields?: TextObject[];
  accessory?: BlockElement;
}

/**
 * Divider Block
 */
export interface DividerBlock {
  type: 'divider';
  block_id?: string;
}

/**
 * Image Block
 */
export interface ImageBlock {
  type: 'image';
  image_url: string;
  alt_text: string;
  title?: PlainTextObject;
  block_id?: string;
}

/**
 * Actions Block
 */
export interface ActionsBlock {
  type: 'actions';
  elements: BlockElement[];
  block_id?: string;
}

/**
 * Context Block
 */
export interface ContextBlock {
  type: 'context';
  elements: (TextObject | ImageElement)[];
  block_id?: string;
}

/**
 * Input Block
 */
export interface InputBlock {
  type: 'input';
  label: PlainTextObject;
  element: BlockElement;
  block_id?: string;
  dispatch_action?: boolean;
  hint?: PlainTextObject;
  optional?: boolean;
}

/**
 * Header Block
 */
export interface HeaderBlock {
  type: 'header';
  text: PlainTextObject;
  block_id?: string;
}

/**
 * Text Object Types
 */
export type TextObject = PlainTextObject | MrkdwnObject;

/**
 * Plain Text Object
 */
export interface PlainTextObject {
  type: 'plain_text';
  text: string;
  emoji?: boolean;
}

/**
 * Markdown Object
 */
export interface MrkdwnObject {
  type: 'mrkdwn';
  text: string;
  verbatim?: boolean;
}

/**
 * Image Element (for context blocks)
 */
export interface ImageElement {
  type: 'image';
  image_url: string;
  alt_text: string;
}

/**
 * Option Object
 */
export interface OptionObject {
  text: PlainTextObject;
  value: string;
  description?: PlainTextObject;
  url?: string;
}

/**
 * Confirmation Dialog
 */
export interface ConfirmationDialog {
  title: PlainTextObject;
  text: TextObject;
  confirm: PlainTextObject;
  deny: PlainTextObject;
  style?: 'primary' | 'danger';
}

/**
 * Message Payload
 */
export interface MessagePayload {
  channel: string;
  text: string;
  thread_ts?: string;
  blocks?: Block[];
  attachments?: Attachment[];
  reply_broadcast?: boolean;
  unfurl_links?: boolean;
  unfurl_media?: boolean;
  mrkdwn?: boolean;
  metadata?: MessageMetadata;
}

/**
 * Message Attachment (Legacy)
 */
export interface Attachment {
  fallback?: string;
  color?: string;
  pretext?: string;
  author_name?: string;
  author_link?: string;
  author_icon?: string;
  title?: string;
  title_link?: string;
  text?: string;
  fields?: AttachmentField[];
  image_url?: string;
  thumb_url?: string;
  footer?: string;
  footer_icon?: string;
  ts?: number;
  actions?: AttachmentAction[];
}

/**
 * Attachment Field
 */
export interface AttachmentField {
  title: string;
  value: string;
  short?: boolean;
}

/**
 * Attachment Action
 */
export interface AttachmentAction {
  name: string;
  text: string;
  type: string;
  value?: string;
  style?: string;
  confirm?: {
    title: string;
    text: string;
    ok_text: string;
    dismiss_text: string;
  };
}

/**
 * Message Metadata
 */
export interface MessageMetadata {
  event_type: string;
  event_payload: Record<string, unknown>;
}

/**
 * Modal View
 */
export interface ModalView {
  type: 'modal';
  title: PlainTextObject;
  blocks: Block[];
  close?: PlainTextObject;
  submit?: PlainTextObject;
  private_metadata?: string;
  callback_id?: string;
  clear_on_close?: boolean;
  notify_on_close?: boolean;
  external_id?: string;
}

/**
 * Home Tab View
 */
export interface HomeTabView {
  type: 'home';
  blocks: Block[];
  private_metadata?: string;
  callback_id?: string;
  external_id?: string;
}

/**
 * Slash Command Payload
 */
export interface SlashCommandPayload {
  token: string;
  team_id: string;
  team_domain: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  user_name: string;
  command: string;
  text: string;
  api_app_id: string;
  response_url: string;
  trigger_id: string;
}

/**
 * Slash Command Response
 */
export interface SlashCommandResponse {
  response_type?: 'in_channel' | 'ephemeral';
  text: string;
  blocks?: Block[];
  attachments?: Attachment[];
  thread_ts?: string;
  replace_original?: boolean;
  delete_original?: boolean;
}

/**
 * Interactive Payload Types
 */
export type InteractivePayload =
  | BlockActionsPayload
  | ViewSubmissionPayload
  | ViewClosedPayload
  | MessageActionPayload
  | ShortcutPayload;

/**
 * Block Actions Payload
 */
export interface BlockActionsPayload {
  type: 'block_actions';
  user: SlackUser;
  api_app_id: string;
  token: string;
  container: MessageContainer;
  trigger_id: string;
  team: SlackTeam;
  enterprise?: SlackEnterprise;
  is_enterprise_install?: boolean;
  channel?: SlackChannel;
  message?: SlackMessage;
  view?: ModalView | HomeTabView;
  state?: ViewState;
  response_url?: string;
  actions: BlockAction[];
}

/**
 * View Submission Payload
 */
export interface ViewSubmissionPayload {
  type: 'view_submission';
  team: SlackTeam;
  user: SlackUser;
  api_app_id: string;
  token: string;
  trigger_id: string;
  view: ModalView;
  response_urls?: ResponseUrl[];
}

/**
 * View Closed Payload
 */
export interface ViewClosedPayload {
  type: 'view_closed';
  team: SlackTeam;
  user: SlackUser;
  api_app_id: string;
  token: string;
  view: ModalView;
  is_cleared: boolean;
}

/**
 * Message Action Payload
 */
export interface MessageActionPayload {
  type: 'message_action';
  token: string;
  action_ts: string;
  team: SlackTeam;
  user: SlackUser;
  channel: SlackChannel;
  message: SlackMessage;
  trigger_id: string;
  callback_id: string;
  response_url: string;
}

/**
 * Shortcut Payload
 */
export interface ShortcutPayload {
  type: 'shortcut';
  token: string;
  action_ts: string;
  team: SlackTeam;
  user: SlackUser;
  trigger_id: string;
  callback_id: string;
}

/**
 * Block Action
 */
export interface BlockAction {
  type: string;
  action_id: string;
  block_id: string;
  action_ts: string;
  value?: string;
  selected_option?: OptionObject;
  selected_options?: OptionObject[];
  selected_date?: string;
  initial_option?: OptionObject;
  initial_date?: string;
}

/**
 * View State
 */
export interface ViewState {
  values: {
    [blockId: string]: {
      [actionId: string]: {
        type: string;
        value?: string;
        selected_option?: OptionObject;
        selected_options?: OptionObject[];
        selected_date?: string;
      };
    };
  };
}

/**
 * Message Container
 */
export interface MessageContainer {
  type: 'message' | 'view';
  message_ts?: string;
  channel_id?: string;
  is_ephemeral?: boolean;
  view_id?: string;
}

/**
 * Response URL
 */
export interface ResponseUrl {
  block_id: string;
  action_id: string;
  channel_id: string;
  response_url: string;
}

/**
 * Event Subscription Payload
 */
export interface EventPayload {
  token: string;
  team_id: string;
  api_app_id: string;
  event: SlackEvent;
  type: 'event_callback';
  event_id: string;
  event_time: number;
  authorizations?: Authorization[];
}

/**
 * URL Verification Payload
 */
export interface UrlVerificationPayload {
  type: 'url_verification';
  token: string;
  challenge: string;
}

/**
 * Slack Event Types
 */
export type SlackEvent =
  | MessageEvent
  | AppMentionEvent
  | ReactionAddedEvent
  | ReactionRemovedEvent
  | ChannelCreatedEvent
  | ChannelDeletedEvent
  | MemberJoinedChannelEvent
  | MemberLeftChannelEvent
  | UserChangeEvent
  | TeamJoinEvent;

/**
 * Message Event
 */
export interface MessageEvent {
  type: 'message';
  subtype?: string;
  channel: string;
  user?: string;
  text: string;
  ts: string;
  thread_ts?: string;
  edited?: {
    user: string;
    ts: string;
  };
  bot_id?: string;
  channel_type: 'channel' | 'group' | 'im' | 'mpim';
}

/**
 * App Mention Event
 */
export interface AppMentionEvent {
  type: 'app_mention';
  user: string;
  text: string;
  ts: string;
  channel: string;
  event_ts: string;
  thread_ts?: string;
}

/**
 * Reaction Added Event
 */
export interface ReactionAddedEvent {
  type: 'reaction_added';
  user: string;
  reaction: string;
  item_user: string;
  item: {
    type: string;
    channel: string;
    ts: string;
  };
  event_ts: string;
}

/**
 * Reaction Removed Event
 */
export interface ReactionRemovedEvent {
  type: 'reaction_removed';
  user: string;
  reaction: string;
  item_user: string;
  item: {
    type: string;
    channel: string;
    ts: string;
  };
  event_ts: string;
}

/**
 * Channel Created Event
 */
export interface ChannelCreatedEvent {
  type: 'channel_created';
  channel: {
    id: string;
    name: string;
    created: number;
    creator: string;
  };
}

/**
 * Channel Deleted Event
 */
export interface ChannelDeletedEvent {
  type: 'channel_deleted';
  channel: string;
}

/**
 * Member Joined Channel Event
 */
export interface MemberJoinedChannelEvent {
  type: 'member_joined_channel';
  user: string;
  channel: string;
  channel_type: string;
  team: string;
  inviter?: string;
}

/**
 * Member Left Channel Event
 */
export interface MemberLeftChannelEvent {
  type: 'member_left_channel';
  user: string;
  channel: string;
  channel_type: string;
  team: string;
}

/**
 * User Change Event
 */
export interface UserChangeEvent {
  type: 'user_change';
  user: SlackUser;
}

/**
 * Team Join Event
 */
export interface TeamJoinEvent {
  type: 'team_join';
  user: SlackUser;
}

/**
 * Authorization
 */
export interface Authorization {
  enterprise_id: string | null;
  team_id: string;
  user_id: string;
  is_bot: boolean;
  is_enterprise_install?: boolean;
}

/**
 * Slack User
 */
export interface SlackUser {
  id: string;
  username?: string;
  name?: string;
  team_id?: string;
  real_name?: string;
  display_name?: string;
  profile?: {
    real_name?: string;
    display_name?: string;
    email?: string;
    image_24?: string;
    image_32?: string;
    image_48?: string;
    image_72?: string;
    image_192?: string;
    image_512?: string;
  };
}

/**
 * Slack Team
 */
export interface SlackTeam {
  id: string;
  domain: string;
  name?: string;
}

/**
 * Slack Enterprise
 */
export interface SlackEnterprise {
  id: string;
  name: string;
}

/**
 * Slack Channel
 */
export interface SlackChannel {
  id: string;
  name?: string;
}

/**
 * Slack Message
 */
export interface SlackMessage {
  type: string;
  user?: string;
  text: string;
  ts: string;
  thread_ts?: string;
  channel?: string;
  blocks?: Block[];
  attachments?: Attachment[];
}

/**
 * API Response
 */
export interface SlackAPIResponse {
  ok: boolean;
  error?: string;
  warning?: string;
  response_metadata?: {
    next_cursor?: string;
    messages?: string[];
  };
}

/**
 * Chat Post Message Response
 */
export interface ChatPostMessageResponse extends SlackAPIResponse {
  channel: string;
  ts: string;
  message: SlackMessage;
}

/**
 * Views Open Response
 */
export interface ViewsOpenResponse extends SlackAPIResponse {
  view: ModalView;
}

/**
 * Views Update Response
 */
export interface ViewsUpdateResponse extends SlackAPIResponse {
  view: ModalView;
}

/**
 * Rate Limit Info
 */
export interface RateLimitInfo {
  channel: string;
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRate: number;
}

/**
 * Retry Configuration
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  factor: number;
}

/**
 * Error Response
 */
export interface SlackError extends Error {
  code?: string;
  data?: SlackAPIResponse;
  statusCode?: number;
  headers?: Record<string, string>;
  retryAfter?: number;
}

/**
 * Token Storage Interface
 */
export interface TokenStorage {
  store(teamId: string, token: string, expiresAt?: Date): Promise<void>;
  retrieve(teamId: string): Promise<string | null>;
  delete(teamId: string): Promise<void>;
  isExpired(teamId: string): Promise<boolean>;
}

/**
 * Webhook Request
 */
export interface WebhookRequest {
  body: string | Buffer;
  headers: Record<string, string | string[] | undefined>;
  timestamp: string;
  signature: string;
}

/**
 * Webhook Verification Result
 */
export interface WebhookVerificationResult {
  valid: boolean;
  error?: string;
}
