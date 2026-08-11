import type {
  Checkpoint,
  CostTracker,
  ExecutionNode,
  GoalConfig,
  OrchestratorPhase,
  OrchestratorSession,
} from "./OrchestratorTypes";
import { DEFAULT_GOALS, createSessionId } from "./OrchestratorTypes";
import {
  AutonomousPhaseRegistry,
  createAutonomousPhaseContext,
  type AutonomousPhaseContext,
  type PhaseCapability,
  type RunnableOrchestratorPhase,
} from "./AutonomousPhaseRegistry";
import type { PipelineEventEmitter } from "../socket/streaming";
import {
  createConfiguredAutonomousSessionStore,
  InMemoryAutonomousSessionStore,
  type AutonomousSessionRecord,
  type AutonomousSessionStore,
} from "./store/AutonomousSessionStore";

const PHASE_AGENT_NAMES: Record<RunnableOrchestratorPhase, string> = {
  genre_detection: "Genre Detector",
  knowledge_search: "Knowledge Search",
  blueprint: "Blueprint Generator",
  agent_collaboration: "Agent Collaboration",
  lua_generation: "Lua Generator",
  asset_generation: "Asset Generator",
  experience_assembly: "Experience Assembler",
  playtest: "Playtest Runner",
  repair: "Repair Engine",
  benchmark: "Benchmark Analyzer",
  studio_sync: "Studio Sync",
};

const PHASE_ORDER: RunnableOrchestratorPhase[] = [
  "genre_detection",
  "knowledge_search",
  "blueprint",
  "agent_collaboration",
  "lua_generation",
  "asset_generation",
  "experience_assembly",
  "playtest",
  "repair",
  "benchmark",
  "studio_sync",
];

export interface AutonomousOrchestratorOptions {
  /** @deprecated Bounded services do not use artificial simulation delays. */
  simulationDelayMs?: number;
  phaseRegistry?: AutonomousPhaseRegistry;
  sessionStore?: AutonomousSessionStore;
}

interface CheckpointSnapshot {
  context: AutonomousPhaseContext;
  phases: ExecutionNode[];
  /**
   * Quality of the previewed run, when a phase measured one.
   *
   * PLAYTEST-TRUTH-1. `null` on every session today. It used to be filled by
   * the playtest phase, whose number averaged an invented Lua score that
   * added five points when the source contained `pcall`. Nothing measures
   * quality now, so nothing sets this, and `null` means unmeasured rather
   * than zero or failed.
   */
  qualityScore: number | null;
  genre?: string;
  cost: CostTracker;
}

function isTerminalSessionStatus(
  status: OrchestratorSession["status"],
): boolean {
  return [
    "completed",
    "preview_completed",
    "simulated",
    "cancelled",
    "failed",
  ].includes(status);
}

export class AutonomousOrchestrator {
  private readonly sessions = new Map<string, OrchestratorSession>();
  private readonly contexts = new Map<string, AutonomousPhaseContext>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly activeExecutions = new Set<string>();
  private readonly restartRequests = new Set<string>();
  private readonly executionStartWaiters = new Map<string, () => void>();
  private readonly mutationTails = new Map<string, Promise<void>>();
  private readonly checkpointSequences = new Map<string, number>();
  private readonly events?: PipelineEventEmitter;
  private readonly phaseRegistry: AutonomousPhaseRegistry;
  private readonly sessionStore: AutonomousSessionStore;
  private readiness: Promise<void> | null = null;

  constructor(
    events?: PipelineEventEmitter,
    options: AutonomousOrchestratorOptions = {},
  ) {
    this.events = events;
    this.phaseRegistry = options.phaseRegistry ?? new AutonomousPhaseRegistry();
    this.sessionStore =
      options.sessionStore ??
      createConfiguredAutonomousSessionStore() ??
      new InMemoryAutonomousSessionStore();
  }

  async ready(): Promise<void> {
    this.readiness ??= this.recoverPersistedSessions().catch((error) => {
      this.readiness = null;
      throw error;
    });
    await this.readiness;
  }

  async refresh(): Promise<void> {
    await this.ready();
    await this.refreshPersistedSessions();
  }

