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
}
