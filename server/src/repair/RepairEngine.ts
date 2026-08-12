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
import {
  ArtifactStore as ArtifactStoreClass,
  agentProducer,
  deterministicProducer,
  type ArtifactDependency,
  type ArtifactStore,
  type PipelineArtifact,
} from "../pipeline/v2";
import { reviewLuaSecurity } from "../validation/luaSecurityReview";
import { resolveRepairAncestry } from "../pipeline/v2";
import { deriveNoveltyVerdict } from "../validation/noveltyVerdict";
import type { NoveltyVerdictRecord } from "../types/novelty";
import {
  buildGameDnaFromStoredWorld,
  buildGameDnaReport,
  decodeGameDna,
} from "../validation/gameDna";
import { normalizeLuaScripts } from "../types/playableLua";
import { PlaytestEngine, actionableFindingCount } from "../playtest";
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
import {
  DEFAULT_REPAIR_CONFIG,
  EMPTY_FINDING_COUNTS,
  REPAIR_EVIDENCE_VERSION,
} from "./RepairTypes";

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
      // PLAYTEST-TRUTH-1. Findings, not a grade. `targetScore` and
      // `currentScore` are gone from new sessions: they ranged over a number
      // that counted `pcall` occurrences, and a session that cleared the
      // target was recorded as having reached a quality nobody measured.
      findingCounts: EMPTY_FINDING_COUNTS,
      evidenceVersion: REPAIR_EVIDENCE_VERSION,
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
    session.findingCounts = report.findingCounts;

    // REPAIR-1A: exactly one bounded attempt, regardless of maxIterations —
    // each iteration is now a real LLM call + validation + persistence, not
    // a free simulation. Multi-iteration auto-retry is deferred.
    const attemptIterations = Math.min(cfg.maxIterations, 1);

    // Iterate while there is something a repair could act on. Criticals and
    // warnings are actionable; suggestions and optimizations are advice, and
    // treating advice as outstanding work is how a loop keeps running with
    // nothing left to fix. The attempt ceiling and the timeout are unchanged
    // and independent of any of this, so removing the score target cannot make
    // this unbounded.
    while (
      session.currentIteration < attemptIterations &&
      actionableFindingCount(session.findingCounts) > 0 &&
      Date.now() - startTime < cfg.timeoutMs
    ) {
      session.currentIteration++;
      const iterStart = Date.now();
      const findingsBefore = session.findingCounts;

      const plan = this.planner.plan(report, session.currentIteration);

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
          findingsBefore,
          findingsAfter: findingsBefore,
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
      const novelty = await this.persistRepairedExecution(
        executionId,
        newExecutionId,
        projectId,
        scripts,
      );

      const newInput = await assembleRepairInput(
        this.artifactStore,
        projectId,
        newExecutionId,
      );
      report = this.playtestEngine.run(newInput.input);
      session.findingCounts = report.findingCounts;
      session.totalRepairs += appliedResults.length;

      const record: RepairIterationRecord = {
        iteration: session.currentIteration,
        changedArtifacts,
        duration: Date.now() - iterStart,
        // Not tracked yet — the LLM provider interface surfaces no usage metadata.
        tokenUsage: 0,
        aiCost: 0,
        repairsApplied: appliedResults.length,
        timestamp: Date.now(),
        findingsBefore,
        findingsAfter: session.findingCounts,
        newExecutionId,
        parentExecutionId: executionId,
        // NOVELTY-2. The repaired execution's own verdict, which knows this
        // repair's parent is an ancestor rather than an unrelated repeat.
        ...(novelty ? { novelty } : {}),
        strategyResults: results,
      };
      session.history.push(record);
    }

    // Never "target score reached": completion is not claimable without a
    // measurement, and there is none. A run that resolved every actionable
    // finding says exactly that and nothing about whether the game is good.
    if (actionableFindingCount(session.findingCounts) === 0) {
      session.status = "completed";
      session.stopReason =
        session.stopReason ?? "No actionable deterministic findings remain";
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
   * and copies forward every stage whose content the repair did not change.
   * The parent execution's artifacts are never mutated.
   *
   * ARTIFACT-CONTRACT-2. SECURITY_REVIEW is deliberately **not** copied. It
   * describes one exact Lua package, and carrying it onto a repaired
   * execution produced the thing the contract exists to prevent: new Lua
   * beside a review of the old Lua, presented as one coherent package. It is
   * re-derived here from the repaired scripts by the same pure function the
   * generation path uses.
   *
   * VALIDATION is not copied either, and not re-derived. Rebuilding it needs
   * the UI materialization outcome and the world cross-validation from the
   * generation run, which a repair does not re-run; emitting a report without
   * them would state checks that did not happen. Absence is the truthful
   * shape, and the repair session record is where a repaired run's evidence
   * already lives.
   */
  private async persistRepairedExecution(
    parentExecutionId: string,
    newExecutionId: string,
    projectId: string,
    repairedScripts: Awaited<ReturnType<typeof assembleRepairInput>>["scripts"],
  ): Promise<NoveltyVerdictRecord | undefined> {
    const parentArtifacts = this.artifactStore.getByPipeline(parentExecutionId);
    const parentLua = parentArtifacts.find(
      (artifact) => artifact.stage === "LUA_GENERATION",
    );

    let carriedWorld: PipelineArtifact | null = null;
    let carriedDesign: PipelineArtifact | null = null;
    // ASSET_PLANNING requires a GAME_DESIGN edge, so the design has to be
    // committed before the plan that names it. Copying in stage order rather
    // than in whatever order the parent happens to list them.
    const carryOrder = (artifact: PipelineArtifact): number =>
      artifact.stage === "GAME_DESIGN" ? 0 : 1;

    for (const artifact of [...parentArtifacts].sort(
      (left, right) => carryOrder(left) - carryOrder(right),
    )) {
      if (
        artifact.stage === "LUA_GENERATION" ||
        artifact.stage === "SECURITY_REVIEW" ||
        artifact.stage === "VALIDATION" ||
        // NOVELTY-1. A DNA report holds history belonging to the execution
        // that produced it: an outcome, prior counts and the ids it compared
        // against. Carried forward, a repaired first run would still say
        // `no-prior-generations` while its own parent is now a prior
        // generation. Re-derived below from the world model this repair
        // carries forward unchanged, so the structure is the parent's and the
        // history is this execution's.
        artifact.stage === "GAME_DNA"
      ) {
        continue;
      }
      const carried = await this.artifactStore.store(
        newExecutionId,
        artifact.stage,
        artifact.agent,
        artifact.content,
        {
          projectId,
          // Carried forward by the repair engine, not re-produced by whatever
          // originally authored it. Claiming the original producer would say a
          // model ran during this repair when it did not.
          producer: deterministicProducer("repair-carry-forward"),
          // ASSET-FABRIC-1. The copy binds to the design copied into *this*
          // execution, not the parent's: a lineage edge must name an artifact
          // in the same project and run, and pointing back at the parent would
          // describe a derivation that did not happen here.
          ...(artifact.stage === "ASSET_PLANNING" && carriedDesign
            ? {
                dependencies: [ArtifactStoreClass.dependencyOn(carriedDesign)],
              }
            : {}),
        },
      );
      if (carried.stage === "WORLD_MODEL") carriedWorld = carried;
      if (carried.stage === "GAME_DESIGN") carriedDesign = carried;
    }

    // The repaired package is regenerated by `lua_generator` under the repair
    // executor, so the producer is that agent. What makes it a repair is the
    // lineage edge to the Lua it replaces, not a renamed producer.
    const luaDependencies: ArtifactDependency[] =
      parentLua && parentLua.contentHash
        ? [ArtifactStoreClass.dependencyOn(parentLua)]
        : [];

    const repairedLua = await this.artifactStore.store(
      newExecutionId,
      "LUA_GENERATION",
      "lua_generator",
      { scripts: repairedScripts },
      {
        projectId,
        producer: agentProducer("lua_generator"),
        dependencies: luaDependencies,
      },
    );

    await this.storeRepairedSecurityReview(
      newExecutionId,
      projectId,
      repairedLua,
    );
    return this.storeRepairedGameDna(newExecutionId, projectId, carriedWorld);
  }

  /**
   * Re-derive the structural fingerprint for the repaired execution.
   *
   * Unlike VALIDATION, this can honestly be rebuilt: the DNA is a pure
   * function of the world model, and a repair regenerates Lua while carrying
   * the design and architecture — and therefore the world model — unchanged.
   * So the structure is the parent's, while the comparison is this
   * execution's, which now has the parent among its prior generations.
   *
   * Carrying the parent's report instead would have made a repaired first run
   * still claim `no-prior-generations` while its own parent sat in the same
   * project. Nothing is recorded when no world model came across, because a
   * fingerprint with no upstream describes nothing.
   */
  private async storeRepairedGameDna(
    newExecutionId: string,
    projectId: string,
    carriedWorld: PipelineArtifact | null,
  ): Promise<NoveltyVerdictRecord | undefined> {
    if (!carriedWorld) return undefined;

    const dna = buildGameDnaFromStoredWorld(carriedWorld.content);
    if (!dna) return undefined;

    const priorsFound = new Set(
      this.artifactStore
        .getProjectStageArtifacts(projectId, "WORLD_MODEL")
        .map((artifact) => artifact.pipelineId)
        .filter((pipelineId) => pipelineId !== newExecutionId),
    ).size;

    const latestByExecution = new Map<string, PipelineArtifact>();
    for (const artifact of this.artifactStore.getProjectStageArtifacts(
      projectId,
      "GAME_DNA",
    )) {
      if (artifact.pipelineId === newExecutionId) continue;
      const held = latestByExecution.get(artifact.pipelineId);
      if (!held || held.createdAt <= artifact.createdAt) {
        latestByExecution.set(artifact.pipelineId, artifact);
      }
    }

    const priors = [...latestByExecution.values()]
      .map((artifact) => {
        const content = artifact.content as {
          fingerprint?: unknown;
          dna?: unknown;
        };
        const dna = decodeGameDna(content?.dna);
        if (!dna || typeof content?.fingerprint !== "string") return null;
        return {
          executionId: artifact.pipelineId,
          fingerprint: content.fingerprint,
          dna,
        };
      })
      .filter((prior): prior is NonNullable<typeof prior> => prior !== null);

    const report = buildGameDnaReport({ dna, priorsFound, priors });
    await this.artifactStore.store(newExecutionId, "GAME_DNA", null, report, {
      projectId,
      producer: deterministicProducer("game-dna"),
      dependencies: [ArtifactStoreClass.dependencyOn(carriedWorld)],
    });

    // NOVELTY-2. Derived after the repaired Lua is stored, so the ancestry
    // walk has the lineage edge to follow. A repaired execution has no
    // `GenerationExecution` row, so without this the `repair-preserved`
    // verdict would exist in code and be unreachable in production.
    const ancestry = resolveRepairAncestry(this.artifactStore, newExecutionId);
    return deriveNoveltyVerdict({
      report,
      ancestors: ancestry.ancestors,
      ancestryResolved: ancestry.resolved,
    });
  }

  /** Re-review the repaired Lua so no report outlives the code it describes. */
  private async storeRepairedSecurityReview(
    newExecutionId: string,
    projectId: string,
    repairedLua: PipelineArtifact,
  ): Promise<void> {
    let scripts;
    try {
      scripts = normalizeLuaScripts(repairedLua.content);
    } catch {
      // The repaired package failed to read back as scripts. No review is
      // recorded rather than one asserting a package nobody could parse.
      return;
    }

    await this.artifactStore.store(
      newExecutionId,
      "SECURITY_REVIEW",
      null,
      reviewLuaSecurity(scripts),
      {
        projectId,
        producer: deterministicProducer("lua-security-review"),
        dependencies: [ArtifactStoreClass.dependencyOn(repairedLua)],
      },
    );
  }
}