  /**
   * Start a bounded-service autonomous preview from a single prompt.
   */
  async run(
    prompt: string,
    projectId: string,
    goals?: Partial<GoalConfig>,
  ): Promise<OrchestratorSession> {
    await this.ready();
    const config: GoalConfig = { ...DEFAULT_GOALS, ...goals };
    const sessionId = createSessionId();
    const context = createAutonomousPhaseContext(projectId, prompt);

    const session: OrchestratorSession = {
      id: sessionId,
      projectId,
      prompt,
      executionMode: "bounded",
      resultAuthority: "preview-only",
      status: "running",
      currentPhase: "genre_detection",
      phases: [
        ...PHASE_ORDER.map((phase) => ({
          id: `node-${phase}`,
          phase,
          status: "pending" as const,
          executionMode: "bounded" as const,
        })),
        {
          id: "node-preview-completed",
          phase: "preview_completed",
          status: "pending",
          executionMode: "bounded",
          evidence: "heuristic",
        },
      ],
      goals: config,
      cost: this.emptyCost(),
      checkpoints: [],
      qualityScore: null,
      startedAt: Date.now(),
      estimatedCost: 0,
      recoveryCount: 0,
      executionGeneration: 0,
    };

    await this.persistAndPublish({
      session,
      context,
      checkpointSequence: 0,
    });
    this.controllers.set(sessionId, new AbortController());

    void this.events?.emit({
      type: "pipeline.started",
      pipelineId: session.id,
      projectId: session.projectId,
      data: {
        executionMode: session.executionMode,
        resultAuthority: session.resultAuthority,
        preview: true,
        boundedServices: true,
      },
      timestamp: new Date(),
    });

    const executionStarted = new Promise<void>((resolve) => {
      this.executionStartWaiters.set(sessionId, resolve);
    });
    this.startExecution(sessionId);
    await executionStarted;
    const started = this.sessions.get(sessionId);
    if (!started) {
      throw new Error(`Autonomous session ${sessionId} failed to start`);
    }
    return started;
  }

  getSession(sessionId: string): OrchestratorSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  getLatestSessionForProject(projectId: string): OrchestratorSession | null {
    return (
      [...this.sessions.values()]
        .filter((session) => session.projectId === projectId)
        .sort((left, right) => right.startedAt - left.startedAt)[0] ?? null
    );
  }

  getCapabilities(
    sessionId: string,
  ): Partial<Record<RunnableOrchestratorPhase, PhaseCapability>> | null {
    const context = this.contexts.get(sessionId);
    return context ? this.phaseRegistry.listCapabilities(context) : null;
  }

  async pause(sessionId: string): Promise<boolean> {
    await this.refresh();
    const record = this.sessionStore.get(sessionId);
    const session = record?.session;
    if (!session || session.status !== "running") return false;
    session.status = "paused";
    session.currentPhase = "paused";
    await this.persistAndPublish(record, true);
    this.controllers.get(sessionId)?.abort("paused");
    return true;
  }

  async resume(sessionId: string): Promise<boolean> {
    await this.refresh();
    const record = this.sessionStore.get(sessionId);
    const session = record?.session;
    if (
      !session ||
      session.status !== "paused" ||
      session.recoveryReason === "server_restart"
    ) {
      return false;
    }
    session.status = "running";
    session.finishedAt = undefined;
    session.executionGeneration += 1;
    const next = this.nextPendingNode(session);
    if (next) {
      session.currentPhase = next.phase;
      if (!(await this.claimExecutionAndPublish(record))) return false;
      this.controllers.set(sessionId, new AbortController());
      this.startExecution(sessionId);
    } else {
      if (!(await this.claimExecutionAndPublish(record))) return false;
      await this.finishPreview(record);
    }
    return true;
  }

  async cancel(sessionId: string): Promise<boolean> {
    await this.refresh();
    const record = this.sessionStore.get(sessionId);
    const session = record?.session;
    if (
      !session ||
      (session.status !== "running" && session.status !== "paused")
    ) {
      return false;
    }
    session.status = "cancelled";
    session.currentPhase = "cancelled";
    session.finishedAt = Date.now();
    await this.persistAndPublish(record, true);
    this.controllers.get(sessionId)?.abort("cancelled");
    return true;
  }

