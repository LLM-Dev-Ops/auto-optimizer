/**
 * Self-Optimizing Agent - Google Cloud Edge Function Handler
 *
 * Stateless HTTP handler for the Self-Optimizing Agent.
 * Deploys as part of the LLM-Auto-Optimizer unified GCP service.
 *
 * Endpoints:
 * - POST /analyze  - Analyze current state
 * - POST /recommend - Generate recommendations
 * - POST /simulate - Simulate changes
 * - GET  /health   - Health check
 *
 * @module agents/self-optimizing-agent/handler
 */

import {
  SelfOptimizingAgent,
  createSelfOptimizingAgent,
  AGENT_ID,
  AGENT_VERSION,
} from './index';

import {
  SelfOptimizingAgentInput,
  SelfOptimizingAgentOutput,
  validateInput,
  CLIInvocation,
  CLIParams,
} from '../../contracts';

// ============================================================================
// Types
// ============================================================================

interface HttpRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: string | object;
  query?: Record<string, string>;
}

interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  agent_id: string;
  agent_version: string;
  timestamp: string;
  checks: {
    ruvector_service: boolean;
    telemetry_endpoint: boolean;
  };
}

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  agent_id: string;
  timestamp: string;
}

// ============================================================================
// Handler Class
// ============================================================================

/**
 * HTTP handler for the Self-Optimizing Agent Edge Function.
 */
export class SelfOptimizingAgentHandler {
  private agent: SelfOptimizingAgent;

  constructor() {
    this.agent = createSelfOptimizingAgent();
  }

  /**
   * Main entry point for Edge Function invocations.
   */
  async handle(request: HttpRequest): Promise<HttpResponse> {
    const path = this.normalizePath(request.path);

    try {
      switch (path) {
        case '/health':
          return this.handleHealth();

        case '/analyze':
          return this.handleAnalyze(request);

        case '/recommend':
          return this.handleRecommend(request);

        case '/simulate':
          return this.handleSimulate(request);

        default:
          return this.notFound(path);
      }
    } catch (error) {
      return this.handleError(error);
    }
  }

  // --------------------------------------------------------------------------
  // Endpoint Handlers
  // --------------------------------------------------------------------------

  private async handleHealth(): Promise<HttpResponse> {
    const healthCheck: HealthCheckResponse = {
      status: 'healthy',
      agent_id: AGENT_ID,
      agent_version: AGENT_VERSION,
      timestamp: new Date().toISOString(),
      checks: {
        ruvector_service: true, // Would actually check in production
        telemetry_endpoint: !!process.env.TELEMETRY_ENDPOINT,
      },
    };

    return this.json(200, healthCheck);
  }

  private async handleAnalyze(request: HttpRequest): Promise<HttpResponse> {
    if (request.method !== 'POST') {
      return this.methodNotAllowed(request.method, ['POST']);
    }

    const input = this.parseInput(request);
    const result = await this.agent.analyze(input);
    return this.json(200, result);
  }

  private async handleRecommend(request: HttpRequest): Promise<HttpResponse> {
    if (request.method !== 'POST') {
      return this.methodNotAllowed(request.method, ['POST']);
    }

    const input = this.parseInput(request);
    const result = await this.agent.recommend(input);
    return this.json(200, result);
  }

  private async handleSimulate(request: HttpRequest): Promise<HttpResponse> {
    if (request.method !== 'POST') {
      return this.methodNotAllowed(request.method, ['POST']);
    }

    const input = this.parseInput(request);
    const result = await this.agent.simulate(input);
    return this.json(200, result);
  }

  // --------------------------------------------------------------------------
  // Input Parsing
  // --------------------------------------------------------------------------

  private parseInput(request: HttpRequest): SelfOptimizingAgentInput {
    let body: unknown;

    if (typeof request.body === 'string') {
      try {
        body = JSON.parse(request.body);
      } catch {
        throw new ValidationError('Invalid JSON in request body');
      }
    } else {
      body = request.body;
    }

    if (!body || typeof body !== 'object') {
      throw new ValidationError('Request body is required');
    }

    const obj = body as Record<string, unknown>;
    obj.telemetry = normalizeTelemetry(obj.telemetry);

    try {
      validateInput(obj);
    } catch (error) {
      if (error instanceof Error) {
        throw new ValidationError(error.message);
      }
      throw error;
    }

    return obj as unknown as SelfOptimizingAgentInput;
  }

  // --------------------------------------------------------------------------
  // Response Helpers
  // --------------------------------------------------------------------------

