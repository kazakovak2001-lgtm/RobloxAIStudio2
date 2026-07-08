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
import type { PipelineState } from "./PipelineStage";

export class PipelineEngine {
  private executor: PipelineExecutor;
  private events: PipelineEventEmitterV2;
  private runs: Map<string, PipelineState> = new Map();

  constructor() {
    this.events = new PipelineEventEmitterV2();
    this.executor = new PipelineExecutor(this.events);
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
}
