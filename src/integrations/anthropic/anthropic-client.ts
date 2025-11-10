/**
 * Anthropic Claude API Client
 * Integration with Claude API for LLM optimization
 */

import axios, { AxiosInstance } from 'axios';

export interface AnthropicConfig {
  apiKey: string;
  apiBaseUrl?: string;
  timeout?: number;
  defaultModel?: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: Message[];
  max_tokens: number;
  temperature?: number;
  system?: string;
  stop_sequences?: string[];
}

export interface ChatResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{ type: 'text'; text: string }>;
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface ModelInfo {
  id: string;
  name: string;
  maxTokens: number;
  costPer1kInputTokens: number;
  costPer1kOutputTokens: number;
}

/**
 * Anthropic Claude API client
 */
export class AnthropicClient {
  private client: AxiosInstance;
  private requestCount: number = 0;
  private tokenUsage: { input: number; output: number } = { input: 0, output: 0 };

  // Available Claude models
  static readonly MODELS: Record<string, ModelInfo> = {
    'claude-3-opus': {
      id: 'claude-3-opus-20240229',
      name: 'Claude 3 Opus',
      maxTokens: 200000,
      costPer1kInputTokens: 0.015,
      costPer1kOutputTokens: 0.075,
    },
    'claude-3-sonnet': {
      id: 'claude-3-sonnet-20240229',
      name: 'Claude 3 Sonnet',
      maxTokens: 200000,
      costPer1kInputTokens: 0.003,
      costPer1kOutputTokens: 0.015,
    },
    'claude-3-haiku': {
      id: 'claude-3-haiku-20240307',
      name: 'Claude 3 Haiku',
      maxTokens: 200000,
      costPer1kInputTokens: 0.00025,
      costPer1kOutputTokens: 0.00125,
    },
  };

  constructor(private config: AnthropicConfig) {
    this.client = axios.create({
      baseURL: config.apiBaseUrl || 'https://api.anthropic.com/v1',
      timeout: config.timeout || 60000,
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Send chat completion request
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    this.requestCount++;

    const response = await this.client.post('/messages', request);
    const data: ChatResponse = response.data;

    // Track token usage
    this.tokenUsage.input += data.usage.input_tokens;
    this.tokenUsage.output += data.usage.output_tokens;

    return data;
  }

  /**
   * Simple completion helper
   */
  async complete(
    prompt: string,
    options: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      system?: string;
    } = {},
  ): Promise<string> {
    const model = options.model || this.config.defaultModel || 'claude-3-sonnet-20240229';

    const response = await this.chat({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: options.maxTokens || 1024,
      temperature: options.temperature,
      system: options.system,
    });

    return response.content[0].text;
  }

  /**
   * Calculate cost for tokens
   */
  calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const modelInfo = Object.values(AnthropicClient.MODELS).find(m => m.id === model);
    if (!modelInfo) {
      throw new Error(`Unknown model: ${model}`);
    }

    const inputCost = (inputTokens / 1000) * modelInfo.costPer1kInputTokens;
    const outputCost = (outputTokens / 1000) * modelInfo.costPer1kOutputTokens;

    return inputCost + outputCost;
  }

  /**
   * Get usage statistics
   */
  getUsageStats(): {
    requestCount: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
  } {
    return {
      requestCount: this.requestCount,
      totalTokens: this.tokenUsage.input + this.tokenUsage.output,
      inputTokens: this.tokenUsage.input,
      outputTokens: this.tokenUsage.output,
    };
  }

  /**
   * Reset usage statistics
   */
  resetUsageStats(): void {
    this.requestCount = 0;
    this.tokenUsage = { input: 0, output: 0 };
  }

  /**
   * Get model information
   */
  static getModelInfo(modelKey: string): ModelInfo | undefined {
    return AnthropicClient.MODELS[modelKey];
  }

  /**
   * List available models
   */
  static listModels(): ModelInfo[] {
    return Object.values(AnthropicClient.MODELS);
  }
}
