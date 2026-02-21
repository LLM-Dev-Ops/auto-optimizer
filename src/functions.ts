/**
 * Cloud Functions Entry Point — auto-optimizer-agents
 *
 * Unified HTTP handler for all 3 optimization agents, deployed as a single
 * Google Cloud Function named "auto-optimizer-agents".
 *
 * Routes:
 *   POST /v1/auto-optimizer/self-optimize  -> Self-Optimizing Agent
 *   POST /v1/auto-optimizer/token          -> Token Optimization Agent
 *   POST /v1/auto-optimizer/model-select   -> Model Selection Agent
 *   GET  /health                           -> Health check
 *
 * Deploy:
 *   gcloud functions deploy auto-optimizer-agents \
 *     --runtime nodejs20 --trigger-http --region us-central1 \
 *     --project agentics-dev --entry-point handler \
 *     --memory 512MB --timeout 60s --no-allow-unauthenticated
 *
 * @module functions
 */

import * as crypto from 'crypto';

import { SelfOptimizingAgentHandler } from './agents/self-optimizing-agent/handler';
import { TokenOptimizationAgentHandler } from './agents/token-optimization-agent/handler';
import { ModelSelectionAgentHandler } from './agents/model-selection-agent/handler';

// ============================================================================
// Constants
// ============================================================================

const SERVICE_NAME = 'auto-optimizer-agents';
const HEALTH_AGENTS = ['self-optimize', 'token', 'model-select'] as const;

// Agent name mapping for layers_executed
const AGENT_LAYER_NAMES: Record<string, string> = {
  '/v1/auto-optimizer/self-optimize': 'SELF_OPTIMIZE',
  '/v1/auto-optimizer/token': 'TOKEN',
  '/v1/auto-optimizer/model-select': 'MODEL_SELECT',
};

// ============================================================================
// Lazy-initialized agent handlers (singleton)
// ============================================================================

let selfOptimizeHandler: SelfOptimizingAgentHandler | null = null;
let tokenHandler: TokenOptimizationAgentHandler | null = null;
let modelSelectHandler: ModelSelectionAgentHandler | null = null;

function getSelfOptimizeHandler(): SelfOptimizingAgentHandler {
  if (!selfOptimizeHandler) selfOptimizeHandler = new SelfOptimizingAgentHandler();
  return selfOptimizeHandler;
}

function getTokenHandler(): TokenOptimizationAgentHandler {
  if (!tokenHandler) tokenHandler = new TokenOptimizationAgentHandler();
  return tokenHandler;
}

function getModelSelectHandler(): ModelSelectionAgentHandler {
  if (!modelSelectHandler) modelSelectHandler = new ModelSelectionAgentHandler();
  return modelSelectHandler;
}

// ============================================================================
// Types — Cloud Functions request/response (Express-compatible)
// ============================================================================

interface CFRequest {
  method: string;
  path: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, string>;
}

interface CFResponse {
  set(headers: Record<string, string>): CFResponse;
  status(code: number): CFResponse;
  json(data: unknown): void;
  send(body: string): void;
  end(): void;
}

// ============================================================================
// Execution Metadata Builder
// ============================================================================

interface ExecutionMetadata {
  trace_id: string;
  timestamp: string;
  service: string;
  execution_id: string;
}

interface LayerEntry {
  layer: string;
  status: 'completed' | 'failed';
  duration_ms?: number;
}

function buildExecutionMetadata(req: CFRequest): ExecutionMetadata {
  const correlationHeader = req.headers['x-correlation-id'];
  const traceId = (typeof correlationHeader === 'string' ? correlationHeader : undefined)
    || crypto.randomUUID();

  return {
    trace_id: traceId,
    timestamp: new Date().toISOString(),
    service: SERVICE_NAME,
    execution_id: crypto.randomUUID(),
  };
}

// ============================================================================
// CORS Helper
// ============================================================================

function setCors(res: CFResponse): void {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Correlation-Id, X-Execution-Id, X-Parent-Span-Id',
  });
}

// ============================================================================
// Normalize path
// ============================================================================

