/**
 * RepairEngine — Orchestrates a real, artifact-applying repair attempt.
 *
 * REPAIR-1A flow: load real artifacts for an execution → baseline playtest →
 * plan → execute (regenerate + fail-closed validation) → if anything was
 * applied, persist the repaired Lua under a NEW execution id (parent
 * execution is never mutated) and re-run the real playtest for the new
 * score. REPAIR-1A runs a single bounded attempt — no multi-iteration
 * auto-retry loop — even though RepairConfig.maxIterations exists for
 * forward compatibility with a future phase.
 */

import type { AgentRegistry } from "../agents/core/AgentRegistry";
import type { ArtifactStore } from "../pipeline/v2";
import { PlaytestEngine } from "../playtest";
import { RepairPlanner } from "./RepairPlanner";
import { RepairExecutor, type RepairBlueprintLookup } from "./RepairExecutor";
import { assembleRepairInput } from "./RepairInputAssembler";
import {
  createConfiguredRepairSessionStore,
  InMemoryRepairSessionStore,
  type RepairSessionStore,
} from "./RepairSessionStore";
import type {
  RepairConfig,
  RepairSessionState,
  RepairIterationRecord,
  RepairDeliveryRecord,
} from "./RepairTypes";
import { DEFAULT_REPAIR_CONFIG } from "./RepairTypes";

export class RepairEngine {
  private readonly planner: RepairPlanner;
  private readonly executor: RepairExecutor;
  private readonly playtestEngine: PlaytestEngine;
  private readonly sessionStore: RepairSessionStore;
  private readonly runQueues = new Map<string, Promise<void>>();

  constructor(
    agentRegistry: AgentRegistry,
    blueprintRepository: RepairBlueprintLookup,
    private readonly artifactStore: ArtifactStore,
    sessionStore?: RepairSessionStore,
  ) {
    this.planner = new RepairPlanner();
    this.executor = new RepairExecutor(
      agentRegistry,
      blueprintRepository,
      artifactStore,
    );
    this.playtestEngine = new PlaytestEngine();
    this.sessionStore =
      sessionStore ??
      createConfiguredRepairSessionStore() ??
      new InMemoryRepairSessionStore();
  }

  /**
   * Attempt to repair the Lua artifacts for one execution. Returns the
   * resulting session state; artifacts are only persisted if the attempt
   * produced and validated a real change.
   *
   * Calls for the same projectId are serialized (mirrors ArtifactStore's
   * per-key mutation queue) so two concurrent runs can't read the same
   * session snapshot and have one overwrite the other's history.
   */
  async run(
    projectId: string,
    executionId: string,
    config?: Partial<RepairConfig>,
  ): Promise<RepairSessionState> {
    return this.enqueue(projectId, () =>
      this.runExclusive(projectId, executionId, config),
    );
  }

  /**
   * Record one Studio delivery attempt (success or failure) against the
   * project's existing repair session. Joins the same per-project queue as
   * run() — both read-modify-write the whole RepairSessionState document,
   * and RepairSessionStore has no CAS/versioning, so without sharing the
   * queue a concurrent run() could silently drop this write (or vice versa).
   */
  async recordDelivery(
    projectId: string,
    record: RepairDeliveryRecord,
  ): Promise<void> {
    await this.enqueue(projectId, async () => {
      const session = await this.sessionStore.get(projectId);
      if (!session) {
        throw new Error(
          `Cannot record a delivery for project ${projectId}: no repair session exists`,
        );
      }
      session.deliveries = [...(session.deliveries ?? []), record];
      await this.sessionStore.save(session);
    });
  }

  private async enqueue<T>(
    projectId: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const previous = this.runQueues.get(projectId) ?? Promise.resolve();
    const operation = previous.catch(() => undefined).then(task);
    const tracked = operation.then(
      () => undefined,
      () => undefined,
    );
    this.runQueues.set(projectId, tracked);

    try {
      return await operation;
    } finally {
      if (this.runQueues.get(projectId) === tracked) {
        this.runQueues.delete(projectId);
      }
    }
  }