  private json(status: number, data: unknown): HttpResponse {
    return {
      status,
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Id': AGENT_ID,
        'X-Agent-Version': AGENT_VERSION,
      },
      body: JSON.stringify(data),
    };
  }

  private notFound(path: string): HttpResponse {
    const error: ErrorResponse = {
      error: {
        code: 'NOT_FOUND',
        message: `Endpoint not found: ${path}`,
        details: {
          available_endpoints: ['/health', '/analyze', '/recommend', '/simulate'],
        },
      },
      agent_id: AGENT_ID,
      timestamp: new Date().toISOString(),
    };

    return this.json(404, error);
  }

  private methodNotAllowed(method: string, allowed: string[]): HttpResponse {
    const error: ErrorResponse = {
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: `Method ${method} not allowed`,
        details: { allowed_methods: allowed },
      },
      agent_id: AGENT_ID,
      timestamp: new Date().toISOString(),
    };

    return {
      ...this.json(405, error),
      headers: {
        ...this.json(405, error).headers,
        Allow: allowed.join(', '),
      },
    };
  }

  private handleError(error: unknown): HttpResponse {
    console.error('[SelfOptimizingAgentHandler] Error:', error);

    if (error instanceof InsufficientTelemetryError) {
      const errorResponse: ErrorResponse = {
        error: {
          code: 'INSUFFICIENT_TELEMETRY',
          message: error.message,
          details: error.details,
        },
        agent_id: AGENT_ID,
        timestamp: new Date().toISOString(),
      };
      return this.json(400, errorResponse);
    }

    if (error instanceof ValidationError) {
      const errorResponse: ErrorResponse = {
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
        },
        agent_id: AGENT_ID,
        timestamp: new Date().toISOString(),
      };
      return this.json(400, errorResponse);
    }

    const errorResponse: ErrorResponse = {
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      agent_id: AGENT_ID,
      timestamp: new Date().toISOString(),
    };

    return this.json(500, errorResponse);
  }

  private normalizePath(path: string): string {
    // Remove query string
    const questionIndex = path.indexOf('?');
    if (questionIndex !== -1) {
      path = path.substring(0, questionIndex);
    }

    // Remove trailing slash
    if (path.endsWith('/') && path.length > 1) {
      path = path.slice(0, -1);
    }

    // Remove agent prefix if present
    const agentPrefix = `/agents/${AGENT_ID}`;
    if (path.startsWith(agentPrefix)) {
      path = path.substring(agentPrefix.length) || '/';
    }

    return path;
  }
}

// ============================================================================
// Custom Errors
// ============================================================================

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

class InsufficientTelemetryError extends Error {
  constructor(message: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = 'InsufficientTelemetryError';
  }
}

// ============================================================================
// Telemetry Normalization
// ============================================================================

