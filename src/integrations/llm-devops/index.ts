/**
 * LLM-DevOps Integration Adapters
 *
 * Thin runtime consumption layer for LLM-Dev-Ops upstream modules.
 * These adapters provide read-only access to telemetry, signals, and configurations
 * from the LLM-Dev-Ops ecosystem without modifying Auto-Optimizer's core logic.
 *
 * @module integrations/llm-devops
 */

// ============================================================================
// Cost Operations
// ============================================================================

export {
  CostOpsAdapter,
  createCostOpsAdapter,
  type CostOpsConfig,
  type CostTelemetryEvent,
  type CostProjection,
  type CostAggregation,
  type CostOpsEventHandler,
  type CostProjectionHandler,
} from './cost-ops-adapter';

// ============================================================================
// Latency Monitoring
// ============================================================================

export {
  LatencyLensAdapter,
  createLatencyLensAdapter,
  type LatencyLensConfig,
  type LatencyProfile,
  type ThroughputStats,
  type LatencyBreakdown,
  type LatencyAnomaly,
  type LatencyProfileHandler,
  type ThroughputHandler,
  type LatencyAnomalyHandler,
} from './latency-lens-adapter';

// ============================================================================
// Anomaly Detection & Drift
// ============================================================================

export {
  SentinelAdapter,
  createSentinelAdapter,
  type SentinelConfig,
  type AnomalyEvent,
  type AnomalyType,
  type DriftSignal,
  type DriftType,
  type SentinelAlert,
  type HealthStatus,
  type AnomalyEventHandler,
  type DriftSignalHandler,
  type AlertHandler,
} from './sentinel-adapter';

// ============================================================================
// Security & Policy
// ============================================================================

export {
  ShieldAdapter,
  createShieldAdapter,
  type ShieldConfig,
  type PolicyBlockEvent,
  type PolicyBlockReason,
  type PIIDetectionSignal,
  type PIIType,
  type PIIDetection,
  type PolicyStats,
  type PIIStats,
  type PolicyBlockHandler,
  type PIIDetectionHandler,
} from './shield-adapter';

// ============================================================================
// Observability & Tracing
// ============================================================================

export {
  ObservatoryAdapter,
  createObservatoryAdapter,
  type ObservatoryConfig,
  type TelemetryTrace,
  type SpanEvent,
  type SpanLink,
  type StructuredEvent,
  type StructuredEventType,
  type TraceSearch,
  type TraceSummary,
  type TraceHandler,
  type StructuredEventHandler,
} from './observatory-adapter';

// ============================================================================
// Configuration Management
// ============================================================================

export {
  ConfigManagerAdapter,
  createConfigManagerAdapter,
  type ConfigManagerConfig,
  type OptimizationThresholds,
  type RoutingConfig,
  type RoutingRule,
  type RuleCondition,
  type ModelAvailability,
  type ConfigChange,
  type ThresholdChangeHandler,
  type RoutingChangeHandler,
  type AvailabilityChangeHandler,
  type ConfigChangeHandler,
} from './config-manager-adapter';

// ============================================================================
// External Router L2
// ============================================================================

export {
  RouterL2Adapter,
  createRouterL2Adapter,
  type RouterL2Config,
  type RoutingDecision,
  type RoutingReason,
  type LoadBalancerSignal,
  type LoadBalancerSignalType,
  type TrafficStats,
  type RouterHealth,
  type ModelWeight,
  type RoutingDecisionHandler,
  type LoadBalancerSignalHandler,
} from './router-l2-adapter';

// ============================================================================
// Unified Configuration Types
// ============================================================================

/**
 * Combined configuration for all LLM-DevOps adapters
 */
export interface LLMDevOpsConfig {
  /** Cost operations configuration */
  costOps?: {
    apiBaseUrl: string;
    apiKey: string;
    enabled?: boolean;
  };
  /** Latency lens configuration */
  latencyLens?: {
    apiBaseUrl: string;
    apiKey: string;
    enabled?: boolean;
  };
  /** Sentinel configuration */
  sentinel?: {
    apiBaseUrl: string;
    apiKey: string;
    enabled?: boolean;
  };
  /** Shield configuration */
  shield?: {
    apiBaseUrl: string;
    apiKey: string;
    enabled?: boolean;
  };
  /** Observatory configuration */
  observatory?: {
    apiBaseUrl: string;
    apiKey: string;
    enabled?: boolean;
  };
  /** Config manager configuration */
  configManager?: {
    apiBaseUrl: string;
    apiKey: string;
    enabled?: boolean;
  };
  /** Router L2 configuration */
  routerL2?: {
    apiBaseUrl: string;
    apiKey: string;
    enabled?: boolean;
  };
}

