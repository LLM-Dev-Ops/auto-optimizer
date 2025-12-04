/**
 * LLM-Observatory Adapter
 * Thin runtime consumer for telemetry traces and structured events
 *
 * @module integrations/llm-devops/observatory-adapter
 * @see https://github.com/LLM-Dev-Ops/observatory
 */

// ============================================================================
// Types
// ============================================================================

export interface ObservatoryConfig {
  /** API endpoint for Observatory service */
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

export interface TelemetryTrace {
  /** Unique trace identifier */
  traceId: string;
  /** Parent span ID (if any) */
  parentSpanId?: string;
  /** Span identifier */
  spanId: string;
  /** Operation name */
  operationName: string;
  /** Service name */
  serviceName: string;
  /** Start timestamp (ISO 8601) */
  startTime: string;
  /** End timestamp (ISO 8601) */
  endTime: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Status */
  status: 'ok' | 'error' | 'timeout';
  /** Error message if status is error */
  errorMessage?: string;
  /** Trace attributes */
  attributes: Record<string, string | number | boolean>;
  /** Resource attributes */
  resource: {
    modelId?: string;
    provider?: string;
    version?: string;
    environment?: string;
  };
  /** Span events */
  events: SpanEvent[];
  /** Span links */
  links: SpanLink[];
}

export interface SpanEvent {
  /** Event name */
  name: string;
  /** Event timestamp */
  timestamp: string;
  /** Event attributes */
  attributes: Record<string, string | number | boolean>;
}

export interface SpanLink {
  /** Linked trace ID */
  traceId: string;
  /** Linked span ID */
  spanId: string;
  /** Link attributes */
  attributes: Record<string, string | number | boolean>;
}

export interface StructuredEvent {
  /** Event identifier */
  eventId: string;
  /** Event timestamp */
  timestamp: string;
  /** Event type */
  type: StructuredEventType;
  /** Event category */
  category: 'llm' | 'system' | 'user' | 'security' | 'performance';
  /** Severity level */
  severity: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  /** Event message */
  message: string;
  /** Source service */
  source: string;
  /** Correlation ID for linking related events */
  correlationId?: string;
  /** Associated trace ID */
  traceId?: string;
  /** Model identifier */
  modelId?: string;
  /** Provider name */
  provider?: string;
  /** Event-specific data */
  data: Record<string, unknown>;
  /** Tags for filtering */
  tags: string[];
}

export type StructuredEventType =
  | 'request.start'
  | 'request.complete'
  | 'request.error'
  | 'model.switch'
  | 'model.fallback'
  | 'cache.hit'
  | 'cache.miss'
  | 'rate_limit.warning'
  | 'rate_limit.exceeded'
  | 'token.usage'
  | 'cost.recorded'
  | 'latency.threshold'
  | 'error.retry'
  | 'error.final'
  | 'optimization.triggered'
  | 'config.changed'
  | 'custom';

export interface TraceSearch {
  /** Service name filter */
  serviceName?: string;
  /** Operation name filter */
  operationName?: string;
  /** Model ID filter */
  modelId?: string;
  /** Provider filter */
  provider?: string;
  /** Status filter */
  status?: TelemetryTrace['status'];
  /** Minimum duration filter (ms) */
  minDurationMs?: number;
  /** Maximum duration filter (ms) */
  maxDurationMs?: number;
  /** Start time (ISO 8601) */
  startTime?: string;
  /** End time (ISO 8601) */
  endTime?: string;
  /** Tag filters */
  tags?: Record<string, string>;
  /** Maximum results */
  limit?: number;
}

export interface TraceSummary {
  /** Time window */
  window: {
    start: string;
    end: string;
  };
  /** Total traces */
  totalTraces: number;
  /** Traces by status */
  byStatus: Record<string, number>;
  /** Average duration (ms) */
  avgDurationMs: number;
  /** P50 duration (ms) */
  p50DurationMs: number;
  /** P99 duration (ms) */
  p99DurationMs: number;
  /** Error rate */
  errorRate: number;
  /** Traces by model */
  byModel: Record<string, number>;
  /** Traces by provider */
  byProvider: Record<string, number>;
}

export type TraceHandler = (trace: TelemetryTrace) => void | Promise<void>;
export type StructuredEventHandler = (event: StructuredEvent) => void | Promise<void>;

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Partial<ObservatoryConfig> = {
  timeout: 30000,
  enableRetry: true,
  maxRetries: 3,
};

// ============================================================================
// Observatory Adapter
// ============================================================================

/**
 * Thin adapter for consuming telemetry traces and structured events from LLM-Observatory
 */
export class ObservatoryAdapter {
  private config: Required<ObservatoryConfig>;
  private traceHandlers: Set<TraceHandler> = new Set();
  private eventHandlers: Set<StructuredEventHandler> = new Set();
  private isListening: boolean = false;

  constructor(config: ObservatoryConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as Required<ObservatoryConfig>;
  }

  // --------------------------------------------------------------------------
  // Event Subscription
  // --------------------------------------------------------------------------

  /**
   * Subscribe to telemetry traces
   */
  onTrace(handler: TraceHandler): () => void {
    this.traceHandlers.add(handler);
    return () => this.traceHandlers.delete(handler);
  }

