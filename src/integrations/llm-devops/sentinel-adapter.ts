/**
 * LLM-Sentinel Adapter
 * Thin runtime consumer for anomaly events and drift signals
 *
 * @module integrations/llm-devops/sentinel-adapter
 * @see https://github.com/LLM-Dev-Ops/sentinel
 */

// ============================================================================
// Types
// ============================================================================

export interface SentinelConfig {
  /** API endpoint for Sentinel service */
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

export interface AnomalyEvent {
  /** Unique anomaly identifier */
  anomalyId: string;
  /** Detection timestamp */
  detectedAt: string;
  /** Anomaly type */
  type: AnomalyType;
  /** Severity level */
  severity: 'info' | 'warning' | 'error' | 'critical';
  /** Affected model identifier */
  modelId: string;
  /** Provider name */
  provider: string;
  /** Human-readable description */
  description: string;
  /** Metric that triggered the anomaly */
  metric: string;
  /** Observed value */
  observedValue: number;
  /** Expected/baseline value */
  expectedValue: number;
  /** Threshold that was breached */
  threshold: number;
  /** Deviation from expected (percentage) */
  deviationPercent: number;
  /** Is this anomaly still active */
  isActive: boolean;
  /** Resolution timestamp if resolved */
  resolvedAt?: string;
  /** Additional context data */
  context?: Record<string, unknown>;
}

export type AnomalyType =
  | 'latency_spike'
  | 'error_rate_increase'
  | 'throughput_drop'
  | 'cost_anomaly'
  | 'quality_degradation'
  | 'availability_issue'
  | 'rate_limit_approach'
  | 'token_usage_spike'
  | 'response_size_anomaly'
  | 'custom';

export interface DriftSignal {
  /** Drift signal identifier */
  driftId: string;
  /** Detection timestamp */
  detectedAt: string;
  /** Drift type */
  type: DriftType;
  /** Affected model identifier */
  modelId: string;
  /** Provider name */
  provider: string;
  /** Drift magnitude (0-1 scale) */
  magnitude: number;
  /** Statistical significance (p-value) */
  pValue: number;
  /** Confidence score (0-1) */
  confidence: number;
  /** Comparison baseline period */
  baselinePeriod: {
    start: string;
    end: string;
  };
  /** Current observation period */
  observationPeriod: {
    start: string;
    end: string;
  };
  /** Affected metrics */
  affectedMetrics: string[];
  /** Recommended action */
  recommendation?: string;
}

export type DriftType =
  | 'performance_drift'
  | 'quality_drift'
  | 'cost_drift'
  | 'behavior_drift'
  | 'distribution_drift'
  | 'concept_drift';

export interface SentinelAlert {
  /** Alert identifier */
  alertId: string;
  /** Alert creation timestamp */
  createdAt: string;
  /** Alert type */
  type: 'anomaly' | 'drift' | 'threshold' | 'pattern';
  /** Alert severity */
  severity: 'info' | 'warning' | 'error' | 'critical';
  /** Alert title */
  title: string;
  /** Alert description */
  description: string;
  /** Affected resources */
  affectedResources: string[];
  /** Is alert acknowledged */
  acknowledged: boolean;
  /** Acknowledgement timestamp */
  acknowledgedAt?: string;
  /** Related anomaly or drift IDs */
  relatedIds: string[];
}

export interface HealthStatus {
  /** Overall system health */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Individual model health */
  models: Array<{
    modelId: string;
    provider: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    activeAnomalies: number;
    activeDrifts: number;
    lastChecked: string;
  }>;
  /** Active alert count by severity */
  alertCounts: Record<string, number>;
}

export type AnomalyEventHandler = (event: AnomalyEvent) => void | Promise<void>;
export type DriftSignalHandler = (signal: DriftSignal) => void | Promise<void>;
export type AlertHandler = (alert: SentinelAlert) => void | Promise<void>;

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Partial<SentinelConfig> = {
  timeout: 30000,
  enableRetry: true,
  maxRetries: 3,
};

// ============================================================================
// Sentinel Adapter
// ============================================================================

/**
 * Thin adapter for consuming anomaly events and drift signals from LLM-Sentinel
 */
export class SentinelAdapter {
  private config: Required<SentinelConfig>;
  private anomalyHandlers: Set<AnomalyEventHandler> = new Set();
  private driftHandlers: Set<DriftSignalHandler> = new Set();
  private alertHandlers: Set<AlertHandler> = new Set();
  private isListening: boolean = false;

  constructor(config: SentinelConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as Required<SentinelConfig>;
  }

  // --------------------------------------------------------------------------
  // Event Subscription
  // --------------------------------------------------------------------------

  /**
   * Subscribe to anomaly events
   */
  onAnomalyEvent(handler: AnomalyEventHandler): () => void {
    this.anomalyHandlers.add(handler);
    return () => this.anomalyHandlers.delete(handler);
  }

  /**
   * Subscribe to drift signals
   */
  onDriftSignal(handler: DriftSignalHandler): () => void {
    this.driftHandlers.add(handler);
    return () => this.driftHandlers.delete(handler);
  }

