/**
 * PipelineEngine — Top-level facade for pipeline operations.
 */

import {
  PipelineExecutor,
  type AgentExecutorFn,
  type PipelineResult,
} from "./PipelineExecutor";
import {
  PipelineEventEmitterV2,
  type PipelineEventHandler,
} from "./PipelineEvents";
import { ArtifactStore, type PipelineArtifact } from "./ArtifactStore";
import { createPipelineState, type PipelineState } from "./PipelineStage";
import type { PipelineStore } from "./store/PipelineStore";
import { InMemoryPipelineStore } from "./store/InMemoryPipelineStore";
import {
  type PipelineEventBus,
  DefaultPipelineEventBus,
  createPipelineEvent,
} from "../events";
import {
  type PipelineAuditStore,
  InMemoryAuditStore,
  createAuditEntry,
} from "../audit";
import { PipelineMetricsCollector } from "../metrics";

export interface PipelineEngineOptions {
  store?: PipelineStore;
  eventBus?: PipelineEventBus;
  auditStore?: PipelineAuditStore;
  metrics?: PipelineMetricsCollector;
}

export class PipelineEngine {
  private executor: PipelineExecutor;
  private events: PipelineEventEmitterV2;
  private store: PipelineStore;
  private artifactStore: ArtifactStore;
  private activeExecutions: Set<string> = new Set();
  private eventBus: PipelineEventBus;
  private auditStore: PipelineAuditStore;
  private metrics: PipelineMetricsCollector;

  constructor(options?: PipelineEngineOptions) {
    this.events = new PipelineEventEmitterV2();
    this.executor = new PipelineExecutor(this.events);
    this.store = options?.store ?? new InMemoryPipelineStore();
    this.artifactStore = new ArtifactStore();
    this.eventBus = options?.eventBus ?? new DefaultPipelineEventBus();
    this.auditStore = options?.auditStore ?? new InMemoryAuditStore();
    this.metrics = options?.metrics ?? new PipelineMetricsCollector();

    // Wire v2 events to the observability layer
    this.events.on((evt) => {
      this.eventBus.emit(
        createPipelineEvent(
          evt.pipelineId,
          this.mapEventType(evt.type),
          evt.stage,
          evt,
        ),
      );
      this.auditStore.append(
        createAuditEntry(
          evt.pipelineId,
          evt.type,
          `${evt.type} ${evt.stage ?? ""}`.trim(),
          evt.stage,
        ),
      );
      // Update metrics
      if (evt.type === "stage.completed") {
        this.metrics.stageCompleted(evt.pipelineId, evt.durationMs);
      } else if (evt.type === "stage.failed") {
        this.metrics.stageFailed(evt.pipelineId);
      } else if (
        evt.type === "pipeline.completed" ||
        evt.type === "pipeline.failed"
      ) {
        this.metrics.finish(evt.pipelineId);
      }
    });

    const interrupted = this.store.markInterrupted();
    if (interrupted > 0) {
      console.log(
        `[PipelineEngine] Recovered ${interrupted} interrupted pipeline(s)`,
      );
    }
  }

  private mapEventType(type: string): import("../events").PipelineEventType {
    const map: Record<string, import("../events").PipelineEventType> = {
      "pipeline.started": "PipelineStarted",
      "stage.started": "StageStarted",
      "stage.completed": "StageCompleted",
      "stage.failed": "StageFailed",
      "pipeline.completed": "PipelineCompleted",
      "pipeline.failed": "PipelineFailed",
      "pipeline.paused": "PipelinePaused",
      "pipeline.cancelled": "PipelineCancelled",
    };
    return map[type] ?? "PipelineStarted";
  }

  async run(
    projectId: string,
    blueprint: Record<string, unknown>,
    agentExecutor: AgentExecutorFn,
  ): Promise<PipelineResult> {
    const result = await this.executor.execute(
      projectId,
      blueprint,
      agentExecutor,
    );
    this.metrics.start(result.state.pipelineId, result.state.stages.length);
    this.store.save(result.state);
    await this.storeArtifactsFromState(result.state);
    this.metrics.finish(result.state.pipelineId);
    return result;
  }

  startAsync(
    projectId: string,
    blueprint: Record<string, unknown>,
    agentExecutor: AgentExecutorFn,
  ): string {
    if (this.activeExecutions.has(projectId)) {
      const existing = this.store
        .getAll()
        .find((p) => p.projectId === projectId && p.status === "running");
      if (existing) {
        console.log(
          `[JOB_DUPLICATE] projectId=${projectId} existingPipeline=${existing.pipelineId}`,
        );
        return existing.pipelineId;
      }
    }

    const state = createPipelineState(projectId);
    this.store.save(state);
    this.activeExecutions.add(projectId);
    this.metrics.start(state.pipelineId, state.stages.length);

    console.log(
      `[JOB_STARTED] pipelineId=${state.pipelineId} projectId=${projectId}`,
    );

    void this.executor
      .execute(projectId, blueprint, agentExecutor, state)
      .then(async (result) => {
        this.store.save(result.state);
        await this.storeArtifactsFromState(result.state);
        this.activeExecutions.delete(projectId);
        console.log(
          `[JOB_COMPLETED] pipelineId=${state.pipelineId} status=${result.state.status} stages=${result.state.completedStages.length}`,
        );
      })
      .catch((err) => {
        state.status = "failed";
        state.finishedAt = Date.now();
        state.currentStage = null;
        this.store.save(state);
        this.activeExecutions.delete(projectId);
        console.error(`[JOB_FAILED] pipelineId=${state.pipelineId}:`, err);
      });

    return state.pipelineId;
  }

