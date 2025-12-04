/**
 * LLM-Shield Adapter
 * Thin runtime consumer for policy-block events and PII detection signals
 *
 * @module integrations/llm-devops/shield-adapter
 * @see https://github.com/LLM-Dev-Ops/shield
 */

// ============================================================================
// Types
// ============================================================================

export interface ShieldConfig {
  /** API endpoint for Shield service */
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

export interface PolicyBlockEvent {
  /** Unique event identifier */
  eventId: string;
  /** Event timestamp */
  timestamp: string;
  /** Request identifier that was blocked */
  requestId: string;
  /** Policy that triggered the block */
  policyId: string;
  /** Policy name */
  policyName: string;
  /** Block reason */
  reason: PolicyBlockReason;
  /** Severity level */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Model that was targeted */
  modelId: string;
  /** Provider name */
  provider: string;
  /** Action taken */
  action: 'block' | 'warn' | 'redact' | 'modify';
  /** Content snippet (redacted) */
  contentSnippet?: string;
  /** User/client identifier */
  clientId?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export type PolicyBlockReason =
  | 'pii_detected'
  | 'content_policy_violation'
  | 'rate_limit_exceeded'
  | 'token_limit_exceeded'
  | 'blocked_pattern'
  | 'injection_attempt'
  | 'jailbreak_attempt'
  | 'unauthorized_model'
  | 'geo_restriction'
  | 'custom_rule';

export interface PIIDetectionSignal {
  /** Signal identifier */
  signalId: string;
  /** Detection timestamp */
  timestamp: string;
  /** Request identifier */
  requestId: string;
  /** Direction: input or output */
  direction: 'input' | 'output';
  /** PII types detected */
  piiTypes: PIIType[];
  /** Detection details */
  detections: PIIDetection[];
  /** Action taken */
  action: 'block' | 'redact' | 'warn' | 'log';
  /** Was content modified */
  contentModified: boolean;
  /** Model identifier */
  modelId: string;
  /** Provider name */
  provider: string;
  /** Risk score (0-1) */
  riskScore: number;
}

export type PIIType =
  | 'email'
  | 'phone_number'
  | 'ssn'
  | 'credit_card'
  | 'address'
  | 'name'
  | 'date_of_birth'
  | 'ip_address'
  | 'passport'
  | 'drivers_license'
  | 'bank_account'
  | 'medical_record'
  | 'biometric'
  | 'custom';

export interface PIIDetection {
  /** PII type detected */
  type: PIIType;
  /** Confidence score (0-1) */
  confidence: number;
  /** Character offset start */
  offsetStart: number;
  /** Character offset end */
  offsetEnd: number;
  /** Redacted value (masked) */
  redactedValue: string;
  /** Detection method */
  method: 'regex' | 'ml' | 'dictionary' | 'custom';
}

export interface PolicyStats {
  /** Policy identifier */
  policyId: string;
  /** Policy name */
  policyName: string;
  /** Time window */
  window: {
    start: string;
    end: string;
  };
  /** Total evaluations */
  totalEvaluations: number;
  /** Block count */
  blocks: number;
  /** Warning count */
  warnings: number;
  /** Redaction count */
  redactions: number;
  /** Block rate (0-1) */
  blockRate: number;
  /** Top block reasons */
  topReasons: Array<{ reason: PolicyBlockReason; count: number }>;
}

export interface PIIStats {
  /** Time window */
  window: {
    start: string;
    end: string;
  };
  /** Total scans */
  totalScans: number;
  /** Detections count */
  detections: number;
  /** Detection rate (0-1) */
  detectionRate: number;
  /** Detections by type */
  byType: Record<PIIType, number>;
  /** Detections by direction */
  byDirection: {
    input: number;
    output: number;
  };
  /** Average risk score */
  avgRiskScore: number;
}

export type PolicyBlockHandler = (event: PolicyBlockEvent) => void | Promise<void>;
export type PIIDetectionHandler = (signal: PIIDetectionSignal) => void | Promise<void>;

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Partial<ShieldConfig> = {
  timeout: 30000,
  enableRetry: true,
  maxRetries: 3,
};

// ============================================================================
// Shield Adapter
// ============================================================================

/**
 * Thin adapter for consuming policy-block events and PII detection signals from LLM-Shield
 */
export class ShieldAdapter {
  private config: Required<ShieldConfig>;
  private policyBlockHandlers: Set<PolicyBlockHandler> = new Set();
  private piiDetectionHandlers: Set<PIIDetectionHandler> = new Set();
  private isListening: boolean = false;

  constructor(config: ShieldConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as Required<ShieldConfig>;
  }

  // --------------------------------------------------------------------------
  // Event Subscription
  // --------------------------------------------------------------------------

  /**
   * Subscribe to policy block events
   */
  onPolicyBlock(handler: PolicyBlockHandler): () => void {
    this.policyBlockHandlers.add(handler);
    return () => this.policyBlockHandlers.delete(handler);
  }

  /**
   * Subscribe to PII detection signals
   */
  onPIIDetection(handler: PIIDetectionHandler): () => void {
    this.piiDetectionHandlers.add(handler);
    return () => this.piiDetectionHandlers.delete(handler);
  }