  /**
   * Subscribe to alerts
   */
  onAlert(handler: AlertHandler): () => void {
    this.alertHandlers.add(handler);
    return () => this.alertHandlers.delete(handler);
  }

  // --------------------------------------------------------------------------
  // Data Consumption
  // --------------------------------------------------------------------------

  /**
   * Fetch recent anomaly events
   */
  async fetchAnomalies(options?: {
    type?: AnomalyType;
    severity?: AnomalyEvent['severity'];
    modelId?: string;
    activeOnly?: boolean;
    since?: string;
    limit?: number;
  }): Promise<AnomalyEvent[]> {
    const params = new URLSearchParams();
    if (options?.type) params.set('type', options.type);
    if (options?.severity) params.set('severity', options.severity);
    if (options?.modelId) params.set('model_id', options.modelId);
    if (options?.activeOnly) params.set('active_only', 'true');
    if (options?.since) params.set('since', options.since);
    if (options?.limit) params.set('limit', String(options.limit));

    const response = await this.makeRequest<{ anomalies: AnomalyEvent[] }>(
      `/api/v1/anomalies?${params.toString()}`
    );
    return response.anomalies;
  }

  /**
   * Fetch drift signals
   */
  async fetchDriftSignals(options?: {
    type?: DriftType;
    modelId?: string;
    minMagnitude?: number;
    since?: string;
    limit?: number;
  }): Promise<DriftSignal[]> {
    const params = new URLSearchParams();
    if (options?.type) params.set('type', options.type);
    if (options?.modelId) params.set('model_id', options.modelId);
    if (options?.minMagnitude) params.set('min_magnitude', String(options.minMagnitude));
    if (options?.since) params.set('since', options.since);
    if (options?.limit) params.set('limit', String(options.limit));

    const response = await this.makeRequest<{ drifts: DriftSignal[] }>(
      `/api/v1/drifts?${params.toString()}`
    );
    return response.drifts;
  }

  /**
   * Fetch alerts
   */
  async fetchAlerts(options?: {
    severity?: SentinelAlert['severity'];
    unacknowledgedOnly?: boolean;
    since?: string;
    limit?: number;
  }): Promise<SentinelAlert[]> {
    const params = new URLSearchParams();
    if (options?.severity) params.set('severity', options.severity);
    if (options?.unacknowledgedOnly) params.set('unacknowledged_only', 'true');
    if (options?.since) params.set('since', options.since);
    if (options?.limit) params.set('limit', String(options.limit));

    const response = await this.makeRequest<{ alerts: SentinelAlert[] }>(
      `/api/v1/alerts?${params.toString()}`
    );
    return response.alerts;
  }

  /**
   * Get current health status
   */
  async getHealthStatus(): Promise<HealthStatus> {
    return this.makeRequest<HealthStatus>('/api/v1/health');
  }

  /**
   * Get anomaly details by ID
   */
  async getAnomalyDetails(anomalyId: string): Promise<AnomalyEvent & {
    history: Array<{ timestamp: string; value: number }>;
    correlatedAnomalies: string[];
  }> {
    return this.makeRequest(`/api/v1/anomalies/${encodeURIComponent(anomalyId)}`);
  }

  /**
   * Get drift signal details by ID
   */
  async getDriftDetails(driftId: string): Promise<DriftSignal & {
    baselineStats: Record<string, number>;
    currentStats: Record<string, number>;
    statisticalTests: Array<{ test: string; result: number; significant: boolean }>;
  }> {
    return this.makeRequest(`/api/v1/drifts/${encodeURIComponent(driftId)}`);
  }

  // --------------------------------------------------------------------------
  // Streaming / Polling
  // --------------------------------------------------------------------------

  /**
   * Start listening for real-time anomaly and drift events
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
    let lastAnomalyTimestamp: string | undefined;
    let lastDriftTimestamp: string | undefined;
    let lastAlertTimestamp: string | undefined;

    while (this.isListening) {
      try {
        // Fetch anomalies
        const anomalies = await this.fetchAnomalies({
          since: lastAnomalyTimestamp,
          limit: 50,
        });

        for (const anomaly of anomalies) {
          lastAnomalyTimestamp = anomaly.detectedAt;
          for (const handler of this.anomalyHandlers) {
            await handler(anomaly);
          }
        }

        // Fetch drift signals
        const drifts = await this.fetchDriftSignals({
          since: lastDriftTimestamp,
          limit: 20,
        });

        for (const drift of drifts) {
          lastDriftTimestamp = drift.detectedAt;
          for (const handler of this.driftHandlers) {
            await handler(drift);
          }
        }

        // Fetch alerts
        const alerts = await this.fetchAlerts({
          since: lastAlertTimestamp,
          unacknowledgedOnly: true,
          limit: 20,
        });

        for (const alert of alerts) {
          lastAlertTimestamp = alert.createdAt;
          for (const handler of this.alertHandlers) {
            await handler(alert);
          }
        }
      } catch (error) {
        console.error('[SentinelAdapter] Poll error:', error);
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
        throw new Error(`Sentinel API error: ${response.status} ${response.statusText}`);
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

export function createSentinelAdapter(config: SentinelConfig): SentinelAdapter {
  return new SentinelAdapter(config);
}