function normalizePath(raw: string): string {
  // Strip query string
  const qIdx = raw.indexOf('?');
  let p = qIdx !== -1 ? raw.substring(0, qIdx) : raw;
  // Strip trailing slash
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

// ============================================================================
// Route: Health
// ============================================================================

function handleHealth(req: CFRequest, res: CFResponse): void {
  const meta = buildExecutionMetadata(req);

  res.status(200).json({
    status: 'healthy',
    service: SERVICE_NAME,
    agents: [...HEALTH_AGENTS],
    timestamp: meta.timestamp,
    execution_metadata: meta,
    layers_executed: [
      { layer: 'AGENT_ROUTING', status: 'completed' },
    ],
  });
}

// ============================================================================
// Route: Agent invocation
// ============================================================================

async function routeAgent(
  path: string,
  req: CFRequest,
  res: CFResponse,
): Promise<void> {
  const meta = buildExecutionMetadata(req);
  const startTime = Date.now();

  const layers: LayerEntry[] = [
    { layer: 'AGENT_ROUTING', status: 'completed' },
  ];

  const agentLayerName = AGENT_LAYER_NAMES[path];

  // Select handler
  let agentHandler: SelfOptimizingAgentHandler | TokenOptimizationAgentHandler | ModelSelectionAgentHandler;
  switch (path) {
    case '/v1/auto-optimizer/self-optimize':
      agentHandler = getSelfOptimizeHandler();
      break;
    case '/v1/auto-optimizer/token':
      agentHandler = getTokenHandler();
      break;
    case '/v1/auto-optimizer/model-select':
      agentHandler = getModelSelectHandler();
      break;
    default:
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: `Path not found: ${path}` },
        execution_metadata: meta,
        layers_executed: [{ layer: 'AGENT_ROUTING', status: 'failed' }],
      });
      return;
  }

  // Build internal request — agents expect /recommend as default action
  const agentRequest = {
    method: req.method,
    path: '/recommend',
    headers: flattenHeaders(req.headers),
    body: req.body as string | object | undefined,
    query: req.query,
  };

  try {
    const agentResponse = await agentHandler.handle(agentRequest);
    const durationMs = Date.now() - startTime;

    layers.push({
      layer: `AUTO_OPTIMIZER_${agentLayerName}`,
      status: agentResponse.status >= 200 && agentResponse.status < 400 ? 'completed' : 'failed',
      duration_ms: durationMs,
    });

    // Parse agent body
    let agentData: unknown;
    try {
      agentData = JSON.parse(agentResponse.body);
    } catch {
      agentData = agentResponse.body;
    }

    res.status(agentResponse.status).json({
      data: agentData,
      execution_metadata: meta,
      layers_executed: layers,
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    layers.push({
      layer: `AUTO_OPTIMIZER_${agentLayerName}`,
      status: 'failed',
      duration_ms: durationMs,
    });

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${SERVICE_NAME}] Agent error on ${path}:`, errorMessage);

    res.status(500).json({
      error: { code: 'AGENT_EXECUTION_FAILED', message: errorMessage },
      execution_metadata: meta,
      layers_executed: layers,
    });
  }
}

// ============================================================================
// Header flattening (Cloud Functions headers can be string | string[])
// ============================================================================

function flattenHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      flat[key] = value;
    } else if (Array.isArray(value) && value.length > 0) {
      flat[key] = value[0];
    }
  }
  return flat;
}

// ============================================================================
// Main Handler — Cloud Functions entry point
// ============================================================================

export async function handler(req: CFRequest, res: CFResponse): Promise<void> {
  // CORS
  setCors(res);

  // Preflight
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const path = normalizePath(req.path || req.url || '/');

  // Route
  switch (path) {
    case '/health':
      handleHealth(req, res);
      return;

    case '/v1/auto-optimizer/self-optimize':
    case '/v1/auto-optimizer/token':
    case '/v1/auto-optimizer/model-select':
      if (req.method !== 'POST') {
        const meta = buildExecutionMetadata(req);
        res.status(405).json({
          error: { code: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} not allowed. Use POST.` },
          execution_metadata: meta,
          layers_executed: [{ layer: 'AGENT_ROUTING', status: 'failed' }],
        });
        return;
      }
      await routeAgent(path, req, res);
      return;

    default: {
      const meta = buildExecutionMetadata(req);
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: `Path not found: ${path}`,
          available_routes: [
            '/health',
            '/v1/auto-optimizer/self-optimize',
            '/v1/auto-optimizer/token',
            '/v1/auto-optimizer/model-select',
          ],
        },
        execution_metadata: meta,
        layers_executed: [{ layer: 'AGENT_ROUTING', status: 'failed' }],
      });
    }
  }
}
