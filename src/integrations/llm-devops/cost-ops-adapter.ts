/**
 * LLM-CostOps Adapter
 * Thin runtime consumer for cost telemetry and cost projections
 *
 * @module integrations/llm-devops/cost-ops-adapter
 * @see https://github.com/LLM-Dev-Ops/cost-ops
 */

// ============================================================================
// Types
// ============================================================================

export interface CostOpsConfig {
  /** API endpoint for CostOps service */
  apiBaseUrl: string;
  /** Authentication token */
  apiKey: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Enable automatic retry on transient failures */
  enableRetry?: boolean;
  /** Maximum retry attempts */
  maxRetries?: number;
}

export interface CostTelemetryEvent {
  /** Unique event identifier */
  eventId: string;
  /** Timestamp of the cost event */
  timestamp: string;
  /** Model identifier */
  modelId: string;
  /** Provider name (e.g., 'openai', 'anthropic') */
  provider: string;
  /** Input token count */
  inputTokens: number;
  /** Output token count */
  outputTokens: number;
  /** Computed cost in USD */
  costUsd: number;
  /** Request latency in milliseconds */
  latencyMs?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface CostProjection {
  /** Projection identifier */
  projectionId: string;
  /** Time window start */
  windowStart: string;
  /** Time window end */
  windowEnd: string;
  /** Projected cost in USD */
  projectedCostUsd: number;
  /** Confidence interval lower bound */
  confidenceLower: number;
  /** Confidence interval upper bound */
  confidenceUpper: number;
  /** Model breakdown */
  byModel: Record<string, number>;
  /** Provider breakdown */
  byProvider: Record<string, number>;
}

export interface CostAggregation {
  /** Aggregation period */
  period: 'hourly' | 'daily' | 'weekly' | 'monthly';
  /** Start of aggregation window */
  startTime: string;
  /** End of aggregation window */
  endTime: string;
  /** Total cost in USD */
  totalCostUsd: number;
  /** Total requests */
  totalRequests: number;
  /** Average cost per request */
  avgCostPerRequest: number;
  /** Cost by model */
  costByModel: Record<string, number>;
  /** Cost by provider */
  costByProvider: Record<string, number>;
}

export type CostOpsEventHandler = (event: CostTelemetryEvent) => void | Promise<void>;
export type CostProjectionHandler = (projection: CostProjection) => void | Promise<void>;

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Partial<CostOpsConfig> = {
  timeout: 30000,
  enableRetry: true,
  maxRetries: 3,
};

// ============================================================================
// CostOps Adapter
// ============================================================================

/**
 * Thin adapter for consuming cost telemetry and projections from LLM-CostOps
 */
export class CostOpsAdapter {
  private config: Required<CostOpsConfig>;
  private eventHandlers: Set<CostOpsEventHandler> = new Set();
  private projectionHandlers: Set<CostProjectionHandler> = new Set();
  private isListening: boolean = false;

  constructor(config: CostOpsConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as Required<CostOpsConfig>;
  }

  // --------------------------------------------------------------------------
  // Event Subscription
  // --------------------------------------------------------------------------

  /**
   * Subscribe to cost telemetry events
   */
  onCostEvent(handler: CostOpsEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Subscribe to cost projection updates
   */
  onProjection(handler: CostProjectionHandler): () => void {
    this.projectionHandlers.add(handler);
    return () => this.projectionHandlers.delete(handler);
  }

  // --------------------------------------------------------------------------
  // Data Consumption
  // --------------------------------------------------------------------------

  /**
   * Fetch latest cost telemetry events
   */
  async fetchCostEvents(options?: {
    since?: string;
    limit?: number;
    modelId?: string;
    provider?: string;
  }): Promise<CostTelemetryEvent[]> {
    const params = new URLSearchParams();
    if (options?.since) params.set('since', options.since);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.modelId) params.set('model_id', options.modelId);
    if (options?.provider) params.set('provider', options.provider);

    const response = await this.makeRequest<{ events: CostTelemetryEvent[] }>(
      `/api/v1/telemetry/events?${params.toString()}`
    );
    return response.events;
  }

  /**
   * Fetch cost projections for a given time window
   */
  async fetchProjections(options?: {
    windowDays?: number;
    modelIds?: string[];
  }): Promise<CostProjection[]> {
    const params = new URLSearchParams();
    if (options?.windowDays) params.set('window_days', String(options.windowDays));
    if (options?.modelIds) params.set('model_ids', options.modelIds.join(','));

    const response = await this.makeRequest<{ projections: CostProjection[] }>(
      `/api/v1/projections?${params.toString()}`
    );
    return response.projections;
  }

  /**
   * Fetch aggregated cost data
   */
  async fetchAggregations(options: {
    period: CostAggregation['period'];
    startTime?: string;
    endTime?: string;
  }): Promise<CostAggregation[]> {
    const params = new URLSearchParams();
    params.set('period', options.period);
    if (options.startTime) params.set('start_time', options.startTime);
    if (options.endTime) params.set('end_time', options.endTime);

    const response = await this.makeRequest<{ aggregations: CostAggregation[] }>(
      `/api/v1/aggregations?${params.toString()}`
    );
    return response.aggregations;
  }

  /**
   * Get current cost rate (cost per minute)
   */
  async getCurrentRate(): Promise<{ ratePerMinute: number; ratePerHour: number }> {
    return this.makeRequest('/api/v1/rate/current');
  }

  // --------------------------------------------------------------------------
  // Streaming / Polling
  // --------------------------------------------------------------------------

  /**
   * Start listening for real-time cost events (polling-based)
   */
  startListening(intervalMs: number = 5000): void {
    if (this.isListening) return;
    this.isListening = true;
    this.pollEvents(intervalMs);
  }

  /**
   * Stop listening for events
   */
  stopListening(): void {
    this.isListening = false;
  }

  private async pollEvents(intervalMs: number): Promise<void> {
    let lastEventId: string | undefined;

    while (this.isListening) {
      try {
        const events = await this.fetchCostEvents({
          since: lastEventId,
          limit: 100,
        });

        for (const event of events) {
          lastEventId = event.eventId;
          for (const handler of this.eventHandlers) {
            await handler(event);
          }
        }
      } catch (error) {
        // Log but continue polling
        console.error('[CostOpsAdapter] Poll error:', error);
      }

      await this.sleep(intervalMs);
    }
  }

  // --------------------------------------------------------------------------
  // Internal Helpers
  // --------------------------------------------------------------------------

  private async makeRequest<T>(path: string, attempt: number = 0): Promise<T> {
    const url = `${this.config.apiBaseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'X-Client': 'llm-auto-optimizer',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`CostOps API error: ${response.status} ${response.statusText}`);
      }

      return await response.json() as T;
    } catch (error) {
      if (this.config.enableRetry && attempt < this.config.maxRetries && this.isRetryable(error)) {
        await this.sleep(this.calculateBackoff(attempt));
        return this.makeRequest<T>(path, attempt + 1);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof Error) {
      return error.name === 'AbortError' ||
             error.message.includes('502') ||
             error.message.includes('503') ||
             error.message.includes('504');
    }
    return false;
  }

  private calculateBackoff(attempt: number): number {
    return Math.min(1000 * Math.pow(2, attempt), 30000);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createCostOpsAdapter(config: CostOpsConfig): CostOpsAdapter {
  return new CostOpsAdapter(config);
}