  // --------------------------------------------------------------------------
  // Data Consumption
  // --------------------------------------------------------------------------

  /**
   * Fetch recent policy block events
   */
  async fetchPolicyBlocks(options?: {
    policyId?: string;
    reason?: PolicyBlockReason;
    severity?: PolicyBlockEvent['severity'];
    modelId?: string;
    since?: string;
    limit?: number;
  }): Promise<PolicyBlockEvent[]> {
    const params = new URLSearchParams();
    if (options?.policyId) params.set('policy_id', options.policyId);
    if (options?.reason) params.set('reason', options.reason);
    if (options?.severity) params.set('severity', options.severity);
    if (options?.modelId) params.set('model_id', options.modelId);
    if (options?.since) params.set('since', options.since);
    if (options?.limit) params.set('limit', String(options.limit));

    const response = await this.makeRequest<{ events: PolicyBlockEvent[] }>(
      `/api/v1/policy/blocks?${params.toString()}`
    );
    return response.events;
  }

  /**
   * Fetch PII detection signals
   */
  async fetchPIIDetections(options?: {
    piiType?: PIIType;
    direction?: PIIDetectionSignal['direction'];
    minRiskScore?: number;
    modelId?: string;
    since?: string;
    limit?: number;
  }): Promise<PIIDetectionSignal[]> {
    const params = new URLSearchParams();
    if (options?.piiType) params.set('pii_type', options.piiType);
    if (options?.direction) params.set('direction', options.direction);
    if (options?.minRiskScore) params.set('min_risk_score', String(options.minRiskScore));
    if (options?.modelId) params.set('model_id', options.modelId);
    if (options?.since) params.set('since', options.since);
    if (options?.limit) params.set('limit', String(options.limit));

    const response = await this.makeRequest<{ signals: PIIDetectionSignal[] }>(
      `/api/v1/pii/detections?${params.toString()}`
    );
    return response.signals;
  }

  /**
   * Get policy statistics
   */
  async getPolicyStats(options?: {
    policyId?: string;
    windowHours?: number;
  }): Promise<PolicyStats[]> {
    const params = new URLSearchParams();
    if (options?.policyId) params.set('policy_id', options.policyId);
    if (options?.windowHours) params.set('window_hours', String(options.windowHours));

    const response = await this.makeRequest<{ stats: PolicyStats[] }>(
      `/api/v1/policy/stats?${params.toString()}`
    );
    return response.stats;
  }

  /**
   * Get PII detection statistics
   */
  async getPIIStats(options?: {
    windowHours?: number;
  }): Promise<PIIStats> {
    const params = new URLSearchParams();
    if (options?.windowHours) params.set('window_hours', String(options.windowHours));

    return this.makeRequest<PIIStats>(`/api/v1/pii/stats?${params.toString()}`);
  }

  /**
   * Get list of active policies
   */
  async getActivePolicies(): Promise<Array<{
    policyId: string;
    name: string;
    description: string;
    enabled: boolean;
    priority: number;
    conditions: Record<string, unknown>;
    actions: string[];
  }>> {
    const response = await this.makeRequest<{
      policies: Array<{
        policyId: string;
        name: string;
        description: string;
        enabled: boolean;
        priority: number;
        conditions: Record<string, unknown>;
        actions: string[];
      }>;
    }>('/api/v1/policies/active');
    return response.policies;
  }

  /**
   * Get current protection status
   */
  async getProtectionStatus(): Promise<{
    status: 'active' | 'degraded' | 'inactive';
    activePolicies: number;
    piiScanningEnabled: boolean;
    lastEventAt: string;
    stats24h: {
      totalRequests: number;
      blockedRequests: number;
      piiDetections: number;
    };
  }> {
    return this.makeRequest('/api/v1/status');
  }

  // --------------------------------------------------------------------------
  // Streaming / Polling
  // --------------------------------------------------------------------------

  /**
   * Start listening for real-time shield events
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
    let lastBlockTimestamp: string | undefined;
    let lastPIITimestamp: string | undefined;

    while (this.isListening) {
      try {
        // Fetch policy blocks
        const blocks = await this.fetchPolicyBlocks({
          since: lastBlockTimestamp,
          limit: 50,
        });

        for (const block of blocks) {
          lastBlockTimestamp = block.timestamp;
          for (const handler of this.policyBlockHandlers) {
            await handler(block);
          }
        }

        // Fetch PII detections
        const detections = await this.fetchPIIDetections({
          since: lastPIITimestamp,
          limit: 50,
        });

        for (const detection of detections) {
          lastPIITimestamp = detection.timestamp;
          for (const handler of this.piiDetectionHandlers) {
            await handler(detection);
          }
        }
      } catch (error) {
        console.error('[ShieldAdapter] Poll error:', error);
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
        throw new Error(`Shield API error: ${response.status} ${response.statusText}`);
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

export function createShieldAdapter(config: ShieldConfig): ShieldAdapter {
  return new ShieldAdapter(config);
}
