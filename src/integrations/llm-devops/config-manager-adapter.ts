/**
 * LLM-Config-Manager Adapter
 * Thin runtime consumer for optimization thresholds, routing configs, and model availability settings
 *
 * @module integrations/llm-devops/config-manager-adapter
 * @see https://github.com/LLM-Dev-Ops/config-manager
 */

// ============================================================================
// Types
// ============================================================================

export interface ConfigManagerConfig {
  /** API endpoint for Config-Manager service */
  apiBaseUrl: string;
  /** Authentication token */
  apiKey: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Enable automatic retry on transient failures */
  enableRetry?: boolean;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Enable local caching of configurations */
  enableCache?: boolean;
  /** Cache TTL in milliseconds */
  cacheTtlMs?: number;
}

export interface OptimizationThresholds {
  /** Configuration version */
  version: string;
  /** Last updated timestamp */
  updatedAt: string;
  /** Latency thresholds */
  latency: {
    /** P50 target (ms) */
    p50TargetMs: number;
    /** P99 max (ms) */
    p99MaxMs: number;
    /** Degradation threshold (ms) */
    degradationThresholdMs: number;
    /** Critical threshold (ms) */
    criticalThresholdMs: number;
  };
  /** Cost thresholds */
  cost: {
    /** Max cost per request (USD) */
    maxCostPerRequest: number;
    /** Hourly budget (USD) */
    hourlyBudget: number;
    /** Daily budget (USD) */
    dailyBudget: number;
    /** Cost alert threshold (percentage of budget) */
    alertThreshold: number;
  };
  /** Error rate thresholds */
  errorRate: {
    /** Warning threshold (0-1) */
    warningThreshold: number;
    /** Critical threshold (0-1) */
    criticalThreshold: number;
    /** Circuit breaker threshold (0-1) */
    circuitBreakerThreshold: number;
  };
  /** Quality thresholds */
  quality: {
    /** Minimum quality score (0-1) */
    minQualityScore: number;
    /** Quality degradation threshold */
    degradationThreshold: number;
  };
  /** Token limits */
  tokens: {
    /** Max input tokens */
    maxInputTokens: number;
    /** Max output tokens */
    maxOutputTokens: number;
    /** Total token limit per request */
    maxTotalTokens: number;
  };
}

export interface RoutingConfig {
  /** Configuration version */
  version: string;
  /** Last updated timestamp */
  updatedAt: string;
  /** Default model for routing */
  defaultModel: string;
  /** Fallback chain */
  fallbackChain: string[];
  /** Routing rules */
  rules: RoutingRule[];
  /** Load balancing configuration */
  loadBalancing: {
    /** Strategy type */
    strategy: 'round_robin' | 'weighted' | 'least_latency' | 'least_cost' | 'adaptive';
    /** Model weights (for weighted strategy) */
    weights?: Record<string, number>;
  };
  /** Geographic routing */
  geoRouting?: {
    enabled: boolean;
    regions: Record<string, string[]>; // region -> model IDs
  };
}

export interface RoutingRule {
  /** Rule identifier */
  ruleId: string;
  /** Rule name */
  name: string;
  /** Rule priority (lower = higher priority) */
  priority: number;
  /** Is rule enabled */
  enabled: boolean;
  /** Matching conditions */
  conditions: RuleCondition[];
  /** Target model(s) */
  targetModels: string[];
  /** Rule action */
  action: 'route' | 'block' | 'redirect' | 'fallback';
}

export interface RuleCondition {
  /** Condition field */
  field: string;
  /** Comparison operator */
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'regex' | 'in';
  /** Condition value */
  value: string | number | string[];
}

export interface ModelAvailability {
  /** Model identifier */
  modelId: string;
  /** Provider name */
  provider: string;
  /** Is model available */
  available: boolean;
  /** Availability status */
  status: 'online' | 'degraded' | 'offline' | 'maintenance';
  /** Status reason */
  statusReason?: string;
  /** Last health check timestamp */
  lastChecked: string;
  /** Health check interval (seconds) */
  healthCheckInterval: number;
  /** Current capacity (0-1) */
  capacity: number;
  /** Rate limit info */
  rateLimit: {
    requestsPerMinute: number;
    tokensPerMinute: number;
    currentUsage: number;
  };
  /** Supported features */
  features: string[];
  /** Model capabilities */
  capabilities: {
    streaming: boolean;
    functionCalling: boolean;
    vision: boolean;
    maxContextLength: number;
  };
}

