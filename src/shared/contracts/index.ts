/**
 * shared/contracts/index.ts
 *
 * Canonical API contracts shared between frontend and backend.
 * NO implementations — types only.
 */

// ─── Standard Response Envelope ─────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
  meta?: {
    version: string;
    traceId: string;
    timestamp: string;
    durationMs?: number;
    deprecated?: boolean;
  };
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
    blueprint: { title: string; genre: string; mechanics: string[] };
    scripts: { total: number; lines: number };
    assets: { objects: number };
    validation: { score: number; passed: boolean };
  };
  project: { name: string; files: number; valid: boolean };
}

// ─── Generation ──────────────────────────────────────────────────────────────

export interface StartGenerationRequest {
  blueprintId: string;
  userId: string;
}

export interface StartGenerationResponse {
  executionId: string;
  status: string;
  startedAt: string;
}

// ─── Plan ────────────────────────────────────────────────────────────────────

export interface CreatePlanRequest {
  intent: string;
  constraints?: string[];
  projectId?: string;
}

export interface CreatePlanResponse {
  planId: string;
  goal: string;
  estimatedSteps: number;
  tasks: Array<{ id: string; agent: string; type: string; status: string }>;
}

// ─── Health ──────────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: "healthy" | "degraded";
  timestamp: string;
  llm: string;
}
