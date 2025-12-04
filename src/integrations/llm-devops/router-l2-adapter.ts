/**
 * Router External L2 Module Adapter
 * Thin runtime consumer for external routing layer signals and decisions
 *
 * @module integrations/llm-devops/router-l2-adapter
 *
 * Note: This adapter interfaces with an external L2 routing module that provides
 * advanced routing decisions, load balancing signals, and traffic management.
 */

// ============================================================================
// Types
// ============================================================================

export interface RouterL2Config {
  /** API endpoint for Router L2 service */
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

export interface RoutingDecision {
  /** Decision identifier */
  decisionId: string;
  /** Decision timestamp */
  timestamp: string;
  /** Request identifier */
  requestId: string;
  /** Selected model */
  selectedModel: string;
  /** Selected provider */
  selectedProvider: string;
  /** Decision reason */
  reason: RoutingReason;
  /** Confidence score (0-1) */
  confidence: number;
  /** Alternative models considered */
  alternatives: Array<{
    modelId: string;
    provider: string;
    score: number;
    reason: string;
  }>;
  /** Routing metadata */
  metadata: {
    latencyEstimateMs: number;
    costEstimate: number;
    qualityScore: number;
    availabilityScore: number;
  };
}

export type RoutingReason =
  | 'lowest_latency'
  | 'lowest_cost'
  | 'highest_quality'
  | 'load_balanced'
  | 'geo_optimized'
  | 'fallback'
  | 'user_preference'
  | 'policy_enforced'
  | 'capacity_based'
  | 'experiment'
  | 'default';

export interface LoadBalancerSignal {
  /** Signal identifier */
  signalId: string;
  /** Signal timestamp */
  timestamp: string;
  /** Signal type */
  type: LoadBalancerSignalType;
  /** Affected models */
  affectedModels: string[];
  /** Signal severity */
  severity: 'info' | 'warning' | 'critical';
  /** Current load distribution */
  loadDistribution: Record<string, number>;
  /** Recommended action */
  recommendation?: {
    action: 'increase_weight' | 'decrease_weight' | 'disable' | 'enable' | 'redirect';
    targetModel: string;
    reason: string;
  };
}

export type LoadBalancerSignalType =
  | 'capacity_warning'
  | 'capacity_critical'
  | 'rebalance_suggested'
  | 'model_slow'
  | 'model_recovered'
  | 'traffic_spike'
  | 'traffic_normalized';

export interface TrafficStats {
  /** Stats identifier */
  statsId: string;
  /** Time window */
  window: {
    start: string;
    end: string;
  };
  /** Total requests */
  totalRequests: number;
  /** Requests per second */
  requestsPerSecond: number;
  /** Distribution by model */
  byModel: Record<string, {
    requests: number;
    percentage: number;
    avgLatencyMs: number;
    errorRate: number;
  }>;
  /** Distribution by provider */
  byProvider: Record<string, {
    requests: number;
    percentage: number;
  }>;
  /** Geographic distribution */
  byRegion?: Record<string, number>;
}

export interface RouterHealth {
  /** Overall health status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Last health check */
  lastCheck: string;
  /** Component health */
  components: {
    loadBalancer: 'up' | 'down' | 'degraded';
    decisionEngine: 'up' | 'down' | 'degraded';
    modelRegistry: 'up' | 'down' | 'degraded';
    metricsCollector: 'up' | 'down' | 'degraded';
  };
  /** Active connections */
  activeConnections: number;
  /** Queue depth */
  queueDepth: number;
  /** Error rate */
  errorRate: number;
}

export interface ModelWeight {
  /** Model identifier */
  modelId: string;
  /** Provider name */
  provider: string;
  /** Current weight (0-1) */
  weight: number;
  /** Effective weight after adjustments */
  effectiveWeight: number;
  /** Weight adjustments */
  adjustments: Array<{
    reason: string;
    delta: number;
    appliedAt: string;
  }>;
}

export type RoutingDecisionHandler = (decision: RoutingDecision) => void | Promise<void>;
export type LoadBalancerSignalHandler = (signal: LoadBalancerSignal) => void | Promise<void>;

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Partial<RouterL2Config> = {
  timeout: 30000,
  enableRetry: true,
  maxRetries: 3,
};

// ============================================================================
// Router L2 Adapter
// ============================================================================

/**
 * Thin adapter for consuming routing decisions and load balancer signals from external Router L2 module
 */
export class RouterL2Adapter {
  private config: Required<RouterL2Config>;
  private decisionHandlers: Set<RoutingDecisionHandler> = new Set();
  private signalHandlers: Set<LoadBalancerSignalHandler> = new Set();
  private isListening: boolean = false;

  constructor(config: RouterL2Config) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as Required<RouterL2Config>;
  }

  // --------------------------------------------------------------------------
  // Event Subscription
  // --------------------------------------------------------------------------