export interface ConfigChange {
  /** Change identifier */
  changeId: string;
  /** Change timestamp */
  timestamp: string;
  /** Change type */
  type: 'thresholds' | 'routing' | 'availability' | 'feature_flag';
  /** Changed key path */
  keyPath: string;
  /** Previous value */
  previousValue: unknown;
  /** New value */
  newValue: unknown;
  /** Change source */
  source: 'api' | 'ui' | 'automation' | 'sync';
  /** Change author */
  author?: string;
  /** Change reason */
  reason?: string;
}

export type ThresholdChangeHandler = (thresholds: OptimizationThresholds) => void | Promise<void>;
export type RoutingChangeHandler = (config: RoutingConfig) => void | Promise<void>;
export type AvailabilityChangeHandler = (models: ModelAvailability[]) => void | Promise<void>;
export type ConfigChangeHandler = (change: ConfigChange) => void | Promise<void>;

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Partial<ConfigManagerConfig> = {
  timeout: 30000,
  enableRetry: true,
  maxRetries: 3,
  enableCache: true,
  cacheTtlMs: 60000, // 1 minute
};

// ============================================================================
// Config-Manager Adapter
// ============================================================================

/**
 * Thin adapter for consuming optimization thresholds, routing configs, and model availability from LLM-Config-Manager
 */
export class ConfigManagerAdapter {
  private config: Required<ConfigManagerConfig>;
  private thresholdHandlers: Set<ThresholdChangeHandler> = new Set();
  private routingHandlers: Set<RoutingChangeHandler> = new Set();
  private availabilityHandlers: Set<AvailabilityChangeHandler> = new Set();
  private changeHandlers: Set<ConfigChangeHandler> = new Set();
  private isListening: boolean = false;

  // Local cache
  private cache: {
    thresholds?: { data: OptimizationThresholds; expiry: number };
    routing?: { data: RoutingConfig; expiry: number };
    availability?: { data: ModelAvailability[]; expiry: number };
  } = {};

  constructor(config: ConfigManagerConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as Required<ConfigManagerConfig>;
  }

  // --------------------------------------------------------------------------
  // Event Subscription
  // --------------------------------------------------------------------------

  /**
   * Subscribe to threshold configuration changes
   */
  onThresholdChange(handler: ThresholdChangeHandler): () => void {
    this.thresholdHandlers.add(handler);
    return () => this.thresholdHandlers.delete(handler);
  }

  /**
   * Subscribe to routing configuration changes
   */
  onRoutingChange(handler: RoutingChangeHandler): () => void {
    this.routingHandlers.add(handler);
    return () => this.routingHandlers.delete(handler);
  }

  /**
   * Subscribe to model availability changes
   */
  onAvailabilityChange(handler: AvailabilityChangeHandler): () => void {
    this.availabilityHandlers.add(handler);
    return () => this.availabilityHandlers.delete(handler);
  }

  /**
   * Subscribe to all configuration changes
   */
  onConfigChange(handler: ConfigChangeHandler): () => void {
    this.changeHandlers.add(handler);
    return () => this.changeHandlers.delete(handler);
  }

  // --------------------------------------------------------------------------
  // Data Consumption
  // --------------------------------------------------------------------------

  /**
   * Get current optimization thresholds
   */
  async getThresholds(options?: { bypassCache?: boolean }): Promise<OptimizationThresholds> {
    if (this.config.enableCache && !options?.bypassCache) {
      const cached = this.cache.thresholds;
      if (cached && Date.now() < cached.expiry) {
        return cached.data;
      }
    }

    const thresholds = await this.makeRequest<OptimizationThresholds>('/api/v1/config/thresholds');

    if (this.config.enableCache) {
      this.cache.thresholds = {
        data: thresholds,
        expiry: Date.now() + this.config.cacheTtlMs,
      };
    }

    return thresholds;
  }

  /**
   * Get current routing configuration
   */
  async getRoutingConfig(options?: { bypassCache?: boolean }): Promise<RoutingConfig> {
    if (this.config.enableCache && !options?.bypassCache) {
      const cached = this.cache.routing;
      if (cached && Date.now() < cached.expiry) {
        return cached.data;
      }
    }

    const routing = await this.makeRequest<RoutingConfig>('/api/v1/config/routing');

    if (this.config.enableCache) {
      this.cache.routing = {
        data: routing,
        expiry: Date.now() + this.config.cacheTtlMs,
      };
    }

    return routing;
  }

