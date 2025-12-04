/**
 * LLM-Latency-Lens Adapter
 * Thin runtime consumer for latency profiles and throughput statistics
 *
 * @module integrations/llm-devops/latency-lens-adapter
 * @see https://github.com/LLM-Dev-Ops/latency-lens
 */

// ============================================================================
// Types
// ============================================================================

export interface LatencyLensConfig {
  /** API endpoint for Latency-Lens service */
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

export interface LatencyProfile {
  /** Profile identifier */
  profileId: string;
  /** Model identifier */
  modelId: string;
  /** Provider name */
  provider: string;
  /** Measurement timestamp */
  timestamp: string;
  /** P50 latency in milliseconds */
  p50Ms: number;
  /** P90 latency in milliseconds */
  p90Ms: number;
  /** P95 latency in milliseconds */
  p95Ms: number;
  /** P99 latency in milliseconds */
  p99Ms: number;
  /** Mean latency in milliseconds */
  meanMs: number;
  /** Standard deviation */
  stdDevMs: number;
  /** Sample count */
  sampleCount: number;
  /** Time to first token (if streaming) */
  ttftMs?: number;
  /** Tokens per second throughput */
  tokensPerSecond?: number;
}

export interface ThroughputStats {
  /** Stats identifier */
  statsId: string;
  /** Model identifier */
  modelId: string;
  /** Provider name */
  provider: string;
  /** Time window start */
  windowStart: string;
  /** Time window end */
  windowEnd: string;
  /** Requests per second */
  requestsPerSecond: number;
  /** Tokens per second (input) */
  inputTokensPerSecond: number;
  /** Tokens per second (output) */
  outputTokensPerSecond: number;
  /** Total requests in window */
  totalRequests: number;
  /** Successful requests */
  successfulRequests: number;
  /** Failed requests */
  failedRequests: number;
  /** Error rate (0-1) */
  errorRate: number;
}

export interface LatencyBreakdown {
  /** Breakdown identifier */
  breakdownId: string;
  /** Model identifier */
  modelId: string;
  /** Total request latency */
  totalMs: number;
  /** Network round-trip time */
  networkMs: number;
  /** Queue/waiting time */
  queueMs: number;
  /** Inference processing time */
  inferenceMs: number;
  /** Token generation time */
  tokenGenMs: number;
  /** Overhead/other time */
  overheadMs: number;
}

export interface LatencyAnomaly {
  /** Anomaly identifier */
  anomalyId: string;
  /** Model identifier */
  modelId: string;
  /** Provider name */
  provider: string;
  /** Detection timestamp */
  detectedAt: string;
  /** Anomaly type */
  type: 'spike' | 'degradation' | 'timeout_increase' | 'variance_change';
  /** Severity level */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Observed value */
  observedValue: number;
  /** Expected baseline value */
  baselineValue: number;
  /** Deviation percentage */
  deviationPercent: number;
  /** Additional context */
  context?: Record<string, unknown>;
}

export type LatencyProfileHandler = (profile: LatencyProfile) => void | Promise<void>;
export type ThroughputHandler = (stats: ThroughputStats) => void | Promise<void>;
export type LatencyAnomalyHandler = (anomaly: LatencyAnomaly) => void | Promise<void>;

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Partial<LatencyLensConfig> = {
  timeout: 30000,
  enableRetry: true,
  maxRetries: 3,
};

// ============================================================================
// Latency-Lens Adapter
// ============================================================================

/**
 * Thin adapter for consuming latency profiles and throughput stats from LLM-Latency-Lens
 */
export class LatencyLensAdapter {
  private config: Required<LatencyLensConfig>;
  private profileHandlers: Set<LatencyProfileHandler> = new Set();
  private throughputHandlers: Set<ThroughputHandler> = new Set();
  private anomalyHandlers: Set<LatencyAnomalyHandler> = new Set();
  private isListening: boolean = false;

  constructor(config: LatencyLensConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as Required<LatencyLensConfig>;
  }

  // --------------------------------------------------------------------------
  // Event Subscription
  // --------------------------------------------------------------------------

  /**
   * Subscribe to latency profile updates
   */
  onLatencyProfile(handler: LatencyProfileHandler): () => void {
    this.profileHandlers.add(handler);
    return () => this.profileHandlers.delete(handler);
  }

  /**
   * Subscribe to throughput statistics updates
   */
  onThroughputStats(handler: ThroughputHandler): () => void {
    this.throughputHandlers.add(handler);
    return () => this.throughputHandlers.delete(handler);
  }

  /**
   * Subscribe to latency anomaly alerts
   */
  onLatencyAnomaly(handler: LatencyAnomalyHandler): () => void {
    this.anomalyHandlers.add(handler);
    return () => this.anomalyHandlers.delete(handler);
  }

