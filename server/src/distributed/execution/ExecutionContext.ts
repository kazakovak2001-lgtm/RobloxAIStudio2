/**
 * ExecutionContext.ts
 *
 * Isolated execution environment for a single PlanExecutor job.
 * Each job gets its own context — no shared mutable state across jobs.
 *
 * Contains:
 *   - Job identity (executionId, jobId)
 *   - Isolated memory snapshot
 *   - Agent state per node
 *   - Evaluation cache
 *   - Execution metrics
 *
 * Design: fully serializable for potential cross-process transport.
 */

export interface ExecutionContextConfig {
  executionId: string;
  jobId: string;
  projectId?: string;
  intent: string;
  constraints: string[];
  priority: number;
  maxRetries: number;
  timeoutMs: number;
}

export interface AgentNodeState {
  nodeId: string;
  agent: string;
  status: "pending" | "running" | "done" | "failed";
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  durationMs?: number;
  evaluationScore?: number;
  error?: string;
  attempts: number;
}

export interface ExecutionMetrics {
  startedAt: number;
  completedAt?: number;
  totalDurationMs?: number;
  nodesCompleted: number;
  nodesFailed: number;
  totalNodes: number;
  averageNodeDurationMs: number;
  peakMemoryUsage?: number;
}

export class ExecutionContext {
  readonly executionId: string;
  readonly jobId: string;
  readonly projectId: string | undefined;
  readonly intent: string;
  readonly constraints: string[];
  readonly priority: number;
  readonly maxRetries: number;
  readonly timeoutMs: number;

  private nodeStates: Map<string, AgentNodeState> = new Map();
  private memorySnapshot: Record<string, unknown> = {};
  private evaluationCache: Map<string, { score: number; passed: boolean }> =
    new Map();
  private _metrics: ExecutionMetrics;
  private _aborted = false;

  constructor(config: ExecutionContextConfig) {
    this.executionId = config.executionId;
    this.jobId = config.jobId;
    this.projectId = config.projectId;
    this.intent = config.intent;
    this.constraints = config.constraints;
    this.priority = config.priority;
    this.maxRetries = config.maxRetries;
    this.timeoutMs = config.timeoutMs;
    this._metrics = {
      startedAt: Date.now(),
      nodesCompleted: 0,
      nodesFailed: 0,
      totalNodes: 0,
      averageNodeDurationMs: 0,
    };
  }

  // ─── Node State Management ────────────────────────────────────────────

  registerNode(nodeId: string, agent: string): void {
    this.nodeStates.set(nodeId, {
      nodeId,
      agent,
      status: "pending",
      attempts: 0,
    });
    this._metrics.totalNodes++;
  }

  markNodeRunning(nodeId: string, input: Record<string, unknown>): void {
    const node = this.nodeStates.get(nodeId);
    if (node) {
      node.status = "running";
      node.input = input;
      node.attempts++;
    }
  }

  markNodeDone(
    nodeId: string,
    output: Record<string, unknown>,
    durationMs: number,
    evaluationScore?: number,
  ): void {
    const node = this.nodeStates.get(nodeId);
    if (node) {
      node.status = "done";
      node.output = output;
      node.durationMs = durationMs;
      node.evaluationScore = evaluationScore;
      this._metrics.nodesCompleted++;
      this.updateAverageDuration(durationMs);
    }
  }

  markNodeFailed(nodeId: string, error: string, durationMs: number): void {
    const node = this.nodeStates.get(nodeId);
    if (node) {
      node.status = "failed";
      node.error = error;
      node.durationMs = durationMs;
      this._metrics.nodesFailed++;
    }
  }

  getNodeState(nodeId: string): AgentNodeState | undefined {
    return this.nodeStates.get(nodeId);
  }

  getAllNodeStates(): AgentNodeState[] {
    return [...this.nodeStates.values()];
  }

  // ─── Memory Isolation ─────────────────────────────────────────────────

  setMemorySnapshot(snapshot: Record<string, unknown>): void {
    this.memorySnapshot = { ...snapshot };
  }

  getMemorySnapshot(): Record<string, unknown> {
    return { ...this.memorySnapshot };
  }

  updateMemory(key: string, value: unknown): void {
    this.memorySnapshot[key] = value;
  }

  // ─── Evaluation Cache ─────────────────────────────────────────────────

  cacheEvaluation(nodeId: string, score: number, passed: boolean): void {
    this.evaluationCache.set(nodeId, { score, passed });
  }

  getEvaluation(
    nodeId: string,
  ): { score: number; passed: boolean } | undefined {
    return this.evaluationCache.get(nodeId);
  }

  // ─── Abort / Timeout ──────────────────────────────────────────────────

  abort(): void {
    this._aborted = true;
  }

  get isAborted(): boolean {
    return this._aborted;
  }

  get isTimedOut(): boolean {
    return Date.now() - this._metrics.startedAt > this.timeoutMs;
  }

  get shouldStop(): boolean {
    return this._aborted || this.isTimedOut;
  }

  // ─── Metrics ──────────────────────────────────────────────────────────

  complete(): void {
    this._metrics.completedAt = Date.now();
    this._metrics.totalDurationMs =
      this._metrics.completedAt - this._metrics.startedAt;
  }

  get metrics(): Readonly<ExecutionMetrics> {
    return this._metrics;
  }

  // ─── Serialization ────────────────────────────────────────────────────

  serialize(): string {
    return JSON.stringify({
      executionId: this.executionId,
      jobId: this.jobId,
      projectId: this.projectId,
      intent: this.intent,
      constraints: this.constraints,
      priority: this.priority,
      maxRetries: this.maxRetries,
      timeoutMs: this.timeoutMs,
      nodeStates: [...this.nodeStates.entries()],
      memorySnapshot: this.memorySnapshot,
      evaluationCache: [...this.evaluationCache.entries()],
      metrics: this._metrics,
      aborted: this._aborted,
    });
  }

  static deserialize(json: string): ExecutionContext {
    const data = JSON.parse(json);
    const ctx = new ExecutionContext({
      executionId: data.executionId,
      jobId: data.jobId,
      projectId: data.projectId,
      intent: data.intent,
      constraints: data.constraints,
      priority: data.priority,
      maxRetries: data.maxRetries,
      timeoutMs: data.timeoutMs,
    });
    ctx.nodeStates = new Map(data.nodeStates);
    ctx.memorySnapshot = data.memorySnapshot;
    ctx.evaluationCache = new Map(data.evaluationCache);
    ctx._metrics = data.metrics;
    ctx._aborted = data.aborted;
    return ctx;
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private updateAverageDuration(newDuration: number): void {
    const n = this._metrics.nodesCompleted;
    const prev = this._metrics.averageNodeDurationMs;
    this._metrics.averageNodeDurationMs = prev + (newDuration - prev) / n;
  }
}