  /**
   * Get model availability status
   */
  async getModelAvailability(options?: {
    modelIds?: string[];
    providers?: string[];
    availableOnly?: boolean;
    bypassCache?: boolean;
  }): Promise<ModelAvailability[]> {
    if (this.config.enableCache && !options?.bypassCache && !options?.modelIds && !options?.providers) {
      const cached = this.cache.availability;
      if (cached && Date.now() < cached.expiry) {
        let result = cached.data;
        if (options?.availableOnly) {
          result = result.filter(m => m.available);
        }
        return result;
      }
    }

    const params = new URLSearchParams();
    if (options?.modelIds) params.set('model_ids', options.modelIds.join(','));
    if (options?.providers) params.set('providers', options.providers.join(','));
    if (options?.availableOnly) params.set('available_only', 'true');

    const response = await this.makeRequest<{ models: ModelAvailability[] }>(
      `/api/v1/models/availability?${params.toString()}`
    );

    if (this.config.enableCache && !options?.modelIds && !options?.providers) {
      this.cache.availability = {
        data: response.models,
        expiry: Date.now() + this.config.cacheTtlMs,
      };
    }

    return response.models;
  }

  /**
   * Get specific model availability
   */
  async getModelStatus(modelId: string): Promise<ModelAvailability> {
    return this.makeRequest<ModelAvailability>(
      `/api/v1/models/${encodeURIComponent(modelId)}/status`
    );
  }

  /**
   * Get configuration change history
   */
  async getConfigHistory(options?: {
    type?: ConfigChange['type'];
    since?: string;
    limit?: number;
  }): Promise<ConfigChange[]> {
    const params = new URLSearchParams();
    if (options?.type) params.set('type', options.type);
    if (options?.since) params.set('since', options.since);
    if (options?.limit) params.set('limit', String(options.limit));

    const response = await this.makeRequest<{ changes: ConfigChange[] }>(
      `/api/v1/config/history?${params.toString()}`
    );
    return response.changes;
  }

  /**
   * Get feature flags
   */
  async getFeatureFlags(): Promise<Record<string, boolean>> {
    return this.makeRequest<Record<string, boolean>>('/api/v1/config/features');
  }

  /**
   * Check if a specific feature is enabled
   */
  async isFeatureEnabled(feature: string): Promise<boolean> {
    const flags = await this.getFeatureFlags();
    return flags[feature] ?? false;
  }

  /**
   * Invalidate local cache
   */
  invalidateCache(type?: 'thresholds' | 'routing' | 'availability'): void {
    if (type) {
      delete this.cache[type];
    } else {
      this.cache = {};
    }
  }

  // --------------------------------------------------------------------------
  // Streaming / Polling
  // --------------------------------------------------------------------------

  /**
   * Start listening for configuration changes
   */
  startListening(intervalMs: number = 10000): void {
    if (this.isListening) return;
    this.isListening = true;
    this.pollChanges(intervalMs);
  }

  /**
   * Stop listening for changes
   */
  stopListening(): void {
    this.isListening = false;
  }

  private async pollChanges(intervalMs: number): Promise<void> {
    let lastThresholdVersion: string | undefined;
    let lastRoutingVersion: string | undefined;
    let lastChangeTimestamp: string | undefined;

    while (this.isListening) {
      try {
        // Check thresholds
        const thresholds = await this.getThresholds({ bypassCache: true });
        if (lastThresholdVersion && thresholds.version !== lastThresholdVersion) {
          for (const handler of this.thresholdHandlers) {
            await handler(thresholds);
          }
        }
        lastThresholdVersion = thresholds.version;

        // Check routing config
        const routing = await this.getRoutingConfig({ bypassCache: true });
        if (lastRoutingVersion && routing.version !== lastRoutingVersion) {
          for (const handler of this.routingHandlers) {
            await handler(routing);
          }
        }
        lastRoutingVersion = routing.version;

        // Check availability
        const availability = await this.getModelAvailability({ bypassCache: true });
        for (const handler of this.availabilityHandlers) {
          await handler(availability);
        }

        // Check config changes
        const changes = await this.getConfigHistory({
          since: lastChangeTimestamp,
          limit: 20,
        });

        for (const change of changes) {
          lastChangeTimestamp = change.timestamp;
          for (const handler of this.changeHandlers) {
            await handler(change);
          }
        }
      } catch (error) {
        console.error('[ConfigManagerAdapter] Poll error:', error);
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
        throw new Error(`ConfigManager API error: ${response.status} ${response.statusText}`);
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

export function createConfigManagerAdapter(config: ConfigManagerConfig): ConfigManagerAdapter {
  return new ConfigManagerAdapter(config);
}