/**
 * Collection of all initialized adapters
 */
export interface LLMDevOpsAdapters {
  costOps?: CostOpsAdapter;
  latencyLens?: LatencyLensAdapter;
  sentinel?: SentinelAdapter;
  shield?: ShieldAdapter;
  observatory?: ObservatoryAdapter;
  configManager?: ConfigManagerAdapter;
  routerL2?: RouterL2Adapter;
}

// ============================================================================
// Factory Function
// ============================================================================

import { CostOpsAdapter } from './cost-ops-adapter';
import { LatencyLensAdapter } from './latency-lens-adapter';
import { SentinelAdapter } from './sentinel-adapter';
import { ShieldAdapter } from './shield-adapter';
import { ObservatoryAdapter } from './observatory-adapter';
import { ConfigManagerAdapter } from './config-manager-adapter';
import { RouterL2Adapter } from './router-l2-adapter';

/**
 * Create all configured LLM-DevOps adapters
 */
export function createLLMDevOpsAdapters(config: LLMDevOpsConfig): LLMDevOpsAdapters {
  const adapters: LLMDevOpsAdapters = {};

  if (config.costOps?.enabled !== false && config.costOps?.apiBaseUrl) {
    adapters.costOps = new CostOpsAdapter({
      apiBaseUrl: config.costOps.apiBaseUrl,
      apiKey: config.costOps.apiKey,
    });
  }

  if (config.latencyLens?.enabled !== false && config.latencyLens?.apiBaseUrl) {
    adapters.latencyLens = new LatencyLensAdapter({
      apiBaseUrl: config.latencyLens.apiBaseUrl,
      apiKey: config.latencyLens.apiKey,
    });
  }

  if (config.sentinel?.enabled !== false && config.sentinel?.apiBaseUrl) {
    adapters.sentinel = new SentinelAdapter({
      apiBaseUrl: config.sentinel.apiBaseUrl,
      apiKey: config.sentinel.apiKey,
    });
  }

  if (config.shield?.enabled !== false && config.shield?.apiBaseUrl) {
    adapters.shield = new ShieldAdapter({
      apiBaseUrl: config.shield.apiBaseUrl,
      apiKey: config.shield.apiKey,
    });
  }

  if (config.observatory?.enabled !== false && config.observatory?.apiBaseUrl) {
    adapters.observatory = new ObservatoryAdapter({
      apiBaseUrl: config.observatory.apiBaseUrl,
      apiKey: config.observatory.apiKey,
    });
  }

  if (config.configManager?.enabled !== false && config.configManager?.apiBaseUrl) {
    adapters.configManager = new ConfigManagerAdapter({
      apiBaseUrl: config.configManager.apiBaseUrl,
      apiKey: config.configManager.apiKey,
    });
  }

  if (config.routerL2?.enabled !== false && config.routerL2?.apiBaseUrl) {
    adapters.routerL2 = new RouterL2Adapter({
      apiBaseUrl: config.routerL2.apiBaseUrl,
      apiKey: config.routerL2.apiKey,
    });
  }

  return adapters;
}

/**
 * Start all adapters listening for events
 */
export function startAllListeners(adapters: LLMDevOpsAdapters, intervalMs: number = 5000): void {
  adapters.costOps?.startListening(intervalMs);
  adapters.latencyLens?.startListening(intervalMs);
  adapters.sentinel?.startListening(intervalMs);
  adapters.shield?.startListening(intervalMs);
  adapters.observatory?.startListening(intervalMs);
  adapters.configManager?.startListening(intervalMs * 2); // Config changes are less frequent
  adapters.routerL2?.startListening(intervalMs);
}

/**
 * Stop all adapters from listening
 */
export function stopAllListeners(adapters: LLMDevOpsAdapters): void {
  adapters.costOps?.stopListening();
  adapters.latencyLens?.stopListening();
  adapters.sentinel?.stopListening();
  adapters.shield?.stopListening();
  adapters.observatory?.stopListening();
  adapters.configManager?.stopListening();
  adapters.routerL2?.stopListening();
}

// ============================================================================
// Version
// ============================================================================

export const LLM_DEVOPS_ADAPTERS_VERSION = '1.0.0';