  async recover(sessionId: string, checkpointId?: string): Promise<boolean> {
    await this.refresh();
    const record = this.sessionStore.get(sessionId);
    const session = record?.session;
    if (!session || session.status === "running") return false;

    const checkpoint = checkpointId
      ? session.checkpoints.find((candidate) => candidate.id === checkpointId)
      : session.checkpoints.at(-1);
    const snapshot = checkpoint?.snapshot;
    const recoverableSnapshot = this.isCheckpointSnapshot(snapshot)
      ? snapshot
      : !checkpointId && session.recoveryReason === "server_restart"
        ? {
            context: this.clone(record.context),
            phases: this.clone(session.phases),
            qualityScore: session.qualityScore,
            genre: session.genre,
            cost: this.clone(session.cost),
          }
        : null;
    if (!recoverableSnapshot) return false;

    record.context = this.clone(recoverableSnapshot.context);
    session.phases = this.clone(recoverableSnapshot.phases);
    session.qualityScore = recoverableSnapshot.qualityScore;
    session.genre = recoverableSnapshot.genre;
    session.cost = this.clone(recoverableSnapshot.cost);
    session.status = "running";
    session.finishedAt = undefined;
    session.recoveryCount += 1;
    session.executionGeneration += 1;
    session.restartInterruptedAt = undefined;
    session.recoveryReason = undefined;
    session.terminalEvidenceId = undefined;

    const terminal = session.phases.find(
      (node) => node.phase === "preview_completed",
    );
    if (terminal) {
      terminal.status = "pending";
      terminal.startedAt = undefined;
      terminal.completedAt = undefined;
      terminal.durationMs = undefined;
      terminal.output = undefined;
    }

    const next = this.nextPendingNode(session);
    if (!next) {
      if (!(await this.claimExecutionAndPublish(record))) return false;
      await this.finishPreview(record);
      return true;
    }

    session.currentPhase = next.phase;
    if (!(await this.claimExecutionAndPublish(record))) return false;
    this.controllers.set(sessionId, new AbortController());
    this.startExecution(sessionId);
    return true;
  }

  private startExecution(sessionId: string): void {
    if (this.activeExecutions.has(sessionId)) {
      this.restartRequests.add(sessionId);
      return;
    }

    void this.executePhases(sessionId);
  }

