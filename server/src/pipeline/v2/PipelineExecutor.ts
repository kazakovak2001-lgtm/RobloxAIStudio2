/**
 * PipelineExecutor — Runs the generation pipeline through all stages.
 * Supports recovery from failed stages.
 */

import type { PipelineState, StageRecord } from "./PipelineStage";
import { createPipelineState } from "./PipelineStage";
import { PipelineContext } from "./PipelineContext";
import { PipelineEventEmitterV2 } from "./PipelineEvents";

export type AgentExecutorFn = (
  agentId: string,
  input: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

export interface PipelineResult {
  state: PipelineState;
  outputs: Record<string, unknown>;
  durationMs: number;
}

export class PipelineExecutor {
  private events: PipelineEventEmitterV2;
  private context: PipelineContext;

  constructor(events?: PipelineEventEmitterV2) {
    this.events = events ?? new PipelineEventEmitterV2();
    this.context = new PipelineContext();
  }

  /**
   * Execute the full pipeline from start or resume from a failed stage.
   */
  async execute(
    projectId: string,
    blueprint: Record<string, unknown>,
    agentExecutor: AgentExecutorFn,
    resumeFrom?: PipelineState,
  ): Promise<PipelineResult> {
    const state = resumeFrom ?? createPipelineState(projectId);
    const sessionId = this.context.createSession(projectId, blueprint);
    const startTime = Date.now();

    state.status = "running";
    this.events.emit({
      type: "pipeline.started",
      pipelineId: state.pipelineId,
      projectId,
      timestamp: Date.now(),
    });

    for (const stageRecord of state.stages) {
      // Skip already completed stages (for recovery)
      if (stageRecord.status === "completed") continue;

      const stageName = stageRecord.name;
      state.currentStage = stageName;
      stageRecord.status = "running";
      stageRecord.startedAt = Date.now();

      this.events.emit({
        type: "stage.started",
        pipelineId: state.pipelineId,
        projectId,
        stage: stageName,
        timestamp: Date.now(),
      });

      try {
        const output = await this.executeStage(
          stageRecord,
          sessionId,
          agentExecutor,
        );
        stageRecord.status = "completed";
        stageRecord.completedAt = Date.now();
        stageRecord.durationMs =
          stageRecord.completedAt - stageRecord.startedAt;
        stageRecord.output = output;
        state.completedStages.push(stageName);

        this.context.recordAgentOutput(
          sessionId,
          stageRecord.agentId ?? stageName,
          output,
        );
        this.events.emit({
          type: "stage.completed",
          pipelineId: state.pipelineId,
          projectId,
          stage: stageName,
          timestamp: Date.now(),
          durationMs: stageRecord.durationMs,
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        stageRecord.status = "failed";
        stageRecord.completedAt = Date.now();
        stageRecord.durationMs =
          stageRecord.completedAt - stageRecord.startedAt;
        stageRecord.error = error;
        state.failedStages.push(stageName);

        this.context.recordFailure(
          sessionId,
          stageRecord.agentId ?? stageName,
          error,
        );
        this.events.emit({
          type: "stage.failed",
          pipelineId: state.pipelineId,
          projectId,
          stage: stageName,
          error,
          timestamp: Date.now(),
        });

        // Stop on failure
        state.status = "failed";
        state.currentStage = null;
        state.finishedAt = Date.now();
        this.events.emit({
          type: "pipeline.failed",
          pipelineId: state.pipelineId,
          projectId,
          error,
          timestamp: Date.now(),
        });
        return {
          state,
          outputs: this.context.getAccumulated(sessionId),
          durationMs: Date.now() - startTime,
        };
      }
    }

    state.status = "completed";
    state.currentStage = null;
    state.finishedAt = Date.now();
    this.events.emit({
      type: "pipeline.completed",
      pipelineId: state.pipelineId,
      projectId,
      timestamp: Date.now(),
      durationMs: Date.now() - startTime,
    });

    return {
      state,
      outputs: this.context.getAccumulated(sessionId),
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Resume a failed pipeline from the last failure point.
   */
  async resume(
    failedState: PipelineState,
    blueprint: Record<string, unknown>,
    agentExecutor: AgentExecutorFn,
  ): Promise<PipelineResult> {
    failedState.status = "recovering";
    // Reset failed stages to pending
    for (const stage of failedState.stages) {
      if (stage.status === "failed") {
        stage.status = "pending";
        stage.error = undefined;
      }
    }
    failedState.failedStages = [];
    return this.execute(
      failedState.projectId,
      blueprint,
      agentExecutor,
      failedState,
    );
  }

  getEvents(): PipelineEventEmitterV2 {
    return this.events;
  }
  getContext(): PipelineContext {
    return this.context;
  }

  private async executeStage(
    stage: StageRecord,
    sessionId: string,
    agentExecutor: AgentExecutorFn,
  ): Promise<Record<string, unknown>> {
    if (!stage.agentId) {
      // Non-agent stages (REQUEST, EXPORT) pass through
      return { _stage: stage.name, _passthrough: true };
    }
    const input = this.context.getAccumulated(sessionId);
    return agentExecutor(stage.agentId, input);
  }
}
