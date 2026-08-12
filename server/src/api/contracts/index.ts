/**
 * API Contract Definitions
 *
 * Strict TypeScript schemas for all versioned API endpoints.
 * Each contract defines:
 *   - Request schema (input validation)
 *   - Response schema (output guarantee)
 *   - Version tag
 *   - Deprecation metadata
 */

// ─── Common ──────────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta: ApiMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiMeta {
  version: string;
  traceId: string;
  timestamp: string;
  durationMs?: number;
  deprecated?: boolean;
  deprecationNotice?: string;
}

// ─── Compile ─────────────────────────────────────────────────────────────────

export interface CompileRequest {
  intent: string;
  constraints?: string[];
  projectId?: string;
}

export interface CompileResponse {
  artifact: {
    id: string;
    blueprint: {
      title: string;
      genre: string;
      mechanics: string[];
    };
    scripts: { total: number; lines: number };
    assets: { objects: number };
    validation: { score: number; passed: boolean };
    /**
     * SIM-TRUTH-1. This declared `{ engagement: number }`, a required numeric
     * field carrying a score that measured nothing. Both compile handlers now
     * report the evidence kind, the observed counts and the explicit statement
     * that no player was observed, so a client reads what the simulation saw
     * rather than a number standing in for a judgement.
     */
    simulation: {
      evidenceKind: "deterministic-simulation";
      observed: {
        totalTicks: number;
        mechanicsDeclared: number;
        mechanicsExercised: number;
        npcsDeclared: number;
        npcsInteracted: number;
        loopCompleteEventEmitted: boolean;
        frictionEvents: number;
        currencyGainEvents: number;
        levelUpEvents: number;
      };
      player: { status: "not-observed"; reason: string };
    };
    economy: { stability: number; health?: number };
  };
  project: {
    name: string;
    files: number;
    valid: boolean;
    structure: unknown;
  };
  pipeline: unknown;
}

// ─── Plan ────────────────────────────────────────────────────────────────────

export interface PlanCreateRequest {
  intent: string;
  constraints?: string[];
  requiredAgents?: string[];
  projectId?: string;
  context?: Record<string, unknown>;
}

export interface PlanCreateResponse {
  planId: string;
  goal: string;
  estimatedSteps: number;
  tasks: Array<{
    id: string;
    agent: string;
    type: string;
    dependencies: string[];
    status: string;
  }>;
}

export interface PlanExecuteRequest {
  planId: string;
  options?: {
    stopOnFailure?: boolean;
    maxRetries?: number;
  };
}

export interface PlanExecuteResponse {
  planId: string;
  success: boolean;
  completedNodes: number;
  failedNodes: number;
  totalDurationMs: number;
  taskStats: {
    total: number;
    done: number;
    failed: number;
    pending: number;
    running: number;
  };
}

// ─── Generate Game ───────────────────────────────────────────────────────────

export interface GenerateGameRequest {
  name: string;
  description?: string;
  gameType: string;
  genre: string;
  targetAudience?: string;
  mechanics?: string[];
  projectId?: string;
}

export interface GenerateGameResponse {
  executionId: string;
  blueprintId: string;
  status: string;
  startedAt: string;
}

// ─── Memory ──────────────────────────────────────────────────────────────────

export interface MemoryStoreRequest {
  agent: string;
  content: Record<string, unknown>;
  projectId?: string;
  tags?: string[];
}

export interface MemoryRetrieveRequest {
  agent: string;
  query: string;
  projectId?: string;
  limit?: number;
}

export interface MemoryRetrieveResponse {
  results: Array<{
    id: string;
    content: Record<string, unknown>;
    relevance: number;
    tags: string[];
  }>;
  count: number;
}

// ─── Evaluation ──────────────────────────────────────────────────────────────

export interface EvaluateRequest {
  agent: string;
  output: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface EvaluateResponse {
  score: number;
  passed: boolean;
  issues: Array<{ severity: string; message: string }>;
  recommendations: string[];
}

// ─── Contract Registry ───────────────────────────────────────────────────────

export interface ContractDefinition {
  endpoint: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  version: string;
  deprecated?: boolean;
  deprecationDate?: string;
  requestSchema?: string;
  responseSchema?: string;
}

export const CONTRACT_REGISTRY: ContractDefinition[] = [
  {
    endpoint: "/v1/compile",
    method: "POST",
    version: "1.0.0",
    requestSchema: "CompileRequest",
    responseSchema: "CompileResponse",
  },
  {
    endpoint: "/v1/plan/create",
    method: "POST",
    version: "1.0.0",
    requestSchema: "PlanCreateRequest",
    responseSchema: "PlanCreateResponse",
  },
  {
    endpoint: "/v1/plan/execute",
    method: "POST",
    version: "1.0.0",
    requestSchema: "PlanExecuteRequest",
    responseSchema: "PlanExecuteResponse",
  },
  { endpoint: "/v1/plan/:id", method: "GET", version: "1.0.0" },
  {
    endpoint: "/v1/generate",
    method: "POST",
    version: "1.0.0",
    requestSchema: "GenerateGameRequest",
    responseSchema: "GenerateGameResponse",
  },
  {
    endpoint: "/v1/memory/store",
    method: "POST",
    version: "1.0.0",
    requestSchema: "MemoryStoreRequest",
  },
  {
    endpoint: "/v1/memory/retrieve",
    method: "POST",
    version: "1.0.0",
    requestSchema: "MemoryRetrieveRequest",
    responseSchema: "MemoryRetrieveResponse",
  },
  {
    endpoint: "/v1/evaluate",
    method: "POST",
    version: "1.0.0",
    requestSchema: "EvaluateRequest",
    responseSchema: "EvaluateResponse",
  },
];