  /**
   * Subscribe to structured events
   */
  onEvent(handler: StructuredEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  // --------------------------------------------------------------------------
  // Data Consumption
  // --------------------------------------------------------------------------

  /**
   * Search for traces
   */
  async searchTraces(query: TraceSearch): Promise<TelemetryTrace[]> {
    const params = new URLSearchParams();
    if (query.serviceName) params.set('service_name', query.serviceName);
    if (query.operationName) params.set('operation_name', query.operationName);
    if (query.modelId) params.set('model_id', query.modelId);
    if (query.provider) params.set('provider', query.provider);
    if (query.status) params.set('status', query.status);
    if (query.minDurationMs) params.set('min_duration_ms', String(query.minDurationMs));
    if (query.maxDurationMs) params.set('max_duration_ms', String(query.maxDurationMs));
    if (query.startTime) params.set('start_time', query.startTime);
    if (query.endTime) params.set('end_time', query.endTime);
    if (query.limit) params.set('limit', String(query.limit));
    if (query.tags) {
      Object.entries(query.tags).forEach(([k, v]) => params.set(`tag.${k}`, v));
    }

    const response = await this.makeRequest<{ traces: TelemetryTrace[] }>(
      `/api/v1/traces?${params.toString()}`
    );
    return response.traces;
  }

  /**
   * Get a specific trace by ID
   */
  async getTrace(traceId: string): Promise<TelemetryTrace & {
    spans: TelemetryTrace[];
  }> {
    return this.makeRequest(`/api/v1/traces/${encodeURIComponent(traceId)}`);
  }

  /**
   * Fetch structured events
   */
  async fetchEvents(options?: {
    type?: StructuredEventType;
    category?: StructuredEvent['category'];
    severity?: StructuredEvent['severity'];
    modelId?: string;
    correlationId?: string;
    since?: string;
    limit?: number;
  }): Promise<StructuredEvent[]> {
    const params = new URLSearchParams();
    if (options?.type) params.set('type', options.type);
    if (options?.category) params.set('category', options.category);
    if (options?.severity) params.set('severity', options.severity);
    if (options?.modelId) params.set('model_id', options.modelId);
    if (options?.correlationId) params.set('correlation_id', options.correlationId);
    if (options?.since) params.set('since', options.since);
    if (options?.limit) params.set('limit', String(options.limit));

    const response = await this.makeRequest<{ events: StructuredEvent[] }>(
      `/api/v1/events?${params.toString()}`
    );
    return response.events;
  }

  /**
   * Get trace summary statistics
   */
  async getTraceSummary(options?: {
    windowMinutes?: number;
    modelId?: string;
    provider?: string;
  }): Promise<TraceSummary> {
    const params = new URLSearchParams();
    if (options?.windowMinutes) params.set('window_minutes', String(options.windowMinutes));
    if (options?.modelId) params.set('model_id', options.modelId);
    if (options?.provider) params.set('provider', options.provider);

    return this.makeRequest<TraceSummary>(`/api/v1/traces/summary?${params.toString()}`);
  }

  /**
   * Get recent slow traces
   */
  async getSlowTraces(options?: {
    thresholdMs?: number;
    limit?: number;
  }): Promise<TelemetryTrace[]> {
    const params = new URLSearchParams();
    if (options?.thresholdMs) params.set('threshold_ms', String(options.thresholdMs));
    if (options?.limit) params.set('limit', String(options.limit));

    const response = await this.makeRequest<{ traces: TelemetryTrace[] }>(
      `/api/v1/traces/slow?${params.toString()}`
    );
    return response.traces;
  }

  /**
   * Get error traces
   */
  async getErrorTraces(options?: {
    since?: string;
    limit?: number;
  }): Promise<TelemetryTrace[]> {
    const params = new URLSearchParams();
    if (options?.since) params.set('since', options.since);
    if (options?.limit) params.set('limit', String(options.limit));

    const response = await this.makeRequest<{ traces: TelemetryTrace[] }>(
      `/api/v1/traces/errors?${params.toString()}`
    );
    return response.traces;
  }

  /**
   * Get service dependency map
   */
  async getServiceMap(): Promise<{
    services: Array<{
      name: string;
      type: string;
      requestCount: number;
      errorRate: number;
      avgLatencyMs: number;
    }>;
    edges: Array<{
      from: string;
      to: string;
      requestCount: number;
      avgLatencyMs: number;
    }>;
  }> {
    return this.makeRequest('/api/v1/services/map');
  }

  // --------------------------------------------------------------------------
  // Streaming / Polling
  // --------------------------------------------------------------------------

  /**
   * Start listening for real-time traces and events
   */
  startListening(intervalMs: number = 5000): void {
    if (this.isListening) return;
    this.isListening = true;
    this.pollUpdates(intervalMs);
  }

  /**
   * Stop listening for updates
   */
  stopListening(): void {
    this.isListening = false;
  }

  private async pollUpdates(intervalMs: number): Promise<void> {
    let lastTraceTime: string | undefined;
    let lastEventTime: string | undefined;

    while (this.isListening) {
      try {
        // Fetch recent traces
        const traces = await this.searchTraces({
          startTime: lastTraceTime,
          limit: 50,
        });

        for (const trace of traces) {
          lastTraceTime = trace.endTime;
          for (const handler of this.traceHandlers) {
            await handler(trace);
          }
        }

        // Fetch recent events
        const events = await this.fetchEvents({
          since: lastEventTime,
          limit: 100,
        });

        for (const event of events) {
          lastEventTime = event.timestamp;
          for (const handler of this.eventHandlers) {
            await handler(event);
          }
        }
      } catch (error) {
        console.error('[ObservatoryAdapter] Poll error:', error);
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
        throw new Error(`Observatory API error: ${response.status} ${response.statusText}`);
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

export function createObservatoryAdapter(config: ObservatoryConfig): ObservatoryAdapter {
  return new ObservatoryAdapter(config);
}
