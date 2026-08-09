/**
 * PipelineExecutor — Runs the generation pipeline through all stages.
 * Supports recovery from failed stages.
 */

import type { PipelineState, StageRecord } from "./PipelineStage";
import { createPipelineState } from "./PipelineStage";
import { PipelineContext } from "./PipelineContext";
import { PipelineEventEmitterV2 } from "./PipelineEvents";
import { reviewLuaSecurity } from "../../validation/luaSecurityReview";
import { normalizeLuaScripts } from "../../types/playableLua";

export type AgentExecutorFn = (
  agentId: string,
  input: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

export type PipelineCheckpointFn = (state: PipelineState) => Promise<void>;

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
    checkpoint?: PipelineCheckpointFn,
  ): Promise<PipelineResult> {
    const state = resumeFrom
      ? structuredClone(resumeFrom)
      : createPipelineState(projectId);
    const sessionId = this.context.createSession(projectId, blueprint);
    const startTime = Date.now();
    const persistCheckpoint = async (): Promise<void> => {
      await checkpoint?.(structuredClone(state));
    };

    state.status = "running";
    await persistCheckpoint();
    this.events.emit({
      type: "pipeline.started",
      pipelineId: state.pipelineId,
      projectId,
      timestamp: Date.now(),
    });

    for (const stageRecord of state.stages) {
      if (stageRecord.status === "completed") continue;

      const stageName = stageRecord.name;
      state.currentStage = stageName;
      stageRecord.status = "running";
      stageRecord.startedAt = Date.now();
      await persistCheckpoint();

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
        await persistCheckpoint();
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
        if (!state.failedStages.includes(stageName)) {
          state.failedStages.push(stageName);
        }

        this.context.recordFailure(
          sessionId,
          stageRecord.agentId ?? stageName,
          error,
        );
        state.status = "failed";
        state.currentStage = null;
        state.finishedAt = Date.now();
        await persistCheckpoint();
        this.events.emit({
          type: "stage.failed",
          pipelineId: state.pipelineId,
          projectId,
          stage: stageName,
          error,
          timestamp: Date.now(),
        });
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
    await persistCheckpoint();
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
    checkpoint?: PipelineCheckpointFn,
  ): Promise<PipelineResult> {
    const state = structuredClone(failedState);
    state.status = "recovering";
    for (const stage of state.stages) {
      if (stage.status === "failed") {
        stage.status = "pending";
        stage.error = undefined;
      }
    }
    state.failedStages = [];
    await checkpoint?.(structuredClone(state));
    return this.execute(
      state.projectId,
      blueprint,
      agentExecutor,
      state,
      checkpoint,
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
    // SECREVIEW-1. This stage has no agent because the review is a
    // deterministic service, but it must not take the generic null-agent
    // passthrough: that would persist `{ _passthrough: true }` under the name
    // `securityReport.json`, producing a file that claims to be a security
    // report and contains no review, no findings and no enforcement mode.
    if (stage.name === "SECURITY_REVIEW") {
      return this.reviewGeneratedLua(sessionId);
    }

    if (!stage.agentId) {
      return { _stage: stage.name, _passthrough: true };
    }
    const input = this.context.getAccumulated(sessionId);
    return agentExecutor(stage.agentId, input);
  }

  /**
   * Review whatever Lua this pipeline has produced so far.
   *
   * Unreviewable output yields a report over zero scripts rather than an
   * error: the review is advisory, so it must never fail a pipeline, and
   * `reviewedScriptCount: 0` states plainly that nothing was examined.
   */
  private reviewGeneratedLua(sessionId: string): Record<string, unknown> {
    const accumulated = this.context.getAccumulated(sessionId);
    try {
      return { ...reviewLuaSecurity(normalizeLuaScripts(accumulated)) };
    } catch {
      return { ...reviewLuaSecurity([]) };
    }
  }
}