  // --------------------------------------------------------------------------
  // Data Consumption
  // --------------------------------------------------------------------------

  /**
   * Fetch latency profiles for specified models
   */
  async fetchLatencyProfiles(options?: {
    modelIds?: string[];
    providers?: string[];
    since?: string;
    limit?: number;
  }): Promise<LatencyProfile[]> {
    const params = new URLSearchParams();
    if (options?.modelIds) params.set('model_ids', options.modelIds.join(','));
    if (options?.providers) params.set('providers', options.providers.join(','));
    if (options?.since) params.set('since', options.since);
    if (options?.limit) params.set('limit', String(options.limit));

    const response = await this.makeRequest<{ profiles: LatencyProfile[] }>(
      `/api/v1/profiles?${params.toString()}`
    );
    return response.profiles;
  }

  /**
   * Fetch throughput statistics
   */
  async fetchThroughputStats(options?: {
    modelIds?: string[];
    windowMinutes?: number;
  }): Promise<ThroughputStats[]> {
    const params = new URLSearchParams();
    if (options?.modelIds) params.set('model_ids', options.modelIds.join(','));
    if (options?.windowMinutes) params.set('window_minutes', String(options.windowMinutes));

    const response = await this.makeRequest<{ stats: ThroughputStats[] }>(
      `/api/v1/throughput?${params.toString()}`
    );
    return response.stats;
  }

  /**
   * Fetch latency breakdown for a specific request
   */
  async fetchLatencyBreakdown(requestId: string): Promise<LatencyBreakdown> {
    return this.makeRequest<LatencyBreakdown>(
      `/api/v1/breakdown/${encodeURIComponent(requestId)}`
    );
  }

  /**
   * Fetch recent latency anomalies
   */
  async fetchAnomalies(options?: {
    severity?: LatencyAnomaly['severity'];
    type?: LatencyAnomaly['type'];
    since?: string;
    limit?: number;
  }): Promise<LatencyAnomaly[]> {
    const params = new URLSearchParams();
    if (options?.severity) params.set('severity', options.severity);
    if (options?.type) params.set('type', options.type);
    if (options?.since) params.set('since', options.since);
    if (options?.limit) params.set('limit', String(options.limit));

    const response = await this.makeRequest<{ anomalies: LatencyAnomaly[] }>(
      `/api/v1/anomalies?${params.toString()}`
    );
    return response.anomalies;
  }

  /**
   * Get current latency summary for all models
   */
  async getCurrentSummary(): Promise<{
    models: Array<{
      modelId: string;
      provider: string;
      currentP50Ms: number;
      currentP99Ms: number;
      status: 'healthy' | 'degraded' | 'critical';
    }>;
  }> {
    return this.makeRequest('/api/v1/summary/current');
  }

  /**
   * Compare latency between two models
   */
  async compareModels(modelA: string, modelB: string): Promise<{
    modelA: LatencyProfile;
    modelB: LatencyProfile;
    comparison: {
      p50Diff: number;
      p99Diff: number;
      throughputDiff: number;
      recommendation: string;
    };
  }> {
    return this.makeRequest(
      `/api/v1/compare?model_a=${encodeURIComponent(modelA)}&model_b=${encodeURIComponent(modelB)}`
    );
  }

  // --------------------------------------------------------------------------
  // Streaming / Polling
  // --------------------------------------------------------------------------

  /**
   * Start listening for real-time latency updates
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
    let lastProfileTimestamp: string | undefined;
    let lastAnomalyTimestamp: string | undefined;

    while (this.isListening) {
      try {
        // Fetch profiles
        const profiles = await this.fetchLatencyProfiles({
          since: lastProfileTimestamp,
          limit: 50,
        });

        for (const profile of profiles) {
          lastProfileTimestamp = profile.timestamp;
          for (const handler of this.profileHandlers) {
            await handler(profile);
          }
        }

        // Fetch throughput stats
        const stats = await this.fetchThroughputStats({ windowMinutes: 1 });
        for (const stat of stats) {
          for (const handler of this.throughputHandlers) {
            await handler(stat);
          }
        }

        // Fetch anomalies
        const anomalies = await this.fetchAnomalies({
          since: lastAnomalyTimestamp,
          limit: 20,
        });

        for (const anomaly of anomalies) {
          lastAnomalyTimestamp = anomaly.detectedAt;
          for (const handler of this.anomalyHandlers) {
            await handler(anomaly);
          }
        }
      } catch (error) {
        console.error('[LatencyLensAdapter] Poll error:', error);
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
        throw new Error(`LatencyLens API error: ${response.status} ${response.statusText}`);
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

export function createLatencyLensAdapter(config: LatencyLensConfig): LatencyLensAdapter {
  return new LatencyLensAdapter(config);
}
