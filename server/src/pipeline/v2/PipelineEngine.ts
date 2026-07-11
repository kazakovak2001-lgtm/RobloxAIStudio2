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

export class PipelineEngine {
  private executor: PipelineExecutor;
  private events: PipelineEventEmitterV2;
  private store: PipelineStore;
  private artifactStore: ArtifactStore;
  private activeExecutions: Set<string> = new Set();

  constructor(store?: PipelineStore) {
    this.events = new PipelineEventEmitterV2();
    this.executor = new PipelineExecutor(this.events);
    this.store = store ?? new InMemoryPipelineStore();
    this.artifactStore = new ArtifactStore();

    const interrupted = this.store.markInterrupted();
    if (interrupted > 0) {
      console.log(
        `[PipelineEngine] Recovered ${interrupted} interrupted pipeline(s)`,
      );
    }
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
    this.store.save(result.state);
    this.storeArtifactsFromState(result.state);
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
      if (existing) return existing.pipelineId;
    }

    const state = createPipelineState(projectId);
    this.store.save(state);
    this.activeExecutions.add(projectId);

    void this.executor
      .execute(projectId, blueprint, agentExecutor, state)
      .then((result) => {
        this.store.save(result.state);
        this.storeArtifactsFromState(result.state);
        this.activeExecutions.delete(projectId);
      })
      .catch((err) => {
        state.status = "failed";
        state.finishedAt = Date.now();
        state.currentStage = null;
        this.store.save(state);
        this.activeExecutions.delete(projectId);
        console.error(
          `[pipeline] Async pipeline ${state.pipelineId} failed:`,
          err,
        );
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
    this.storeArtifactsFromState(result.state);
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

  private storeArtifactsFromState(state: PipelineState): void {
    for (const stage of state.stages) {
      if (stage.status === "completed" && stage.output) {
        const existing = this.artifactStore.getByPipeline(state.pipelineId);
        const alreadyStored = existing.some((a) => a.stage === stage.name);
        if (!alreadyStored) {
          this.artifactStore.store(
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
  ): PipelineArtifact | null {
    return this.artifactStore.approve(artifactId, reviewedBy);
  }

  rejectArtifact(
    artifactId: string,
    reviewedBy: string,
    comment?: string,
  ): PipelineArtifact | null {
    return this.artifactStore.reject(artifactId, reviewedBy, comment);
  }

  commentArtifact(
    artifactId: string,
    reviewedBy: string,
    comment: string,
  ): PipelineArtifact | null {
    return this.artifactStore.comment(artifactId, reviewedBy, comment);
  }

  editArtifact(
    artifactId: string,
    newContent: unknown,
    editedBy: string,
  ): PipelineArtifact | null {
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
    this.storeArtifactsFromState(result.state);
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
    this.storeArtifactsFromState(result.state);
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
    this.storeArtifactsFromState(result.state);
    return result;
  }
}
