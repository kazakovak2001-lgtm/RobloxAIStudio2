/**
 * PipelineExecutor — Runs the generation pipeline through all stages.
 * Supports recovery from failed stages.
 */

import type { PipelineState, StageRecord } from "./PipelineStage";
import { createPipelineState } from "./PipelineStage";
import { PipelineContext } from "./PipelineContext";
import { PipelineEventEmitterV2 } from "./PipelineEvents";
import { reviewLuaSecurity } from "../../validation/luaSecurityReview";
import { buildGenerationValidationReport } from "../../validation/generationValidation";
import {
  getPlayableLuaIssues,
  normalizeLuaScripts,
} from "../../types/playableLua";

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
          state,
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
    state: PipelineState,
  ): Promise<Record<string, unknown>> {
    // SECREVIEW-1. This stage has no agent because the review is a
    // deterministic service, but it must not take the generic null-agent
    // passthrough: that would persist `{ _passthrough: true }` under the name
    // `securityReport.json`, producing a file that claims to be a security
    // report and contains no review, no findings and no enforcement mode.
    if (stage.name === "SECURITY_REVIEW") {
      return this.reviewGeneratedLua(sessionId);
    }

    // PIPELINE-1B. This stage used to run `tester`, whose output is a checklist
    // of tests whose status is `pending` alongside `passed: 0, failed: 0`.
    // Persisted under the name `validationReport.json`, that reads as a clean
    // validation result while nothing was ever executed — the same defect as
    // the passthrough security report above, wearing a more convincing shape.
    if (stage.name === "VALIDATION") {
      return this.validateGenerated(sessionId, state);
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

  /**
   * Report what deterministic validation found for this pipeline's Lua.
   *
   * Unlike the canonical generation path, this executor does not gate delivery
   * on the report — it records it. The report says which checks are blocking,
   * so a consumer can tell the difference between "nothing blocked" and
   * "nothing was checked".
   */
  private validateGenerated(
    sessionId: string,
    state: PipelineState,
  ): Record<string, unknown> {
    // A resumed run starts a fresh context session, so the accumulated output
    // of stages that already completed is not in it. Reading only the context
    // would report `lua-generated` as failed for a pipeline that has perfectly
    // good Lua in its saved state — a durable report asserting the opposite of
    // what happened, which is precisely what this stage exists to prevent.
    const luaStage = state.stages.find(
      (stage) => stage.name === "LUA_GENERATION",
    );
    const luaPresent =
      luaStage?.status === "completed" && luaStage.output !== undefined;

    const sources = [this.context.getAccumulated(sessionId), luaStage?.output];

    let luaIssues: readonly string[] = [];
    let normalized = false;
    for (const source of sources) {
      if (source === undefined) continue;
      try {
        luaIssues = getPlayableLuaIssues(normalizeLuaScripts(source));
        normalized = true;
        break;
      } catch (error) {
        // Keep the first reason. Output the contract cannot even read as
        // scripts is a different failure from output it read and rejected,
        // and reporting it as "no Lua" would erase that distinction.
        if (luaIssues.length === 0) {
          luaIssues = [
            error instanceof Error
              ? error.message
              : "Lua generation output could not be read",
          ];
        }
      }
    }

    return {
      ...buildGenerationValidationReport({
        luaPresent,
        luaIssues: normalized || luaPresent ? luaIssues : [],
        // This executor never builds a UI instance tree, so claiming any
        // outcome for it would be an invention.
        ui: { status: "not-attempted" },
      }),
    };
  }
}