// Accepts the nested shape the agent was originally designed for, OR the
// flat `{ by_model: { <model-id>: {...} } }` shape the CLI sends (matching
// the convention used by the token-optimization agent). Projects the flat
// shape into the nested cost/latency/quality structures the agent reads.
function normalizeTelemetry(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') {
    throw new InsufficientTelemetryError(
      'telemetry field is missing or not an object',
      { received_type: typeof raw }
    );
  }

  const t = raw as Record<string, unknown>;

  const hasNested =
    t.cost_metrics && typeof t.cost_metrics === 'object' &&
    t.latency_metrics && typeof t.latency_metrics === 'object' &&
    t.quality_metrics && typeof t.quality_metrics === 'object';

  if (hasNested) {
    console.log(JSON.stringify({
      level: 'info',
      agent: AGENT_ID,
      message: 'telemetry_shape',
      shape: 'nested',
    }));
    return {
      ...t,
      anomaly_signals: Array.isArray(t.anomaly_signals) ? t.anomaly_signals : [],
      routing_history: Array.isArray(t.routing_history) ? t.routing_history : [],
    };
  }

  const flat = t.by_model as Record<string, Record<string, unknown>> | undefined;
  if (!flat || typeof flat !== 'object' || Object.keys(flat).length === 0) {
    throw new InsufficientTelemetryError(
      'telemetry must provide either nested { cost_metrics, latency_metrics, quality_metrics } or a non-empty { by_model } map',
      { received_keys: Object.keys(t) }
    );
  }

  console.log(JSON.stringify({
    level: 'info',
    agent: AGENT_ID,
    message: 'telemetry_shape',
    shape: 'flat_by_model',
    model_ids: Object.keys(flat),
  }));

  const num = (v: unknown, fallback = 0) => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const costByModel: Record<string, unknown> = {};
  const latencyByModel: Record<string, unknown> = {};
  const qualityByModel: Record<string, unknown> = {};
  let totalCost = 0;
  const p50s: number[] = [];
  const p95s: number[] = [];
  const p99s: number[] = [];
  const scores: number[] = [];

  for (const [modelId, entry] of Object.entries(flat)) {
    const e = (entry ?? {}) as Record<string, any>;
    const requestCount = num(e.request_count ?? e.requests);
    const inputTokens = num(e.input_tokens ?? e.total_input_tokens);
    const outputTokens = num(e.output_tokens ?? e.total_output_tokens);
    const costUsd = num(e.cost_usd ?? e.total_cost_usd ?? e.cost?.total_cost_usd);
    const avgCost = requestCount > 0
      ? costUsd / requestCount
      : num(e.avg_cost_per_request ?? e.cost?.avg_cost_per_request_usd);
    totalCost += costUsd;

    costByModel[modelId] = {
      cost_usd: costUsd,
      request_count: requestCount,
      avg_cost_per_request: avgCost,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    };

    const p50 = num(e.latency?.p50_ms ?? e.p50_ms);
    const p95 = num(e.latency?.p95_ms ?? e.p95_ms);
    const p99 = num(e.latency?.p99_ms ?? e.p99_ms);
    if (p50) p50s.push(p50);
    if (p95) p95s.push(p95);
    if (p99) p99s.push(p99);

    latencyByModel[modelId] = {
      p50_ms: p50,
      p95_ms: p95,
      p99_ms: p99,
      request_count: requestCount,
      timeout_rate: num(e.timeout_rate ?? e.availability?.timeout_rate),
    };

    const score = num(e.quality?.avg_score ?? e.quality_score ?? e.score, 0.85);
    scores.push(score);
    qualityByModel[modelId] = {
      score,
      sample_count: num(e.quality?.sample_count ?? e.sample_count, requestCount),
      error_rate: num(e.quality?.error_rate ?? e.error_rate),
    };
  }

  const mean = (arr: number[]) =>
    arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;

  return {
    cost_metrics: {
      total_cost_usd: totalCost,
      by_model: costByModel,
      by_provider: (t.by_provider as Record<string, number>) ?? {},
      daily_trend: Array.isArray(t.daily_trend) ? (t.daily_trend as number[]) : [],
    },
    latency_metrics: {
      p50_ms: mean(p50s),
      p95_ms: mean(p95s),
      p99_ms: mean(p99s),
      avg_ms: mean(p50s),
      by_model: latencyByModel,
    },
    quality_metrics: {
      overall_score: mean(scores),
      by_model: qualityByModel,
      user_satisfaction: (t.user_satisfaction as Record<string, unknown>) ?? {
        avg_rating: 0,
        rating_count: 0,
        positive_ratio: 0,
      },
    },
    anomaly_signals: Array.isArray(t.anomaly_signals) ? t.anomaly_signals : [],
    routing_history: Array.isArray(t.routing_history) ? t.routing_history : [],
  };
}

// ============================================================================
// Google Cloud Functions Entry Point
// ============================================================================

const handler = new SelfOptimizingAgentHandler();

/**
 * Google Cloud Functions HTTP entry point.
 *
 * @example
 * // Deploy as Cloud Function
 * gcloud functions deploy self-optimizing-agent \
 *   --runtime nodejs20 \
 *   --trigger-http \
 *   --entry-point selfOptimizingAgent
 */
export async function selfOptimizingAgent(
  req: {
    method: string;
    path: string;
    headers: Record<string, string>;
    body?: unknown;
    query?: Record<string, string>;
  },
  res: {
    status: (code: number) => { set: (headers: Record<string, string>) => { send: (body: string) => void } };
  }
): Promise<void> {
  const request: HttpRequest = {
    method: req.method,
    path: req.path || '/',
    headers: req.headers,
    body: req.body as string | object | undefined,
    query: req.query,
  };

  const response = await handler.handle(request);

  res.status(response.status).set(response.headers).send(response.body);
}

/**
 * Google Cloud Run / Edge Function entry point.
 */
export { handler };

// ============================================================================
// CLI Helper Functions
// ============================================================================

/**
 * Build SelfOptimizingAgentInput from CLI parameters.
 * Used by agentics-cli to invoke the agent.
 */
