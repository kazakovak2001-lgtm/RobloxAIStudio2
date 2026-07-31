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

export type PipelineStartReservation = (
  state: Readonly<PipelineState>,
) => Promise<void>;

export class PipelineEngine {
  private executor: PipelineExecutor;
  private events: PipelineEventEmitterV2;
  private store: PipelineStore;
  private artifactStore: ArtifactStore;
  private activeExecutions: Set<string> = new Set();
  private readonly pendingStarts = new Map<string, Promise<string>>();
  private eventBus: PipelineEventBus;
  private auditStore: PipelineAuditStore;
  private metrics: PipelineMetricsCollector;
  private readonly readiness: Promise<void>;

  constructor(options?: PipelineEngineOptions) {
    this.events = new PipelineEventEmitterV2();
    this.executor = new PipelineExecutor(this.events);
    this.store = options?.store ?? new InMemoryPipelineStore();
    this.artifactStore = new ArtifactStore();
    this.eventBus = options?.eventBus ?? new DefaultPipelineEventBus();
    this.auditStore = options?.auditStore ?? new InMemoryAuditStore();
    this.metrics = options?.metrics ?? new PipelineMetricsCollector();

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

    this.readiness = this.recoverInterruptedPipelines();
  }

  async ready(): Promise<void> {
    await this.readiness;
  }

  private async recoverInterruptedPipelines(): Promise<void> {
    const interrupted = await this.store.markInterrupted();
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
    await this.readiness;
    const result = await this.executor.execute(
      projectId,
      blueprint,
      agentExecutor,
    );
    this.metrics.start(result.state.pipelineId, result.state.stages.length);
    await this.store.save(result.state);
    await this.storeArtifactsFromState(result.state);
    this.metrics.finish(result.state.pipelineId);
    return result;
  }

  async startAsync(
    projectId: string,
    blueprint: Record<string, unknown>,
    agentExecutor: AgentExecutorFn,
    reserve?: PipelineStartReservation,
  ): Promise<string> {
    await this.readiness;
    const pending = this.pendingStarts.get(projectId);
    if (pending) return pending;

    const operation = this.startReservedPipeline(
      projectId,
      blueprint,
      agentExecutor,
      reserve,
    );
    this.pendingStarts.set(projectId, operation);

    try {
      return await operation;
    } finally {
      if (this.pendingStarts.get(projectId) === operation) {
        this.pendingStarts.delete(projectId);
      }
    }
  }

  private async startReservedPipeline(
    projectId: string,
    blueprint: Record<string, unknown>,
    agentExecutor: AgentExecutorFn,
    reserve?: PipelineStartReservation,
  ): Promise<string> {
    if (this.activeExecutions.has(projectId)) {
      const existing = this.store
        .getAll()
        .find(
          (pipeline) =>
            pipeline.projectId === projectId &&
            (pipeline.status === "pending" || pipeline.status === "running"),
        );
      if (existing) {
        console.log(
          `[JOB_DUPLICATE] projectId=${projectId} existingPipeline=${existing.pipelineId}`,
        );
        return existing.pipelineId;
      }
    }

    const state = createPipelineState(projectId);
    if (reserve) await reserve(state);

    await this.store.save(state);
    this.activeExecutions.add(projectId);
    this.metrics.start(state.pipelineId, state.stages.length);

    console.log(
      `[JOB_STARTED] pipelineId=${state.pipelineId} projectId=${projectId}`,
    );

    void this.executor
      .execute(projectId, blueprint, agentExecutor, state)
      .then(async (result) => {
        await this.store.save(result.state);
        await this.storeArtifactsFromState(result.state);
        this.activeExecutions.delete(projectId);
        console.log(
          `[JOB_COMPLETED] pipelineId=${state.pipelineId} status=${result.state.status} stages=${result.state.completedStages.length}`,
        );
      })
      .catch(async (err) => {
        state.status = "failed";
        state.finishedAt = Date.now();
        state.currentStage = null;
        try {
          await this.store.save(state);
        } finally {
          this.activeExecutions.delete(projectId);
        }
        console.error(`[JOB_FAILED] pipelineId=${state.pipelineId}:`, err);
      });

    return state.pipelineId;
  }

  async resume(
    pipelineId: string,
    blueprint: Record<string, unknown>,
    agentExecutor: AgentExecutorFn,
  ): Promise<PipelineResult | null> {
    await this.readiness;
    const state = this.store.get(pipelineId);
    if (!state || state.status !== "failed") return null;
    const result = await this.executor.resume(state, blueprint, agentExecutor);
    await this.store.save(result.state);
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

  async pause(pipelineId: string): Promise<boolean> {
    await this.readiness;
    const state = this.store.get(pipelineId);
    if (!state || state.status !== "running") return false;
    state.status = "paused";
    await this.store.save(state);
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
    await this.readiness;
    const state = this.store.get(pipelineId);
    if (!state || state.status !== "paused") return null;
    state.status = "running";
    const result = await this.executor.resume(state, blueprint, agentExecutor);
    await this.store.save(result.state);
    await this.storeArtifactsFromState(result.state);
    return result;
  }

  async cancel(pipelineId: string): Promise<boolean> {
    await this.readiness;
    const state = this.store.get(pipelineId);
    if (!state || (state.status !== "running" && state.status !== "paused")) {
      return false;
    }
    state.status = "cancelled";
    state.currentStage = null;
    state.finishedAt = Date.now();
    await this.store.save(state);
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
    await this.readiness;
    const state = this.store.get(pipelineId);
    if (!state || state.status !== "failed") return null;
    const result = await this.executor.resume(state, blueprint, agentExecutor);
    await this.store.save(result.state);
    await this.storeArtifactsFromState(result.state);
    return result;
  }

  async retryStage(
    pipelineId: string,
    stageName: string,
    blueprint: Record<string, unknown>,
    agentExecutor: AgentExecutorFn,
  ): Promise<PipelineResult | null> {
    await this.readiness;
    const state = this.store.get(pipelineId);
    if (!state) return null;

    const stage = state.stages.find(
      (candidate) => candidate.name === stageName,
    );
    if (!stage || stage.status !== "failed") return null;

    stage.status = "pending";
    stage.error = undefined;
    stage.output = undefined;
    state.failedStages = state.failedStages.filter(
      (name) => name !== stageName,
    );
    state.status = "running";

    const result = await this.executor.execute(
      state.projectId,
      blueprint,
      agentExecutor,
      state,
    );
    await this.store.save(result.state);
    await this.storeArtifactsFromState(result.state);
    return result;
  }

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
