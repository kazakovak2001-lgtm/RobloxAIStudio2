/**
 * AI Orchestrator Layer — Architecture & Interfaces
 *
 * Multi-agent orchestration system for AI-assisted development.
 * Designed for future expansion with pluggable agents.
 */

// ─── Agent Event Protocol ────────────────────────────────────────────────────

export interface AgentEvent<T = unknown> {
  id: string;
  timestamp: string;
  source: AgentRole;
  target: AgentRole | "broadcast";
  type: AgentEventType;
  payload: T;
  correlationId: string;
}

export type AgentEventType =
  | "task.assigned"
  | "task.completed"
  | "task.failed"
  | "validation.request"
  | "validation.result"
  | "generation.request"
  | "generation.result"
  | "refactor.request"
  | "refactor.result"
  | "docs.update.request"
  | "docs.update.result"
  | "orchestration.abort"
  | "orchestration.retry";

export type AgentRole =
  | "orchestrator"
  | "generator"
  | "validator"
  | "refactor"
  | "documentation";

// ─── Agent Interface ─────────────────────────────────────────────────────────

export interface Agent {
  readonly role: AgentRole;
  readonly name: string;

  /**
   * Initialize the agent with configuration.
   * Called once before any task processing.
   */
  initialize(config: AgentConfig): Promise<void>;

  /**
   * Process an incoming event.
   * Agents are stateless — all context arrives via the event.
   */
  handleEvent(event: AgentEvent): Promise<AgentResponse>;

  /**
   * Health check for the agent.
   */
  healthCheck(): Promise<AgentHealth>;
}

export interface AgentConfig {
  maxRetries: number;
  timeoutMs: number;
  validationRequired: boolean;
}

export interface AgentResponse {
  success: boolean;
  events: AgentEvent[];
  artifacts: GeneratedArtifact[];
  errors: AgentError[];
}

export interface AgentHealth {
  role: AgentRole;
  status: "healthy" | "degraded" | "unavailable";
  lastActivity: string;
  errorRate: number;
}

export interface AgentError {
  code: string;
  message: string;
  recoverable: boolean;
  context?: Record<string, unknown>;
}

export interface GeneratedArtifact {
  path: string;
  content: string;
  blueprintId: string;
  blueprintVersion: string;
  checksum: string;
}

// ─── Orchestrator Interface ──────────────────────────────────────────────────

export interface Orchestrator {
  /**
   * Register an agent with the orchestrator.
   */
  registerAgent(agent: Agent): void;

  /**
   * Execute a workflow: plan → generate → validate → emit.
   * The orchestrator coordinates all agents through this pipeline.
   */
  executeWorkflow(request: WorkflowRequest): Promise<WorkflowResult>;

  /**
   * Get the current status of all registered agents.
   */
  getAgentStatus(): Promise<AgentHealth[]>;

  /**
   * Abort a running workflow by correlation ID.
   */
  abortWorkflow(correlationId: string): Promise<void>;
}

export interface WorkflowRequest {
  correlationId: string;
  type: "generate" | "refactor" | "document" | "validate";
  input: WorkflowInput;
  options: WorkflowOptions;
}

export interface WorkflowInput {
  blueprintId?: string;
  files?: string[];
  description: string;
  context: Record<string, unknown>;
}

export interface WorkflowOptions {
  dryRun: boolean;
  requireApproval: boolean;
  maxConcurrentAgents: number;
  timeoutMs: number;
}

export interface WorkflowResult {
  correlationId: string;
  status: "completed" | "failed" | "aborted" | "pending_approval";
  phases: PhaseResult[];
  artifacts: GeneratedArtifact[];
  errors: AgentError[];
  duration: number;
}

export interface PhaseResult {
  phase: "plan" | "generate" | "validate" | "emit";
  status: "completed" | "failed" | "skipped";
  agent: AgentRole;
  duration: number;
  errors: AgentError[];
}

// ─── Orchestration Rules ─────────────────────────────────────────────────────

/**
 * Rules governing orchestrator behavior:
 *
 * 1. The orchestrator is the sole entry point for all multi-agent workflows.
 * 2. No agent may directly invoke another agent — all communication routes
 *    through the orchestrator via structured JSON events.
 * 3. Each agent has a single responsibility and cannot exceed its role.
 * 4. All generated outputs must pass the validation agent before being emitted.
 * 5. No agent can directly commit code without orchestration approval.
 * 6. Agents are stateless between invocations — context flows via events.
 * 7. Parallel execution is permitted only when agents have zero data dependency.
 * 8. Failures are isolated — one agent failure does not cascade.
 * 9. The orchestrator implements retry with exponential backoff for recoverable errors.
 * 10. Partial results are preserved when possible — fail gracefully.
 */

// ─── Pipeline Stage Types (for orchestrator coordination) ────────────────────

export interface PipelineStage<TInput, TOutput> {
  name: string;
  agent: AgentRole;
  preconditions: Array<(input: TInput) => boolean>;
  postconditions: Array<(output: TOutput) => boolean>;
  execute: (input: TInput) => Promise<TOutput>;
}

export interface PipelineManifest {
  stages: Array<{
    name: string;
    status: "completed" | "failed" | "skipped" | "pending";
    agent: AgentRole;
    durationMs: number;
    inputHash: string;
    outputHash: string;
    error?: string;
  }>;
  totalDurationMs: number;
  completedAt: string;
}