export function buildInputFromCLI(params: CLIParams): SelfOptimizingAgentInput {
  const now = new Date();
  const windowDuration = parseWindowDuration(params.window || '24h');
  const start = new Date(now.getTime() - windowDuration);

  // Parse focus into weights
  const weights = parseOptimizationFocus(params.focus || 'balanced');

  // Build constraints from CLI flags
  const constraints = [];
  if (params.max_cost_increase !== undefined) {
    constraints.push({
      type: 'max_cost_increase_pct' as const,
      value: params.max_cost_increase,
      hard: true,
    });
  }
  if (params.min_quality !== undefined) {
    constraints.push({
      type: 'min_quality_threshold' as const,
      value: params.min_quality,
      hard: true,
    });
  }
  if (params.max_latency_increase !== undefined) {
    constraints.push({
      type: 'max_latency_increase_ms' as const,
      value: params.max_latency_increase,
      hard: true,
    });
  }

  // NOTE: In production, telemetry data would be fetched from
  // Observatory, Latency-Lens, and Analytics-Hub
  const mockTelemetry = createMockTelemetryData();

  return {
    execution_ref: `cli-${Date.now()}`,
    time_window: {
      start: start.toISOString(),
      end: now.toISOString(),
      granularity: windowDuration > 86400000 ? 'day' : 'hour',
    },
    optimization_targets: weights,
    target_services: params.services?.split(',').map(s => s.trim()) || ['default'],
    constraints,
    telemetry: mockTelemetry,
  };
}

function parseWindowDuration(window: string): number {
  const match = window.match(/^(\d+)([hdwm])$/);
  if (!match) return 86400000; // Default 24h

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'h': return value * 3600000;
    case 'd': return value * 86400000;
    case 'w': return value * 604800000;
    case 'm': return value * 2592000000;
    default: return 86400000;
  }
}

function parseOptimizationFocus(focus: string): {
  cost_weight: number;
  latency_weight: number;
  quality_weight: number;
} {
  switch (focus) {
    case 'cost':
      return { cost_weight: 0.6, latency_weight: 0.2, quality_weight: 0.2 };
    case 'latency':
      return { cost_weight: 0.2, latency_weight: 0.6, quality_weight: 0.2 };
    case 'quality':
      return { cost_weight: 0.2, latency_weight: 0.2, quality_weight: 0.6 };
    case 'balanced':
    default:
      return { cost_weight: 0.34, latency_weight: 0.33, quality_weight: 0.33 };
  }
}

function createMockTelemetryData() {
  // This would be replaced with actual API calls in production
  return {
    cost_metrics: {
      total_cost_usd: 1500.00,
      by_model: {
        'claude-3-opus': {
          cost_usd: 800.00,
          request_count: 5000,
          avg_cost_per_request: 0.16,
          input_tokens: 2000000,
          output_tokens: 500000,
        },
        'claude-3-sonnet': {
          cost_usd: 500.00,
          request_count: 15000,
          avg_cost_per_request: 0.033,
          input_tokens: 5000000,
          output_tokens: 1500000,
        },
        'claude-3-haiku': {
          cost_usd: 200.00,
          request_count: 80000,
          avg_cost_per_request: 0.0025,
          input_tokens: 20000000,
          output_tokens: 5000000,
        },
      },
      by_provider: {
        anthropic: 1500.00,
      },
      daily_trend: [1400, 1450, 1480, 1500, 1520, 1490, 1500],
    },
    latency_metrics: {
      p50_ms: 250,
      p95_ms: 800,
      p99_ms: 1500,
      avg_ms: 350,
      by_model: {
        'claude-3-opus': {
          p50_ms: 500,
          p95_ms: 1200,
          p99_ms: 2000,
          request_count: 5000,
          timeout_rate: 0.02,
        },
        'claude-3-sonnet': {
          p50_ms: 300,
          p95_ms: 700,
          p99_ms: 1200,
          request_count: 15000,
          timeout_rate: 0.01,
        },
        'claude-3-haiku': {
          p50_ms: 150,
          p95_ms: 400,
          p99_ms: 800,
          request_count: 80000,
          timeout_rate: 0.005,
        },
      },
    },
    quality_metrics: {
      overall_score: 0.88,
      by_model: {
        'claude-3-opus': {
          score: 0.95,
          sample_count: 1000,
          error_rate: 0.01,
        },
        'claude-3-sonnet': {
          score: 0.90,
          sample_count: 3000,
          error_rate: 0.02,
        },
        'claude-3-haiku': {
          score: 0.82,
          sample_count: 8000,
          error_rate: 0.03,
        },
      },
      user_satisfaction: {
        avg_rating: 4.2,
        rating_count: 500,
        positive_ratio: 0.85,
      },
    },
    anomaly_signals: [],
    routing_history: [],
  };
}