  private async executePhases(sessionId: string): Promise<void> {
    if (this.activeExecutions.has(sessionId)) {
      this.signalExecutionStarted(sessionId);
      return;
    }
    const record = this.sessionStore.get(sessionId);
    if (!record) {
      this.signalExecutionStarted(sessionId);
      return;
    }
    const session = record.session;
    this.activeExecutions.add(sessionId);

    try {
      let context = record.context;

      for (const node of session.phases) {
        if (node.phase === "preview_completed") continue;
        if (node.status === "completed" || node.status === "skipped") continue;
        if (session.status !== "running") break;
        if (!PHASE_ORDER.includes(node.phase as RunnableOrchestratorPhase)) {
          continue;
        }

        if (this.isOverBudget(session)) {
          await this.failForBudget(record, node);
          break;
        }

        const phase = node.phase as RunnableOrchestratorPhase;
        const adapter = this.phaseRegistry.get(phase);
        if (!adapter) {
          await this.skipUnavailableNode(record, node, {
            status: "unavailable",
            evidence: "synthetic",
            service: "unregistered",
            reason: `No bounded adapter is registered for ${phase}`,
            cancellable: false,
            checkpointable: false,
          });
          continue;
        }

        const capability = adapter.capability(context);
        this.applyCapability(node, capability);

        session.currentPhase = phase;
        node.status = "running";
        node.startedAt = Date.now();
        await this.persistAndPublish(record);
        this.signalExecutionStarted(session.id);

        const agentName = PHASE_AGENT_NAMES[phase];
        const stepId = `auto-${phase}`;

        if (capability.status !== "unavailable") {
          void this.events?.emitStepStarted(
            session.id,
            stepId,
            agentName,
            session.projectId,
          );
        }

        try {
          const controller = this.controllers.get(session.id);
          if (!controller)
            throw new Error("Autonomous abort controller is missing");

          const result = await adapter.execute(context, controller.signal);
          if (controller.signal.aborted || session.status !== "running") {
            await this.settleInterruptedExecution(record, node);
            break;
          }

          node.status = result.status;
          node.executionMode = "bounded";
          node.evidence = result.evidence;
          node.service = result.service;
          node.completedAt = Date.now();
          node.durationMs =
            node.completedAt - (node.startedAt ?? node.completedAt);
          node.output = result.output;
          node.skippedReason = result.reason;

          if (result.qualityScore !== undefined) {
            session.qualityScore = result.qualityScore;
          }
          session.genre = result.context.genre;
          context = result.context;
          record.context = result.context;
          this.trackCost(session, node);

          const eventOutput = {
            ...result.output,
            executionMode: session.executionMode,
            resultAuthority: session.resultAuthority,
            evidence: result.evidence,
            capability: node.capability,
            service: result.service,
            cost: session.cost.perPhase[phase],
            durationMs: node.durationMs,
          };

          await this.checkpoint(record, phase);
          if (session.status !== "running") break;

          if (result.status === "completed") {
            void this.events?.emitStepCompleted(
              session.id,
              stepId,
              agentName,
              eventOutput,
              session.projectId,
            );
          } else {
            void this.events?.emit({
              type: "step.skipped",
              pipelineId: session.id,
              projectId: session.projectId,
              stepId,
              data: { name: agentName, output: eventOutput },
              timestamp: new Date(),
            });
          }
        } catch (error) {
          if (this.isAbortError(error) || session.status !== "running") {
            await this.settleInterruptedExecution(record, node);
            break;
          }
          await this.failPhase(record, node, stepId, agentName, error);
          break;
        }
      }

      if (session.status === "running" && !this.nextPendingNode(session)) {
        await this.finishPreview(record);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      session.status = "failed";
      session.currentPhase = "failed";
      session.finishedAt = Date.now();
      await this.persistAndPublish(record);
      void this.events?.emitPipelineFailed(
        session.id,
        message,
        session.projectId,
        {
          executionMode: session.executionMode,
          resultAuthority: session.resultAuthority,
          completedSteps: session.phases.filter(
            (phaseNode) => phaseNode.status === "completed",
          ).length,
        },
      );
    } finally {
      this.signalExecutionStarted(session.id);
      this.activeExecutions.delete(session.id);
      const restartRequested = this.restartRequests.delete(session.id);
      if (
        session.status === "running" &&
        (restartRequested || this.nextPendingNode(session))
      ) {
        this.startExecution(session.id);
      }
    }
  }

  private signalExecutionStarted(sessionId: string): void {
    const resolve = this.executionStartWaiters.get(sessionId);
    if (!resolve) return;
    this.executionStartWaiters.delete(sessionId);
    resolve();
  }

  private async finishPreview(record: AutonomousSessionRecord): Promise<void> {
    const session = record.session;
    if (session.status === "preview_completed" && session.terminalEvidenceId) {
      return;
    }
    session.status = "preview_completed";
    session.currentPhase = "preview_completed";
    session.finishedAt = Date.now();
    session.terminalEvidenceId = `${session.id}:terminal:${session.recoveryCount}`;

    const terminalNode = session.phases.find(
      (phase) => phase.phase === "preview_completed",
    );
    if (terminalNode) {
      terminalNode.status = "completed";
      terminalNode.executionMode = "bounded";
      terminalNode.evidence = "heuristic";
      terminalNode.capability = "degraded";
      terminalNode.service = "AutonomousOrchestrator";
      terminalNode.startedAt = session.finishedAt;
      terminalNode.completedAt = session.finishedAt;
      terminalNode.durationMs = 0;
      terminalNode.output = {
        productionCompleted: false,
        resultAuthority: session.resultAuthority,
        verifiedStudioArtifacts: 0,
      };
    }

    const completedPhases = session.phases.filter(
      (phase) => phase.status === "completed" && phase !== terminalNode,
    );
    const skippedPhases = session.phases.filter(
      (phase) => phase.status === "skipped",
    );

    await this.persistAndPublish(record);

    void this.events?.emit({
      type: "pipeline.preview.completed",
      pipelineId: session.id,
      projectId: session.projectId,
      data: {
        executionMode: session.executionMode,
        resultAuthority: session.resultAuthority,
        completedPhases: completedPhases.length,
        verifiedPhases: completedPhases.filter(
          (phase) => phase.evidence === "verified",
        ).length,
        degradedPhases: session.phases.filter(
          (phase) => phase.capability === "degraded",
        ).length,
        unavailablePhases: session.phases.filter(
          (phase) => phase.capability === "unavailable",
        ).length,
        skippedPhases: skippedPhases.length,
        qualityScore: session.qualityScore,
        genre: session.genre,
        totalCost: session.cost.totalCost,
        productionCompleted: false,
        recoveryCount: session.recoveryCount,
      },
      timestamp: new Date(),
    });
  }

  private nextPendingNode(
    session: OrchestratorSession,
  ): ExecutionNode | undefined {
    return session.phases.find(
      (node) =>
        node.phase !== "preview_completed" &&
        (node.status === "pending" || node.status === "running"),
    );
  }

  private applyCapability(
    node: ExecutionNode,
    capability: PhaseCapability,
  ): void {
    node.capability = capability.status;
    node.evidence = capability.evidence;
    node.service = capability.service;
    node.cancellable = capability.cancellable;
    node.checkpointable = capability.checkpointable;
  }

  private async skipUnavailableNode(
    record: AutonomousSessionRecord,
    node: ExecutionNode,
    capability: PhaseCapability,
  ): Promise<void> {
    const session = record.session;
    this.applyCapability(node, capability);
    node.status = "skipped";
    node.executionMode = "bounded";
    node.startedAt = Date.now();
    node.completedAt = node.startedAt;
    node.durationMs = 0;
    node.skippedReason = capability.reason;
    node.output = {
      capability: capability.status,
      service: capability.service,
      reason: capability.reason,
    };
    this.trackCost(session, node);
    await this.checkpoint(record, node.phase);
  }

  private handleInterruptedNode(
    session: OrchestratorSession,
    node: ExecutionNode,
  ): void {
    if (session.status === "paused") {
      node.status = "pending";
      node.startedAt = undefined;
      node.completedAt = undefined;
      node.durationMs = undefined;
      return;
    }
    if (session.status === "cancelled") {
      node.status = "skipped";
      node.completedAt = Date.now();
      node.durationMs = node.completedAt - (node.startedAt ?? node.completedAt);
      node.skippedReason = "Session cancelled";
    }
  }

  private async settleInterruptedExecution(
    record: AutonomousSessionRecord,
    staleNode: ExecutionNode,
  ): Promise<void> {
    const staleGeneration = record.session.executionGeneration;
    await this.sessionStore.refresh?.();
    const acknowledged = this.sessionStore.get(record.session.id);
    if (!acknowledged) {
      this.handleInterruptedNode(record.session, staleNode);
      await this.persistAndPublish(record);
      return;
    }

    if (acknowledged.session.executionGeneration === staleGeneration) {
      const acknowledgedNode = acknowledged.session.phases.find(
        (node) => node.id === staleNode.id,
      );
      if (acknowledgedNode) {
        this.handleInterruptedNode(acknowledged.session, acknowledgedNode);
      }
      await this.persistAndPublish(acknowledged);
    }

    this.replaceSession(record.session, acknowledged.session);
    record.context = structuredClone(acknowledged.context);
    record.checkpointSequence = acknowledged.checkpointSequence;
  }

  private isOverBudget(session: OrchestratorSession): boolean {
    const elapsed = Date.now() - session.startedAt;
    return (
      elapsed > session.goals.timeLimitMs ||
      session.cost.totalCost > session.goals.maxCost
    );
  }

  private async failForBudget(
    record: AutonomousSessionRecord,
    node: ExecutionNode,
  ): Promise<void> {
    const session = record.session;
    session.status = "failed";
    session.currentPhase = "failed";
    session.finishedAt = Date.now();
    node.status = "failed";
    node.error = "Budget or time limit exceeded";
    await this.persistAndPublish(record);

    const phase = node.phase as RunnableOrchestratorPhase;
    const agentName = PHASE_AGENT_NAMES[phase] ?? node.phase;
    const stepId = `auto-${node.phase}`;
    void this.events?.emitStepFailed(
      session.id,
      stepId,
      agentName,
      node.error,
      session.projectId,
    );
    void this.events?.emitPipelineFailed(
      session.id,
      node.error,
      session.projectId,
      {
        executionMode: session.executionMode,
        resultAuthority: session.resultAuthority,
        failedStepId: stepId,
        failedAgentId: agentName,
        completedSteps: session.phases.filter(
          (phaseNode) => phaseNode.status === "completed",
        ).length,
      },
    );
  }

  private async failPhase(
    record: AutonomousSessionRecord,
    node: ExecutionNode,
    stepId: string,
    agentName: string,
    error: unknown,
  ): Promise<void> {
    const session = record.session;
    node.status = "failed";
    node.completedAt = Date.now();
    node.durationMs = node.completedAt - (node.startedAt ?? node.completedAt);
    node.error = error instanceof Error ? error.message : String(error);
    session.status = "failed";
    session.currentPhase = "failed";
    session.finishedAt = Date.now();
    await this.persistAndPublish(record);

    void this.events?.emitStepFailed(
      session.id,
      stepId,
      agentName,
      node.error,
      session.projectId,
    );
    void this.events?.emitPipelineFailed(
      session.id,
      node.error,
      session.projectId,
      {
        executionMode: session.executionMode,
        resultAuthority: session.resultAuthority,
        failedStepId: stepId,
        failedAgentId: agentName,
        completedSteps: session.phases.filter(
          (phaseNode) => phaseNode.status === "completed",
        ).length,
      },
    );
  }

  private trackCost(session: OrchestratorSession, node: ExecutionNode): void {
    const timeMs = node.durationMs ?? 0;
    session.cost.totalTimeMs += timeMs;
    session.cost.perPhase[node.phase] = {
      tokens: 0,
      cost: 0,
      timeMs,
      source: "measured",
    };
  }

  private async checkpoint(
    record: AutonomousSessionRecord,
    phase: OrchestratorPhase,
  ): Promise<void> {
    const session = record.session;
    const context = record.context;

    const snapshot: CheckpointSnapshot = {
      context: this.clone(context),
      phases: this.clone(session.phases),
      qualityScore: session.qualityScore,
      genre: session.genre,
      cost: this.clone(session.cost),
    };
    const sequence = record.checkpointSequence + 1;
    record.checkpointSequence = sequence;
    const checkpoint: Checkpoint = {
      id: `${session.id}:checkpoint:${sequence}`,
      phase,
      timestamp: Date.now(),
      snapshot: snapshot as unknown as Record<string, unknown>,
    };
    session.checkpoints.push(checkpoint);
    await this.persistAndPublish(record);
  }

  private isCheckpointSnapshot(value: unknown): value is CheckpointSnapshot {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    const snapshot = value as Partial<CheckpointSnapshot>;
    const context = snapshot.context as
      Partial<AutonomousPhaseContext> | undefined;
    if (
      !context ||
      typeof context.projectId !== "string" ||
      typeof context.prompt !== "string" ||
      !Array.isArray(context.systems) ||
      !Array.isArray(snapshot.phases) ||
      !snapshot.phases.every(
        (node) =>
          Boolean(node) &&
          typeof node.id === "string" &&
          typeof node.phase === "string" &&
          typeof node.status === "string",
      ) ||
      (snapshot.qualityScore !== null &&
        typeof snapshot.qualityScore !== "number") ||
      (snapshot.genre !== undefined && typeof snapshot.genre !== "string") ||
      !this.isCostTracker(snapshot.cost)
    ) {
      return false;
    }

    return true;
  }

  private isCostTracker(value: unknown): value is CostTracker {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    const cost = value as Partial<CostTracker>;
    return (
      typeof cost.totalTokens === "number" &&
      Number.isFinite(cost.totalTokens) &&
      typeof cost.totalCost === "number" &&
      Number.isFinite(cost.totalCost) &&
      typeof cost.totalTimeMs === "number" &&
      Number.isFinite(cost.totalTimeMs) &&
      (cost.source === "synthetic" || cost.source === "measured") &&
      Boolean(cost.perPhase) &&
      typeof cost.perPhase === "object" &&
      !Array.isArray(cost.perPhase)
    );
  }

  private async recoverPersistedSessions(): Promise<void> {
    await this.sessionStore.ready();
    await this.sessionStore.refresh?.();
    await this.sessionStore.markInterrupted();
    await this.sessionStore.refresh?.();
    this.hydratePersistedSessions();
  }

  private async refreshPersistedSessions(): Promise<void> {
    await this.sessionStore.refresh?.();
    this.hydratePersistedSessions();
  }

  private hydratePersistedSessions(): void {
    for (const record of this.sessionStore.getAll()) {
      this.publish(record);
    }
  }

  private async persistAndPublish(
    record: AutonomousSessionRecord,
    allowPausedTransition = false,
  ): Promise<void> {
    const sessionId = record.session.id;
    const previous = this.mutationTails.get(sessionId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.mutationTails.set(sessionId, current);

    await previous;
    try {
      await this.sessionStore.refresh?.();
      let snapshot = structuredClone(record);
      const acknowledged = this.sessionStore.get(sessionId);

      if (
        acknowledged &&
        (snapshot.session.status === "paused" ||
          snapshot.session.status === "cancelled") &&
        acknowledged.session.status === "running" &&
        allowPausedTransition
      ) {
        acknowledged.session.status = snapshot.session.status;
        acknowledged.session.currentPhase = snapshot.session.currentPhase;
        acknowledged.session.finishedAt = snapshot.session.finishedAt;
        snapshot = acknowledged;
      } else if (
        acknowledged &&
        acknowledged.session.status === "running" &&
        (snapshot.session.status === "paused" ||
          snapshot.session.status === "cancelled") &&
        !allowPausedTransition
      ) {
        record.session.status = acknowledged.session.status;
        record.session.currentPhase = acknowledged.session.currentPhase;
        return;
      } else if (
        acknowledged &&
        (acknowledged.session.status === "paused" ||
          acknowledged.session.status === "cancelled") &&
        snapshot.session.status !== acknowledged.session.status &&
        !allowPausedTransition
      ) {
        record.session.status = acknowledged.session.status;
        record.session.currentPhase = acknowledged.session.currentPhase;
        return;
      } else if (
        acknowledged &&
        isTerminalSessionStatus(acknowledged.session.status) &&
        acknowledged.session.status !== snapshot.session.status &&
        !allowPausedTransition
      ) {
        this.replaceSession(record.session, acknowledged.session);
        record.context = structuredClone(acknowledged.context);
        record.checkpointSequence = acknowledged.checkpointSequence;
        return;
      }

      await this.sessionStore.save(snapshot);
      this.publish(snapshot);
    } finally {
      release();
      if (this.mutationTails.get(sessionId) === current) {
        this.mutationTails.delete(sessionId);
      }
    }
  }

  private async claimExecutionAndPublish(
    record: AutonomousSessionRecord,
  ): Promise<boolean> {
    const snapshot = structuredClone(record);
    const claimed = await this.sessionStore.claimExecution(snapshot);
    if (!claimed) return false;
    this.publish(snapshot);
    return true;
  }

  private publish(record: AutonomousSessionRecord): void {
    const snapshot = structuredClone(record);
    const existing = this.sessions.get(snapshot.session.id);
    if (existing) {
      if (!this.sessionsEqual(existing, snapshot.session)) {
        this.replaceSession(existing, snapshot.session);
      }
    } else {
      this.sessions.set(snapshot.session.id, snapshot.session);
    }
    this.contexts.set(snapshot.session.id, snapshot.context);
    this.checkpointSequences.set(
      snapshot.session.id,
      snapshot.checkpointSequence,
    );
  }

  private replaceSession(
    target: OrchestratorSession,
    source: OrchestratorSession,
  ): void {
    const mutable = target as unknown as Record<string, unknown>;
    for (const key of Object.keys(mutable)) {
      delete mutable[key];
    }
    Object.assign(target, structuredClone(source));
  }

  private sessionsEqual(
    left: OrchestratorSession,
    right: OrchestratorSession,
  ): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  private emptyCost(): CostTracker {
    return {
      totalTokens: 0,
      totalCost: 0,
      totalTimeMs: 0,
      source: "measured",
      perPhase: {},
    };
  }

  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private isAbortError(error: unknown): boolean {
    return (
      (error instanceof Error && error.name === "AbortError") ||
      error === "paused" ||
      error === "cancelled"
    );
  }
}
