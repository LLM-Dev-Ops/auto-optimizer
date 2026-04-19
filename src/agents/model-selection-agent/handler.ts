/**
 * Model Selection Agent - Google Cloud Edge Function Handler
 *
 * Stateless HTTP handler for the Model Selection Agent.
 * Deploys as part of the LLM-Auto-Optimizer unified GCP service.
 *
 * Endpoints:
 * - POST /analyze  - Analyze model landscape for task
 * - POST /recommend - Generate model recommendations
 * - POST /simulate - Simulate model selection
 * - GET  /health   - Health check
 *
 * @module agents/model-selection-agent/handler
 */

import {
  ModelSelectionAgent,
  createModelSelectionAgent,
  AGENT_ID,
  AGENT_VERSION,
} from './index';

import {
  ModelSelectionAgentInput,
  ModelSelectionAgentOutput,
  validateModelSelectionInput,
  TaskType,
  TaskContext,
  ModelPerformanceHistory,
  ModelSelectionConstraint,
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

/**
 * CLI parameters for model selection commands.
 */
export interface ModelSelectCLIParams {
  /** Task type */
  task_type?: string;
  /** Complexity level */
  complexity?: string;
  /** Expected input tokens */
  input_tokens?: number;
  /** Expected output tokens */
  output_tokens?: number;
  /** Maximum latency in ms */
  max_latency?: number;
  /** Minimum quality score */
  min_quality?: number;
  /** Maximum cost per request */
  max_cost?: number;
  /** Cost optimization priority */
  cost_priority?: string;
  /** Allowed providers (comma-separated) */
  providers?: string;
  /** Allowed models (comma-separated) */
  models?: string;
  /** Time window for analysis */
  window?: string;
  /** Output format */
  format?: 'json' | 'yaml' | 'table' | 'summary';
  /** Quiet mode */
  quiet?: boolean;
  /** Raw output */
  raw?: boolean;
}

// ============================================================================
// Handler Class
// ============================================================================

/**
 * HTTP handler for the Model Selection Agent Edge Function.
 */
export class ModelSelectionAgentHandler {
  private agent: ModelSelectionAgent;

  constructor() {
    this.agent = createModelSelectionAgent();
  }

  /**
   * Main entry point for Edge Function invocations.
   */
  async handle(request: HttpRequest): Promise<HttpResponse> {
    const path = this.normalizePath(request.path);

    try {
      switch (path) {
        case '/health':
          return await this.handleHealth();

        case '/analyze':
          return await this.handleAnalyze(request);

        case '/recommend':
          return await this.handleRecommend(request);

        case '/simulate':
          return await this.handleSimulate(request);

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

  private parseInput(request: HttpRequest): ModelSelectionAgentInput {
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
    obj.performance_history = normalizePerformanceHistory(obj.performance_history);
    obj.task_context = normalizeTaskContext(obj.task_context);

    try {
      validateModelSelectionInput(obj);
    } catch (error) {
      if (error instanceof Error) {
        throw new ValidationError(error.message);
      }
      throw error;
    }

    return obj as unknown as ModelSelectionAgentInput;
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
    console.error('[ModelSelectionAgentHandler] Error:', error);

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
// Performance History & Task Context Normalization
// ============================================================================

// Accepts the nested shape ({ by_model, by_task_type, total_requests, data_window })
// or a flat `{ <model-id>: metrics }` map (what the CLI sends). Projects each
// per-model entry into the full ModelHistoricalMetrics shape the scoring code
// reads (latency.p95_ms, cost.avg_cost_per_request_usd, quality.avg_score, etc.)
// so that partial inputs like `{ avg_latency_ms, avg_quality, avg_cost,
// request_count }` don't crash with `.quality.avg_score` undefined.
function normalizePerformanceHistory(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') {
    throw new InsufficientTelemetryError(
      'performance_history field is missing or not an object',
      { received_type: typeof raw }
    );
  }

  const ph = raw as Record<string, unknown>;

  const hasByModel =
    ph.by_model && typeof ph.by_model === 'object' &&
    Object.keys(ph.by_model as Record<string, unknown>).length > 0;

  if (hasByModel) {
    const rawByModel = ph.by_model as Record<string, unknown>;
    const byModel: Record<string, unknown> = {};
    let totalRequests = 0;
    for (const [modelId, entry] of Object.entries(rawByModel)) {
      const projected = projectModelMetrics(modelId, entry);
      byModel[modelId] = projected;
      totalRequests += (projected as any).request_count || 0;
    }

    console.log(JSON.stringify({
      level: 'info',
      agent: AGENT_ID,
      message: 'performance_history_shape',
      shape: 'nested',
      model_ids: Object.keys(byModel),
    }));
    return {
      by_model: byModel,
      by_task_type: ph.by_task_type && typeof ph.by_task_type === 'object' ? ph.by_task_type : {},
      total_requests: typeof ph.total_requests === 'number' ? ph.total_requests : totalRequests,
      data_window: ph.data_window ?? { start: '', end: '', granularity: 'hour' },
    };
  }

  const entries = Object.entries(ph).filter(
    ([, v]) => v && typeof v === 'object' && !Array.isArray(v)
  );

  if (entries.length === 0) {
    throw new InsufficientTelemetryError(
      'performance_history must contain either a nested `by_model` map or a non-empty flat map keyed by model id',
      { received_keys: Object.keys(ph) }
    );
  }

  const byModel: Record<string, unknown> = {};
  let totalRequests = 0;
  for (const [modelId, entry] of entries) {
    const projected = projectModelMetrics(modelId, entry);
    byModel[modelId] = projected;
    totalRequests += (projected as any).request_count || 0;
  }

  console.log(JSON.stringify({
    level: 'info',
    agent: AGENT_ID,
    message: 'performance_history_shape',
    shape: 'flat_by_model_id',
    model_ids: Object.keys(byModel),
  }));

  return {
    by_model: byModel,
    by_task_type: {},
    total_requests: totalRequests,
    data_window: { start: '', end: '', granularity: 'hour' },
  };
}

function toNumber(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function inferProvider(modelId: string): string {
  const id = modelId.toLowerCase();
  if (id.startsWith('claude')) return 'anthropic';
  if (id.startsWith('gpt') || id.startsWith('o1') || id.startsWith('o3')) return 'openai';
  if (id.startsWith('gemini')) return 'google';
  if (id.startsWith('llama') || id.startsWith('mistral') || id.startsWith('mixtral')) return 'meta';
  return 'unknown';
}

// Projects a raw per-model metrics entry (either fully nested or the flat
// shape the CLI sends) into a complete ModelHistoricalMetrics object.
function projectModelMetrics(modelId: string, raw: unknown): Record<string, unknown> {
  const e = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const requestCount = toNumber(e.request_count ?? e.requests);

  // Latency: prefer nested, fall back to flat fields.
  const flatLatency = toNumber(e.avg_latency_ms ?? e.latency_ms ?? e.latency);
  const nestedLatency = e.latency && typeof e.latency === 'object' ? e.latency : {};
  const latency = {
    p50_ms: toNumber(nestedLatency.p50_ms ?? e.p50_ms, flatLatency),
    p95_ms: toNumber(nestedLatency.p95_ms ?? e.p95_ms, flatLatency ? flatLatency * 1.5 : 0),
    p99_ms: toNumber(nestedLatency.p99_ms ?? e.p99_ms, flatLatency ? flatLatency * 2 : 0),
    avg_ms: toNumber(nestedLatency.avg_ms ?? e.avg_latency_ms, flatLatency),
  };

  // Cost: prefer nested, fall back to flat fields.
  const flatCost = toNumber(e.avg_cost ?? e.avg_cost_per_request ?? e.cost_per_request);
  const nestedCost = e.cost && typeof e.cost === 'object' ? e.cost : {};
  const avgCostPerReq = toNumber(nestedCost.avg_cost_per_request_usd, flatCost);
  const cost = {
    total_cost_usd: toNumber(nestedCost.total_cost_usd, avgCostPerReq * requestCount),
    avg_cost_per_request_usd: avgCostPerReq,
    input_cost_per_1k_tokens: toNumber(nestedCost.input_cost_per_1k_tokens),
    output_cost_per_1k_tokens: toNumber(nestedCost.output_cost_per_1k_tokens),
  };

  // Quality: the flat CLI sends `avg_quality` — map it to avg_score.
  const flatQuality = toNumber(e.avg_quality ?? e.quality_score ?? e.score, 0.85);
  const nestedQuality = e.quality && typeof e.quality === 'object' ? e.quality : {};
  const errorRate = toNumber(nestedQuality.error_rate ?? e.error_rate);
  const quality = {
    avg_score: toNumber(nestedQuality.avg_score, flatQuality),
    error_rate: errorRate,
    success_rate: toNumber(nestedQuality.success_rate, 1 - errorRate),
    user_satisfaction: nestedQuality.user_satisfaction,
  };

  const nestedTokens = e.tokens && typeof e.tokens === 'object' ? e.tokens : {};
  const tokens = {
    total_input: toNumber(nestedTokens.total_input ?? e.total_input_tokens ?? e.input_tokens),
    total_output: toNumber(nestedTokens.total_output ?? e.total_output_tokens ?? e.output_tokens),
    avg_input: toNumber(nestedTokens.avg_input),
    avg_output: toNumber(nestedTokens.avg_output),
  };

  const nestedAvailability = e.availability && typeof e.availability === 'object' ? e.availability : {};
  const availability = {
    uptime_pct: toNumber(nestedAvailability.uptime_pct ?? e.uptime_pct, 99.5),
    timeout_rate: toNumber(nestedAvailability.timeout_rate ?? e.timeout_rate),
    rate_limit_hit_rate: toNumber(nestedAvailability.rate_limit_hit_rate ?? e.rate_limit_hit_rate),
  };

  return {
    model_id: e.model_id ?? modelId,
    provider: e.provider ?? inferProvider(modelId),
    request_count: requestCount,
    latency,
    cost,
    quality,
    tokens,
    availability,
  };
}

// Accepts either the nested TaskContext shape or the flat CLI shape
// ({ expected_input_tokens: number, latency_requirements: { p95_ms },
//    quality_requirements: { min_accuracy },
//    budget_constraints: { max_cost_per_request } }) and projects into
// the nested shape the scoring code reads.
function normalizeTaskContext(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') {
    throw new ValidationError('task_context is required and must be an object');
  }
  const t = raw as Record<string, any>;

  const inputTokens =
    typeof t.expected_input_tokens === 'number'
      ? {
          min: Math.round(t.expected_input_tokens * 0.5),
          max: Math.round(t.expected_input_tokens * 2),
          avg: t.expected_input_tokens,
        }
      : t.expected_input_tokens && typeof t.expected_input_tokens === 'object'
        ? {
            min: toNumber(t.expected_input_tokens.min, 500),
            max: toNumber(t.expected_input_tokens.max, 2000),
            avg: toNumber(
              t.expected_input_tokens.avg,
              (toNumber(t.expected_input_tokens.min, 500) + toNumber(t.expected_input_tokens.max, 2000)) / 2
            ),
          }
        : { min: 500, max: 2000, avg: 1000 };

  const outputTokens =
    typeof t.expected_output_tokens === 'number'
      ? {
          min: Math.round(t.expected_output_tokens * 0.5),
          max: Math.round(t.expected_output_tokens * 2),
          avg: t.expected_output_tokens,
        }
      : t.expected_output_tokens && typeof t.expected_output_tokens === 'object'
        ? {
            min: toNumber(t.expected_output_tokens.min, 250),
            max: toNumber(t.expected_output_tokens.max, 1000),
            avg: toNumber(
              t.expected_output_tokens.avg,
              (toNumber(t.expected_output_tokens.min, 250) + toNumber(t.expected_output_tokens.max, 1000)) / 2
            ),
          }
        : { min: 250, max: 1000, avg: 500 };

  const latencyRaw = (t.latency_requirements && typeof t.latency_requirements === 'object'
    ? t.latency_requirements
    : {}) as Record<string, any>;
  const maxLatency = toNumber(
    latencyRaw.max_latency_ms ?? latencyRaw.p95_ms ?? latencyRaw.max_ms ?? latencyRaw.max_latency,
    2000
  );
  const latencyRequirements = {
    max_latency_ms: maxLatency,
    target_latency_ms: toNumber(
      latencyRaw.target_latency_ms ?? latencyRaw.p50_ms ?? latencyRaw.target,
      maxLatency * 0.7
    ),
    strict: Boolean(
      latencyRaw.strict ??
        (latencyRaw.p95_ms !== undefined || latencyRaw.max_latency_ms !== undefined)
    ),
  };

  const qualityRaw = (t.quality_requirements && typeof t.quality_requirements === 'object'
    ? t.quality_requirements
    : {}) as Record<string, any>;
  const qualityRequirements = {
    min_quality_score: toNumber(
      qualityRaw.min_quality_score ?? qualityRaw.min_accuracy ?? qualityRaw.min_score,
      0.7
    ),
    strict: Boolean(
      qualityRaw.strict ??
        (qualityRaw.min_accuracy !== undefined || qualityRaw.min_quality_score !== undefined)
    ),
  };

  const budgetRaw = (t.budget_constraints && typeof t.budget_constraints === 'object'
    ? t.budget_constraints
    : {}) as Record<string, any>;
  const budgetConstraints = {
    max_cost_per_request_usd: toNumber(
      budgetRaw.max_cost_per_request_usd ?? budgetRaw.max_cost_per_request ?? budgetRaw.max_cost,
      1.0
    ),
    cost_optimization_priority:
      budgetRaw.cost_optimization_priority === 'high' ||
      budgetRaw.cost_optimization_priority === 'low'
        ? budgetRaw.cost_optimization_priority
        : 'medium',
  };

  return {
    ...t,
    expected_input_tokens: inputTokens,
    expected_output_tokens: outputTokens,
    latency_requirements: latencyRequirements,
    quality_requirements: qualityRequirements,
    budget_constraints: budgetConstraints,
  };
}

// ============================================================================
// Google Cloud Functions Entry Point
// ============================================================================

const handler = new ModelSelectionAgentHandler();

/**
 * Google Cloud Functions HTTP entry point.
 *
 * @example
 * // Deploy as Cloud Function
 * gcloud functions deploy model-selection-agent \
 *   --runtime nodejs20 \
 *   --trigger-http \
 *   --entry-point modelSelectionAgent
 */
export async function modelSelectionAgent(
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
 * Build ModelSelectionAgentInput from CLI parameters.
 * Used by agentics-cli to invoke the agent.
 */
export function buildInputFromCLI(params: ModelSelectCLIParams): ModelSelectionAgentInput {
  const now = new Date();
  const windowDuration = parseWindowDuration(params.window || '24h');
  const start = new Date(now.getTime() - windowDuration);

  // Parse task type
  const taskType = parseTaskType(params.task_type || 'general');

  // Build task context
  const taskContext: TaskContext = {
    task_type: taskType,
    complexity: parseComplexity(params.complexity || 'moderate'),
    expected_input_tokens: {
      min: Math.round((params.input_tokens || 1000) * 0.5),
      max: Math.round((params.input_tokens || 1000) * 2),
      avg: params.input_tokens || 1000,
    },
    expected_output_tokens: {
      min: Math.round((params.output_tokens || 500) * 0.5),
      max: Math.round((params.output_tokens || 500) * 2),
      avg: params.output_tokens || 500,
    },
    latency_requirements: {
      max_latency_ms: params.max_latency || 2000,
      strict: params.max_latency !== undefined,
    },
    quality_requirements: {
      min_quality_score: params.min_quality || 0.7,
      strict: params.min_quality !== undefined,
    },
    budget_constraints: {
      max_cost_per_request_usd: params.max_cost,
      cost_optimization_priority: parseCostPriority(params.cost_priority || 'medium'),
    },
  };

  // Build constraints from CLI flags
  const constraints: ModelSelectionConstraint[] = [];

  if (params.providers) {
    constraints.push({
      type: 'allowed_providers',
      value: params.providers.split(',').map(p => p.trim()),
      hard: true,
    });
  }

  if (params.models) {
    constraints.push({
      type: 'allowed_models',
      value: params.models.split(',').map(m => m.trim()),
      hard: true,
    });
  }

  if (params.max_cost !== undefined) {
    constraints.push({
      type: 'max_cost_per_request',
      value: params.max_cost,
      hard: true,
    });
  }

  if (params.min_quality !== undefined) {
    constraints.push({
      type: 'min_quality_threshold',
      value: params.min_quality,
      hard: true,
    });
  }

  if (params.max_latency !== undefined) {
    constraints.push({
      type: 'max_latency_ms',
      value: params.max_latency,
      hard: true,
    });
  }

  // Create mock performance history (would be fetched from Observatory in production)
  const performanceHistory = createMockPerformanceHistory();

  return {
    execution_ref: `cli-${Date.now()}`,
    time_window: {
      start: start.toISOString(),
      end: now.toISOString(),
      granularity: windowDuration > 86400000 ? 'day' : 'hour',
    },
    task_context: taskContext,
    target_services: ['default'],
    constraints,
    performance_history: performanceHistory,
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

function parseTaskType(type: string): TaskType {
  const validTypes: TaskType[] = [
    'code_generation', 'code_review', 'text_generation', 'text_summarization',
    'question_answering', 'data_extraction', 'classification', 'translation',
    'analysis', 'creative_writing', 'reasoning', 'multi_turn_conversation', 'general'
  ];

  const normalized = type.toLowerCase().replace(/-/g, '_');
  return validTypes.includes(normalized as TaskType) ? normalized as TaskType : 'general';
}

function parseComplexity(complexity: string): 'simple' | 'moderate' | 'complex' | 'expert' {
  const normalized = complexity.toLowerCase();
  if (['simple', 'moderate', 'complex', 'expert'].includes(normalized)) {
    return normalized as 'simple' | 'moderate' | 'complex' | 'expert';
  }
  return 'moderate';
}

function parseCostPriority(priority: string): 'high' | 'medium' | 'low' {
  const normalized = priority.toLowerCase();
  if (['high', 'medium', 'low'].includes(normalized)) {
    return normalized as 'high' | 'medium' | 'low';
  }
  return 'medium';
}

function createMockPerformanceHistory(): ModelPerformanceHistory {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 86400000);

  return {
    by_model: {
      'claude-3-opus': {
        model_id: 'claude-3-opus',
        provider: 'anthropic',
        request_count: 2500,
        latency: {
          p50_ms: 2200,
          p95_ms: 3500,
          p99_ms: 5000,
          avg_ms: 2500,
        },
        cost: {
          total_cost_usd: 1200.00,
          avg_cost_per_request_usd: 0.48,
          input_cost_per_1k_tokens: 0.015,
          output_cost_per_1k_tokens: 0.075,
        },
        quality: {
          avg_score: 0.95,
          error_rate: 0.01,
          success_rate: 0.99,
          user_satisfaction: 4.8,
        },
        tokens: {
          total_input: 5000000,
          total_output: 1250000,
          avg_input: 2000,
          avg_output: 500,
        },
        availability: {
          uptime_pct: 99.9,
          timeout_rate: 0.02,
          rate_limit_hit_rate: 0.01,
        },
      },
      'claude-3-5-sonnet': {
        model_id: 'claude-3-5-sonnet',
        provider: 'anthropic',
        request_count: 15000,
        latency: {
          p50_ms: 1000,
          p95_ms: 1800,
          p99_ms: 2500,
          avg_ms: 1200,
        },
        cost: {
          total_cost_usd: 2000.00,
          avg_cost_per_request_usd: 0.133,
          input_cost_per_1k_tokens: 0.003,
          output_cost_per_1k_tokens: 0.015,
        },
        quality: {
          avg_score: 0.93,
          error_rate: 0.015,
          success_rate: 0.985,
          user_satisfaction: 4.6,
        },
        tokens: {
          total_input: 30000000,
          total_output: 7500000,
          avg_input: 2000,
          avg_output: 500,
        },
        availability: {
          uptime_pct: 99.8,
          timeout_rate: 0.01,
          rate_limit_hit_rate: 0.02,
        },
      },
      'claude-3-haiku': {
        model_id: 'claude-3-haiku',
        provider: 'anthropic',
        request_count: 80000,
        latency: {
          p50_ms: 250,
          p95_ms: 450,
          p99_ms: 700,
          avg_ms: 300,
        },
        cost: {
          total_cost_usd: 400.00,
          avg_cost_per_request_usd: 0.005,
          input_cost_per_1k_tokens: 0.00025,
          output_cost_per_1k_tokens: 0.00125,
        },
        quality: {
          avg_score: 0.82,
          error_rate: 0.025,
          success_rate: 0.975,
          user_satisfaction: 4.1,
        },
        tokens: {
          total_input: 160000000,
          total_output: 40000000,
          avg_input: 2000,
          avg_output: 500,
        },
        availability: {
          uptime_pct: 99.95,
          timeout_rate: 0.005,
          rate_limit_hit_rate: 0.005,
        },
      },
      'gpt-4o': {
        model_id: 'gpt-4o',
        provider: 'openai',
        request_count: 10000,
        latency: {
          p50_ms: 800,
          p95_ms: 1200,
          p99_ms: 1800,
          avg_ms: 900,
        },
        cost: {
          total_cost_usd: 1500.00,
          avg_cost_per_request_usd: 0.15,
          input_cost_per_1k_tokens: 0.005,
          output_cost_per_1k_tokens: 0.015,
        },
        quality: {
          avg_score: 0.92,
          error_rate: 0.02,
          success_rate: 0.98,
          user_satisfaction: 4.5,
        },
        tokens: {
          total_input: 20000000,
          total_output: 5000000,
          avg_input: 2000,
          avg_output: 500,
        },
        availability: {
          uptime_pct: 99.7,
          timeout_rate: 0.015,
          rate_limit_hit_rate: 0.03,
        },
      },
    },
    by_task_type: {
      'code_generation': {
        task_type: 'code_generation',
        top_models: [
          { model_id: 'claude-3-opus', score: 0.98, request_count: 500 },
          { model_id: 'claude-3-5-sonnet', score: 0.96, request_count: 3000 },
          { model_id: 'gpt-4o', score: 0.94, request_count: 2000 },
        ],
        avg_quality_score: 0.94,
        avg_latency_ms: 1500,
        avg_cost_usd: 0.15,
      },
      'reasoning': {
        task_type: 'reasoning',
        top_models: [
          { model_id: 'claude-3-opus', score: 0.98, request_count: 800 },
          { model_id: 'claude-3-5-sonnet', score: 0.94, request_count: 2000 },
          { model_id: 'gpt-4o', score: 0.92, request_count: 1500 },
        ],
        avg_quality_score: 0.92,
        avg_latency_ms: 2000,
        avg_cost_usd: 0.20,
      },
      'general': {
        task_type: 'general',
        top_models: [
          { model_id: 'claude-3-5-sonnet', score: 0.92, request_count: 8000 },
          { model_id: 'gpt-4o', score: 0.90, request_count: 5000 },
          { model_id: 'claude-3-haiku', score: 0.75, request_count: 60000 },
        ],
        avg_quality_score: 0.85,
        avg_latency_ms: 600,
        avg_cost_usd: 0.05,
      },
    },
    total_requests: 107500,
    data_window: {
      start: dayAgo.toISOString(),
      end: now.toISOString(),
      granularity: 'hour',
    },
  };
}