  /**
   * Subscribe to routing decisions
   */
  onRoutingDecision(handler: RoutingDecisionHandler): () => void {
    this.decisionHandlers.add(handler);
    return () => this.decisionHandlers.delete(handler);
  }

  /**
   * Subscribe to load balancer signals
   */
  onLoadBalancerSignal(handler: LoadBalancerSignalHandler): () => void {
    this.signalHandlers.add(handler);
    return () => this.signalHandlers.delete(handler);
  }

  // --------------------------------------------------------------------------
  // Data Consumption
  // --------------------------------------------------------------------------

  /**
   * Fetch recent routing decisions
   */
  async fetchRoutingDecisions(options?: {
    modelId?: string;
    reason?: RoutingReason;
    since?: string;
    limit?: number;
  }): Promise<RoutingDecision[]> {
    const params = new URLSearchParams();
    if (options?.modelId) params.set('model_id', options.modelId);
    if (options?.reason) params.set('reason', options.reason);
    if (options?.since) params.set('since', options.since);
    if (options?.limit) params.set('limit', String(options.limit));

    const response = await this.makeRequest<{ decisions: RoutingDecision[] }>(
      `/api/v1/routing/decisions?${params.toString()}`
    );
    return response.decisions;
  }

  /**
   * Fetch load balancer signals
   */
  async fetchLoadBalancerSignals(options?: {
    type?: LoadBalancerSignalType;
    severity?: LoadBalancerSignal['severity'];
    since?: string;
    limit?: number;
  }): Promise<LoadBalancerSignal[]> {
    const params = new URLSearchParams();
    if (options?.type) params.set('type', options.type);
    if (options?.severity) params.set('severity', options.severity);
    if (options?.since) params.set('since', options.since);
    if (options?.limit) params.set('limit', String(options.limit));

    const response = await this.makeRequest<{ signals: LoadBalancerSignal[] }>(
      `/api/v1/loadbalancer/signals?${params.toString()}`
    );
    return response.signals;
  }

  /**
   * Get current traffic statistics
   */
  async getTrafficStats(options?: {
    windowMinutes?: number;
  }): Promise<TrafficStats> {
    const params = new URLSearchParams();
    if (options?.windowMinutes) params.set('window_minutes', String(options.windowMinutes));

    return this.makeRequest<TrafficStats>(`/api/v1/traffic/stats?${params.toString()}`);
  }

  /**
   * Get router health status
   */
  async getRouterHealth(): Promise<RouterHealth> {
    return this.makeRequest<RouterHealth>('/api/v1/health');
  }

  /**
   * Get current model weights
   */
  async getModelWeights(): Promise<ModelWeight[]> {
    const response = await this.makeRequest<{ weights: ModelWeight[] }>('/api/v1/weights');
    return response.weights;
  }

  /**
   * Get routing decision for a specific request ID
   */
  async getDecision(requestId: string): Promise<RoutingDecision> {
    return this.makeRequest<RoutingDecision>(
      `/api/v1/routing/decisions/${encodeURIComponent(requestId)}`
    );
  }

  /**
   * Get routing statistics summary
   */
  async getRoutingSummary(options?: {
    windowMinutes?: number;
  }): Promise<{
    totalDecisions: number;
    byReason: Record<RoutingReason, number>;
    byModel: Record<string, number>;
    avgConfidence: number;
    fallbackRate: number;
  }> {
    const params = new URLSearchParams();
    if (options?.windowMinutes) params.set('window_minutes', String(options.windowMinutes));

    return this.makeRequest(`/api/v1/routing/summary?${params.toString()}`);
  }

  // --------------------------------------------------------------------------
  // Streaming / Polling
  // --------------------------------------------------------------------------

  /**
   * Start listening for real-time routing events
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
    let lastDecisionTimestamp: string | undefined;
    let lastSignalTimestamp: string | undefined;

    while (this.isListening) {
      try {
        // Fetch routing decisions
        const decisions = await this.fetchRoutingDecisions({
          since: lastDecisionTimestamp,
          limit: 50,
        });

        for (const decision of decisions) {
          lastDecisionTimestamp = decision.timestamp;
          for (const handler of this.decisionHandlers) {
            await handler(decision);
          }
        }

        // Fetch load balancer signals
        const signals = await this.fetchLoadBalancerSignals({
          since: lastSignalTimestamp,
          limit: 20,
        });

        for (const signal of signals) {
          lastSignalTimestamp = signal.timestamp;
          for (const handler of this.signalHandlers) {
            await handler(signal);
          }
        }
      } catch (error) {
        console.error('[RouterL2Adapter] Poll error:', error);
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
        throw new Error(`Router L2 API error: ${response.status} ${response.statusText}`);
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

export function createRouterL2Adapter(config: RouterL2Config): RouterL2Adapter {
  return new RouterL2Adapter(config);
}
