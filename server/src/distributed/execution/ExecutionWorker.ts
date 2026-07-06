/**
 * ExecutionWorker.ts
 *
 * Worker node that polls ExecutionJobQueue and runs PlanExecutor jobs
 * in fully isolated ExecutionContexts.
 *
 * Key properties:
 *   - Stateless: all state comes from ExecutionContext per job
 *   - Isolated: no cross-job contamination (fresh PlanExecutor per job)
 *   - Fault-tolerant: failures are contained within the job boundary
 *   - Self-healing: timeout detection and graceful abort
 */

import { PlanExecutor } from "../../planning/execution/PlanExecutor";
import { PlannerEngine } from "../../planning/core/PlannerEngine";
import { AgentRegistry } from "../../agents/core/AgentRegistry";
import {
  ExecutionContext,
  type ExecutionContextConfig,
} from "./ExecutionContext";
import { ExecutionJobQueue, type ExecutionJob } from "./ExecutionJobQueue";

export type WorkerState = "idle" | "processing" | "stopped" | "draining";

export interface WorkerConfig {
  pollIntervalMs: number;
  maxConcurrent: number;
  shutdownGracePeriodMs: number;
}

const DEFAULT_WORKER_CONFIG: WorkerConfig = {
  pollIntervalMs: 200,
  maxConcurrent: 1,
  shutdownGracePeriodMs: 30_000,
};

export interface WorkerMetrics {
  workerId: string;
  state: WorkerState;
  jobsProcessed: number;
  jobsFailed: number;
  currentJobId: string | null;
  uptimeMs: number;
  lastActivityAt: number;
  averageJobDurationMs: number;
}

export class ExecutionWorker {
  readonly workerId: string;
  private state: WorkerState = "stopped";
  private config: WorkerConfig;
  private queue: ExecutionJobQueue;
  private agentRegistry: AgentRegistry;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private currentContext: ExecutionContext | null = null;
  private startedAt = 0;
  private lastActivityAt = 0;
  private jobsProcessed = 0;
  private jobsFailed = 0;
  private totalJobDurationMs = 0;

  constructor(
    workerId: string,
    queue: ExecutionJobQueue,
    agentRegistry: AgentRegistry,
    config?: Partial<WorkerConfig>,
  ) {
    this.workerId = workerId;
    this.queue = queue;
    this.agentRegistry = agentRegistry;
    this.config = { ...DEFAULT_WORKER_CONFIG, ...config };
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  start(): void {
    if (this.state === "processing" || this.state === "idle") return;

    this.state = "idle";
    this.startedAt = Date.now();
    this.lastActivityAt = Date.now();

    this.pollTimer = setInterval(() => {
      if (this.state === "idle") {
        void this.poll();
      }
    }, this.config.pollIntervalMs);

    console.log(`[EXEC-WORKER] Started | ID: ${this.workerId}`);
  }

  stop(): void {
    this.state = "draining";

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    // If currently processing, abort the context
    if (this.currentContext) {
      this.currentContext.abort();
    }

    this.state = "stopped";
    console.log(
      `[EXEC-WORKER] Stopped | ID: ${this.workerId} | Processed: ${this.jobsProcessed}`,
    );
  }

  // ─── Job Processing ───────────────────────────────────────────────────

  private async poll(): Promise<void> {
    const job = this.queue.dequeue(this.workerId);
    if (!job) return;

    await this.processJob(job);
  }

  async processJob(job: ExecutionJob): Promise<void> {
    this.state = "processing";
    this.lastActivityAt = Date.now();
    this.queue.markRunning(job.jobId);

    // Create isolated execution context
    const contextConfig: ExecutionContextConfig = {
      executionId: job.executionId,
      jobId: job.jobId,
      projectId: job.projectId,
      intent: job.intent,
      constraints: job.constraints,
      priority: job.priority,
      maxRetries: job.maxAttempts,
      timeoutMs: job.timeoutMs,
    };

    this.currentContext = new ExecutionContext(contextConfig);
    const startTime = Date.now();

    try {
      // Create fresh PlanExecutor per job (stateless execution unit)
      const planner = new PlannerEngine();
      const executor = new PlanExecutor();

      const plan = planner.createPlan({
        intent: job.intent,
        constraints: job.constraints,
        projectId: job.projectId,
        context: job.metadata,
      });

      // Register nodes in context
      for (const node of plan.graph.getAllNodes()) {
        this.currentContext.registerNode(node.id, node.agent);
      }

      // Execute with timeout awareness
      const result = await this.executeWithTimeout(
        executor,
        plan,
        job.timeoutMs,
      );

      const durationMs = Date.now() - startTime;
      this.currentContext.complete();

      // Report success
      this.queue.complete(job.jobId, {
        success: result.success,
        completedNodes: result.completedNodes,
        failedNodes: result.failedNodes,
        totalDurationMs: result.totalDurationMs,
        outputs: result.outputs,
        context: this.currentContext.metrics,
      });

      this.jobsProcessed++;
      this.totalJobDurationMs += durationMs;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.queue.fail(job.jobId, error);
      this.jobsFailed++;

      console.error(
        `[EXEC-WORKER] Job failed | Worker: ${this.workerId} | Job: ${job.jobId} | Error: ${error}`,
      );
    } finally {
      this.currentContext = null;
      this.state = "idle";
      this.lastActivityAt = Date.now();
    }
  }

  private async executeWithTimeout(
    executor: PlanExecutor,
    plan: ReturnType<PlannerEngine["createPlan"]>,
    timeoutMs: number,
  ) {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Execution timeout after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });

    const executionPromise = executor.executePlan(
      plan.planId,
      plan.graph,
      (agentType, input) => {
        // Check abort/timeout before each agent call
        if (this.currentContext?.shouldStop) {
          throw new Error("Execution aborted");
        }
        return this.agentRegistry.executeAgent(agentType, input);
      },
      { projectId: plan.goal.projectId, stopOnFailure: false },
    );

    return Promise.race([executionPromise, timeoutPromise]);
  }

  // ─── Metrics ──────────────────────────────────────────────────────────

  getMetrics(): WorkerMetrics {
    return {
      workerId: this.workerId,
      state: this.state,
      jobsProcessed: this.jobsProcessed,
      jobsFailed: this.jobsFailed,
      currentJobId: this.currentContext?.jobId ?? null,
      uptimeMs: this.startedAt > 0 ? Date.now() - this.startedAt : 0,
      lastActivityAt: this.lastActivityAt,
      averageJobDurationMs:
        this.jobsProcessed > 0
          ? this.totalJobDurationMs / this.jobsProcessed
          : 0,
    };
  }

  getState(): WorkerState {
    return this.state;
  }

  getCurrentContext(): ExecutionContext | null {
    return this.currentContext;
  }
}