  private async runExclusive(
    projectId: string,
    executionId: string,
    config?: Partial<RepairConfig>,
  ): Promise<RepairSessionState> {
    const cfg: RepairConfig = { ...DEFAULT_REPAIR_CONFIG, ...config };
    const startTime = Date.now();

    // Carry forward prior history so an earlier successful repair's
    // newExecutionId stays discoverable even if this call finds nothing
    // further to fix — RepairEngine.getSession() is the durable index of
    // "what was ever repaired" and must not be discarded on every call.
    const priorSession = await this.sessionStore.get(projectId);

    const session: RepairSessionState = {
      projectId,
      status: "running",
      currentIteration: 0,
      maxIterations: cfg.maxIterations,
      targetScore: cfg.targetScore,
      currentScore: 0,
      history: priorSession ? [...priorSession.history] : [],
      deliveries: priorSession?.deliveries ?? [],
      startedAt: startTime,
      totalRepairs: 0,
    };
    await this.sessionStore.save(session);

    const assembled = await assembleRepairInput(
      this.artifactStore,
      projectId,
      executionId,
    );
    let report = this.playtestEngine.run(assembled.input);
    session.currentScore = report.overallScore;

    // REPAIR-1A: exactly one bounded attempt, regardless of maxIterations —
    // each iteration is now a real LLM call + validation + persistence, not
    // a free simulation. Multi-iteration auto-retry is deferred.
    const attemptIterations = Math.min(cfg.maxIterations, 1);

    while (
      session.currentIteration < attemptIterations &&
      session.currentScore < cfg.targetScore &&
      Date.now() - startTime < cfg.timeoutMs
    ) {
      session.currentIteration++;
      const iterStart = Date.now();
      const scoreBefore = session.currentScore;

      const plan = this.planner.plan(
        report,
        session.currentIteration,
        cfg.targetScore,
      );

      const { results, scripts } = await this.executor.execute(plan, {
        projectId,
        parentExecutionId: executionId,
        scripts: assembled.scripts,
      });
      const appliedResults = results.filter((r) => r.applied);
      const changedArtifacts = appliedResults.map((r) => r.artifactChanged);

      if (appliedResults.length === 0) {
        session.stopReason = "No actionable repairs remaining";
        session.history.push({
          iteration: session.currentIteration,
          changedArtifacts: [],
          scoreBefore,
          scoreAfter: scoreBefore,
          duration: Date.now() - iterStart,
          tokenUsage: 0,
          aiCost: 0,
          repairsApplied: 0,
          timestamp: Date.now(),
          parentExecutionId: executionId,
          strategyResults: results,
        });
        break;
      }

      // Suffix from the cumulative count of prior attempts (success or
      // fail) against this exact parent, not currentIteration alone —
      // currentIteration resets to 1 on every call, so two separate
      // successful run() calls against the same parent would otherwise
      // both produce "-repair-1" and collide in ArtifactStore.
      const priorAttemptsForParent = session.history.filter(
        (record) => record.parentExecutionId === executionId,
      ).length;
      const newExecutionId = `${executionId}-repair-${priorAttemptsForParent + 1}`;
      await this.persistRepairedExecution(executionId, newExecutionId, scripts);

      const newInput = await assembleRepairInput(
        this.artifactStore,
        projectId,
        newExecutionId,
      );
      report = this.playtestEngine.run(newInput.input);
      session.currentScore = report.overallScore;
      session.totalRepairs += appliedResults.length;

      const record: RepairIterationRecord = {
        iteration: session.currentIteration,
        changedArtifacts,
        scoreBefore,
        scoreAfter: session.currentScore,
        duration: Date.now() - iterStart,
        // Not tracked yet — the LLM provider interface surfaces no usage metadata.
        tokenUsage: 0,
        aiCost: 0,
        repairsApplied: appliedResults.length,
        timestamp: Date.now(),
        newExecutionId,
        parentExecutionId: executionId,
        strategyResults: results,
      };
      session.history.push(record);
    }

    if (session.currentScore >= cfg.targetScore) {
      session.status = "completed";
      session.stopReason = session.stopReason ?? "Target score reached";
    } else if (Date.now() - startTime >= cfg.timeoutMs) {
      session.status = "timeout";
      session.stopReason = "Timeout exceeded";
    } else if (session.currentIteration >= attemptIterations) {
      session.status = "stopped";
      session.stopReason =
        session.stopReason ?? "Bounded repair attempt limit reached";
    } else {
      session.status = "stopped";
    }

    session.finishedAt = Date.now();
    await this.sessionStore.save(session);
    return session;
  }

  async getSession(projectId: string): Promise<RepairSessionState | null> {
    return this.sessionStore.get(projectId);
  }

  async getHistory(projectId: string): Promise<RepairIterationRecord[]> {
    return this.sessionStore.get(projectId)?.history ?? [];
  }

  /**
   * Persists the repaired LUA_GENERATION artifact under a new execution id
   * and copies every other stage's artifact forward unchanged. The parent
   * execution's artifacts are never mutated.
   */
  private async persistRepairedExecution(
    parentExecutionId: string,
    newExecutionId: string,
    repairedScripts: Awaited<ReturnType<typeof assembleRepairInput>>["scripts"],
  ): Promise<void> {
    const parentArtifacts = this.artifactStore.getByPipeline(parentExecutionId);

    for (const artifact of parentArtifacts) {
      if (artifact.stage === "LUA_GENERATION") continue;
      await this.artifactStore.store(
        newExecutionId,
        artifact.stage,
        artifact.agent,
        artifact.content,
      );
    }

    await this.artifactStore.store(
      newExecutionId,
      "LUA_GENERATION",
      "repair-engine",
      { scripts: repairedScripts },
    );
  }
}