  async resume(
    pipelineId: string,
    blueprint: Record<string, unknown>,
    agentExecutor: AgentExecutorFn,
  ): Promise<PipelineResult | null> {
    const state = this.store.get(pipelineId);
    if (!state || state.status !== "failed") return null;
    const result = await this.executor.resume(state, blueprint, agentExecutor);
    this.store.save(result.state);
    await this.storeArtifactsFromState(result.state);
    return result;
  }

  getState(pipelineId: string): PipelineState | null {
    return this.store.get(pipelineId);
  }

  getAllStates(): PipelineState[] {
    return this.store.getAll();
  }

  onEvent(handler: PipelineEventHandler): void {
    this.events.on(handler);
  }

  getEventHistory() {
    return this.events.getHistory();
  }

  get runCount(): number {
    return this.store.count();
  }

  private async storeArtifactsFromState(state: PipelineState): Promise<void> {
    for (const stage of state.stages) {
      if (stage.status === "completed" && stage.output) {
        const existing = this.artifactStore.getByPipeline(state.pipelineId);
        const alreadyStored = existing.some((a) => a.stage === stage.name);
        if (!alreadyStored) {
          await this.artifactStore.store(
            state.pipelineId,
            stage.name,
            stage.agentId,
            stage.output,
          );
        }
      }
    }
  }

  getArtifacts(pipelineId: string): PipelineArtifact[] {
    return this.artifactStore.getByPipeline(pipelineId);
  }

  getArtifact(artifactId: string): PipelineArtifact | null {
    return this.artifactStore.getById(artifactId);
  }

  approveArtifact(
    artifactId: string,
    reviewedBy: string,
  ): Promise<PipelineArtifact | null> {
    return this.artifactStore.approve(artifactId, reviewedBy);
  }

  rejectArtifact(
    artifactId: string,
    reviewedBy: string,
    comment?: string,
  ): Promise<PipelineArtifact | null> {
    return this.artifactStore.reject(artifactId, reviewedBy, comment);
  }

  commentArtifact(
    artifactId: string,
    reviewedBy: string,
    comment: string,
  ): Promise<PipelineArtifact | null> {
    return this.artifactStore.comment(artifactId, reviewedBy, comment);
  }

  editArtifact(
    artifactId: string,
    newContent: unknown,
    editedBy: string,
  ): Promise<PipelineArtifact | null> {
    return this.artifactStore.edit(artifactId, newContent, editedBy);
  }

  getReviewSummary(pipelineId: string) {
    return this.artifactStore.getReviewSummary(pipelineId);
  }

  pause(pipelineId: string): boolean {
    const state = this.store.get(pipelineId);
    if (!state || state.status !== "running") return false;
    state.status = "paused";
    this.store.save(state);
    this.events.emit({
      type: "pipeline.paused",
      pipelineId,
      projectId: state.projectId,
      timestamp: Date.now(),
    });
    return true;
  }

  async resumePaused(
    pipelineId: string,
    blueprint: Record<string, unknown>,
    agentExecutor: AgentExecutorFn,
  ): Promise<PipelineResult | null> {
    const state = this.store.get(pipelineId);
    if (!state || state.status !== "paused") return null;
    state.status = "running";
    const result = await this.executor.resume(state, blueprint, agentExecutor);
    this.store.save(result.state);
    await this.storeArtifactsFromState(result.state);
    return result;
  }

  cancel(pipelineId: string): boolean {
    const state = this.store.get(pipelineId);
    if (!state || (state.status !== "running" && state.status !== "paused")) {
      return false;
    }
    state.status = "cancelled";
    state.currentStage = null;
    state.finishedAt = Date.now();
    this.store.save(state);
    this.events.emit({
      type: "pipeline.cancelled",
      pipelineId,
      projectId: state.projectId,
      timestamp: Date.now(),
    });
    return true;
  }

  async retry(
    pipelineId: string,
    blueprint: Record<string, unknown>,
    agentExecutor: AgentExecutorFn,
  ): Promise<PipelineResult | null> {
    const state = this.store.get(pipelineId);
    if (!state || state.status !== "failed") return null;
    const result = await this.executor.resume(state, blueprint, agentExecutor);
    this.store.save(result.state);
    await this.storeArtifactsFromState(result.state);
    return result;
  }

  async retryStage(
    pipelineId: string,
    stageName: string,
    blueprint: Record<string, unknown>,
    agentExecutor: AgentExecutorFn,
  ): Promise<PipelineResult | null> {
    const state = this.store.get(pipelineId);
    if (!state) return null;

    const stage = state.stages.find((s) => s.name === stageName);
    if (!stage || stage.status !== "failed") return null;

    stage.status = "pending";
    stage.error = undefined;
    stage.output = undefined;
    state.failedStages = state.failedStages.filter((s) => s !== stageName);
    state.status = "running";

    const result = await this.executor.execute(
      state.projectId,
      blueprint,
      agentExecutor,
      state,
    );
    this.store.save(result.state);
    await this.storeArtifactsFromState(result.state);
    return result;
  }

  // ─── Observability Accessors ────────────────────────────────────────────

  getMetrics(pipelineId: string) {
    return this.metrics.get(pipelineId);
  }

  getAllMetrics() {
    return this.metrics.getAll();
  }

  getAuditHistory(pipelineId: string) {
    return this.auditStore.getHistory(pipelineId);
  }

  getObservabilityEventBus(): PipelineEventBus {
    return this.eventBus;
  }
}
