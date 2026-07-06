/**
 * shared/events/index.ts
 *
 * Canonical event type definitions for real-time communication.
 * Consumed by both frontend (Socket.io client) and backend (Socket.io server).
 * NO implementations — types only.
 */

// ─── Generation Pipeline Events ─────────────────────────────────────────────

export interface GenerationStartEvent {
  pipelineId: string;
  projectId: string;
  startedAt: string;
}

export interface GenerationProgressEvent {
  pipelineId: string;
  stepId: string;
  agentId: string;
  status: "started" | "completed" | "failed";
  progress: number; // 0-100
  timestamp: string;
}

export interface GenerationCompleteEvent {
  pipelineId: string;
  projectId: string;
  success: boolean;
  totalDurationMs: number;
  completedSteps: number;
  failedSteps: number;
}

export interface GenerationErrorEvent {
  pipelineId: string;
  error: string;
  stepId?: string;
  agentId?: string;
  timestamp: string;
}

// ─── Validation Events ──────────────────────────────────────────────────────

export interface ValidationErrorEvent {
  pipelineId: string;
  score: number;
  passed: boolean;
  errors: string[];
  warnings: string[];
}

// ─── Trace Events (Observability) ───────────────────────────────────────────

export interface TraceEvent {
  executionId: string;
  nodeId: string;
  agentId: string;
  eventType: string;
  timestamp: number;
  durationMs?: number;
  evaluationScore?: number;
  error?: string;
}

// ─── Studio Bridge Events ───────────────────────────────────────────────────

export interface StudioConnectedEvent {
  studioId: string;
  projectId: string;
  timestamp: string;
}

export interface StudioSyncEvent {
  studioId: string;
  direction: "studio-to-compiler" | "compiler-to-studio";
  changeCount: number;
  timestamp: string;
}

// ─── Event Map (for type-safe Socket.io) ────────────────────────────────────

export interface ServerToClientEvents {
  "pipeline.started": (data: GenerationStartEvent) => void;
  "step.started": (data: GenerationProgressEvent) => void;
  "step.completed": (data: GenerationProgressEvent) => void;
  "step.failed": (data: GenerationProgressEvent) => void;
  "pipeline.completed": (data: GenerationCompleteEvent) => void;
  "pipeline.failed": (data: GenerationErrorEvent) => void;
  "validation.error": (data: ValidationErrorEvent) => void;
  "trace.event": (data: TraceEvent) => void;
  "studio.connected": (data: StudioConnectedEvent) => void;
  "studio.sync.update": (data: StudioSyncEvent) => void;
}

export interface ClientToServerEvents {
  "project:join": (data: { projectId: string }) => void;
  "project:leave": (data: { projectId: string }) => void;
}
