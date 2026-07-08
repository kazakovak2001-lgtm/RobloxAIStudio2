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
import type { PipelineState } from "./PipelineStage";

export class PipelineEngine {
  private executor: PipelineExecutor;
  private events: PipelineEventEmitterV2;
  private runs: Map<string, PipelineState> = new Map();
  private artifactStore: ArtifactStore;

  constructor() {
    this.events = new PipelineEventEmitterV2();
    this.executor = new PipelineExecutor(this.events);
    this.artifactStore = new ArtifactStore();
  }

  /**
   * Start a new generation pipeline.
   */
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
    this.runs.set(result.state.pipelineId, result.state);
    this.storeArtifactsFromState(result.state);
    return result;
  }

  /**
   * Resume a previously failed pipeline.
   */
  async resume(
    pipelineId: string,
    blueprint: Record<string, unknown>,
    agentExecutor: AgentExecutorFn,
  ): Promise<PipelineResult | null> {
    const state = this.runs.get(pipelineId);
    if (!state || state.status !== "failed") return null;
    const result = await this.executor.resume(state, blueprint, agentExecutor);
    this.runs.set(result.state.pipelineId, result.state);
    this.storeArtifactsFromState(result.state);
    return result;
  }

  /**
   * Get pipeline state by ID.
   */
  getState(pipelineId: string): PipelineState | null {
    return this.runs.get(pipelineId) ?? null;
  }

  /**
   * Get all pipeline states (for history).
   */
  getAllStates(): PipelineState[] {
    return Array.from(this.runs.values());
  }

  /**
   * Subscribe to pipeline events.
   */
  onEvent(handler: PipelineEventHandler): void {
    this.events.on(handler);
  }

  /**
   * Get event history.
   */
  getEventHistory() {
    return this.events.getHistory();
  }

  get runCount(): number {
    return this.runs.size;
  }

  /**
   * Store artifacts from all completed stages in a pipeline state.
   */
  private storeArtifactsFromState(state: PipelineState): void {
    for (const stage of state.stages) {
      if (stage.status === "completed" && stage.output) {
        // Only store if not already stored (avoid duplicates on resume)
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

  /**
   * Get all artifacts for a pipeline.
   */
  getArtifacts(pipelineId: string): PipelineArtifact[] {
    return this.artifactStore.getByPipeline(pipelineId);
  }

  /**
   * Get a single artifact by ID.
   */
  getArtifact(artifactId: string): PipelineArtifact | null {
    return this.artifactStore.getById(artifactId);
  }

  /**
   * Approve an artifact.
   */
  approveArtifact(
    artifactId: string,
    reviewedBy: string,
  ): PipelineArtifact | null {
    return this.artifactStore.approve(artifactId, reviewedBy);
  }

  /**
   * Reject an artifact.
   */
  rejectArtifact(
    artifactId: string,
    reviewedBy: string,
    comment?: string,
  ): PipelineArtifact | null {
    return this.artifactStore.reject(artifactId, reviewedBy, comment);
  }

  /**
   * Add a comment to an artifact.
   */
  commentArtifact(
    artifactId: string,
    reviewedBy: string,
    comment: string,
  ): PipelineArtifact | null {
    return this.artifactStore.comment(artifactId, reviewedBy, comment);
  }

  /**
   * Edit artifact content.
   */
  editArtifact(
    artifactId: string,
    newContent: unknown,
    editedBy: string,
  ): PipelineArtifact | null {
    return this.artifactStore.edit(artifactId, newContent, editedBy);
  }

  /**
   * Get review summary for a pipeline.
   */
  getReviewSummary(pipelineId: string) {
    return this.artifactStore.getReviewSummary(pipelineId);
  }

  /**
   * Pause a running pipeline.
   */
  pause(pipelineId: string): boolean {
    const state = this.runs.get(pipelineId);
    if (!state || state.status !== "running") return false;
    state.status = "paused";
    this.events.emit({
      type: "pipeline.paused",
      pipelineId,
      projectId: state.projectId,
      timestamp: Date.now(),
    });
    return true;
  }

  /**
   * Resume a paused pipeline. Requires agentExecutor and blueprint to continue execution.
   */
  async resumePaused(
    pipelineId: string,
    blueprint: Record<string, unknown>,
    agentExecutor: AgentExecutorFn,
  ): Promise<PipelineResult | null> {
    const state = this.runs.get(pipelineId);
    if (!state || state.status !== "paused") return null;
    state.status = "running";
    const result = await this.executor.resume(state, blueprint, agentExecutor);
    this.runs.set(result.state.pipelineId, result.state);
    this.storeArtifactsFromState(result.state);
    return result;
  }

  /**
   * Cancel a running or paused pipeline.
   */
  cancel(pipelineId: string): boolean {
    const state = this.runs.get(pipelineId);
    if (!state || (state.status !== "running" && state.status !== "paused")) {
      return false;
    }
    state.status = "cancelled";
    state.currentStage = null;
    state.finishedAt = Date.now();
    this.events.emit({
      type: "pipeline.cancelled",
      pipelineId,
      projectId: state.projectId,
      timestamp: Date.now(),
    });
    return true;
  }

  /**
   * Retry a failed pipeline from the failed stage.
   */
  async retry(
    pipelineId: string,
    blueprint: Record<string, unknown>,
    agentExecutor: AgentExecutorFn,
  ): Promise<PipelineResult | null> {
    const state = this.runs.get(pipelineId);
    if (!state || state.status !== "failed") return null;
    const result = await this.executor.resume(state, blueprint, agentExecutor);
    this.runs.set(result.state.pipelineId, result.state);
    this.storeArtifactsFromState(result.state);
    return result;
  }

  /**
   * Retry a specific stage within a pipeline.
   */
  async retryStage(
    pipelineId: string,
    stageName: string,
    blueprint: Record<string, unknown>,
    agentExecutor: AgentExecutorFn,
  ): Promise<PipelineResult | null> {
    const state = this.runs.get(pipelineId);
    if (!state) return null;

    const stage = state.stages.find((s) => s.name === stageName);
    if (!stage || stage.status !== "failed") return null;

    // Reset only this specific stage
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
    this.runs.set(result.state.pipelineId, result.state);
    this.storeArtifactsFromState(result.state);
    return result;
  }
}
