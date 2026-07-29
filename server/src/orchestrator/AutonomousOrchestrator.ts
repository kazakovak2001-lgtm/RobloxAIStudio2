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
}

interface CheckpointSnapshot {
  context: AutonomousPhaseContext;
  phases: ExecutionNode[];
  qualityScore: number | null;
  genre?: string;
  cost: CostTracker;
}

export class AutonomousOrchestrator {
  private readonly sessions = new Map<string, OrchestratorSession>();
  private readonly contexts = new Map<string, AutonomousPhaseContext>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly activeExecutions = new Set<string>();
  private readonly restartRequests = new Set<string>();
  private readonly checkpointSequences = new Map<string, number>();
  private readonly events?: PipelineEventEmitter;
  private readonly phaseRegistry: AutonomousPhaseRegistry;

  constructor(
    events?: PipelineEventEmitter,
    options: AutonomousOrchestratorOptions = {},
  ) {
    this.events = events;
    this.phaseRegistry = options.phaseRegistry ?? new AutonomousPhaseRegistry();
  }

  /**
   * Start a bounded-service autonomous preview from a single prompt.
   */
  run(
    prompt: string,
    projectId: string,
    goals?: Partial<GoalConfig>,
  ): OrchestratorSession {
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
    };

    this.sessions.set(sessionId, session);
    this.contexts.set(sessionId, context);
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

    this.startExecution(session);
    return session;
  }

  getSession(sessionId: string): OrchestratorSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  getCapabilities(
    sessionId: string,
  ): Partial<Record<RunnableOrchestratorPhase, PhaseCapability>> | null {
    const context = this.contexts.get(sessionId);
    return context ? this.phaseRegistry.listCapabilities(context) : null;
  }

  pause(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "running") return false;
    session.status = "paused";
    session.currentPhase = "paused";
    this.controllers.get(sessionId)?.abort("paused");
    return true;
  }

  resume(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "paused") return false;
    session.status = "running";
    session.finishedAt = undefined;
    this.controllers.set(sessionId, new AbortController());
    const next = this.nextPendingNode(session);
    if (next) {
      session.currentPhase = next.phase;
      this.startExecution(session);
    } else {
      this.finishPreview(session);
    }
    return true;
  }

  cancel(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (
      !session ||
      (session.status !== "running" && session.status !== "paused")
    ) {
      return false;
    }
    session.status = "cancelled";
    session.currentPhase = "cancelled";
    session.finishedAt = Date.now();
    this.controllers.get(sessionId)?.abort("cancelled");
    return true;
  }

  recover(sessionId: string, checkpointId?: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status === "running") return false;

    const checkpoint = checkpointId
      ? session.checkpoints.find((candidate) => candidate.id === checkpointId)
      : session.checkpoints.at(-1);
    if (!checkpoint || !this.isCheckpointSnapshot(checkpoint.snapshot)) {
      return false;
    }

    const snapshot = checkpoint.snapshot;
    this.contexts.set(sessionId, this.clone(snapshot.context));
    session.phases = this.clone(snapshot.phases);
    session.qualityScore = snapshot.qualityScore;
    session.genre = snapshot.genre;
    session.cost = this.clone(snapshot.cost);
    session.status = "running";
    session.finishedAt = undefined;
    session.recoveryCount += 1;

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
      this.finishPreview(session);
      return true;
    }

    session.currentPhase = next.phase;
    this.controllers.set(sessionId, new AbortController());
    this.startExecution(session);
    return true;
  }

  private startExecution(session: OrchestratorSession): void {
    if (this.activeExecutions.has(session.id)) {
      this.restartRequests.add(session.id);
      return;
    }

    void this.executePhases(session);
  }

  private async executePhases(session: OrchestratorSession): Promise<void> {
    if (this.activeExecutions.has(session.id)) return;
    this.activeExecutions.add(session.id);

    try {
      const context = this.contexts.get(session.id);
      if (!context) throw new Error("Autonomous phase context is missing");

      for (const node of session.phases) {
        if (node.phase === "preview_completed") continue;
        if (node.status === "completed" || node.status === "skipped") continue;
        if (session.status !== "running") break;
        if (!PHASE_ORDER.includes(node.phase as RunnableOrchestratorPhase)) {
          continue;
        }

        if (this.isOverBudget(session)) {
          this.failForBudget(session, node);
          break;
        }

        const phase = node.phase as RunnableOrchestratorPhase;
        const adapter = this.phaseRegistry.get(phase);
        if (!adapter) {
          this.skipUnavailableNode(session, node, {
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
            this.handleInterruptedNode(session, node);
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
          this.contexts.set(session.id, result.context);
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

          this.checkpoint(session, phase);
        } catch (error) {
          if (this.isAbortError(error) || session.status !== "running") {
            this.handleInterruptedNode(session, node);
            break;
          }
          this.failPhase(session, node, stepId, agentName, error);
          break;
        }
      }

      if (session.status === "running" && !this.nextPendingNode(session)) {
        this.finishPreview(session);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      session.status = "failed";
      session.currentPhase = "failed";
      session.finishedAt = Date.now();
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
      this.activeExecutions.delete(session.id);
      const restartRequested = this.restartRequests.delete(session.id);
      if (
        session.status === "running" &&
        (restartRequested || this.nextPendingNode(session))
      ) {
        this.startExecution(session);
      }
    }
  }

  private finishPreview(session: OrchestratorSession): void {
    session.status = "preview_completed";
    session.currentPhase = "preview_completed";
    session.finishedAt = Date.now();

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

  private skipUnavailableNode(
    session: OrchestratorSession,
    node: ExecutionNode,
    capability: PhaseCapability,
  ): void {
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
    this.checkpoint(session, node.phase);
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

  private isOverBudget(session: OrchestratorSession): boolean {
    const elapsed = Date.now() - session.startedAt;
    return (
      elapsed > session.goals.timeLimitMs ||
      session.cost.totalCost > session.goals.maxCost
    );
  }

  private failForBudget(
    session: OrchestratorSession,
    node: ExecutionNode,
  ): void {
    session.status = "failed";
    session.currentPhase = "failed";
    session.finishedAt = Date.now();
    node.status = "failed";
    node.error = "Budget or time limit exceeded";

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

  private failPhase(
    session: OrchestratorSession,
    node: ExecutionNode,
    stepId: string,
    agentName: string,
    error: unknown,
  ): void {
    node.status = "failed";
    node.completedAt = Date.now();
    node.durationMs = node.completedAt - (node.startedAt ?? node.completedAt);
    node.error = error instanceof Error ? error.message : String(error);
    session.status = "failed";
    session.currentPhase = "failed";
    session.finishedAt = Date.now();

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

  private checkpoint(
    session: OrchestratorSession,
    phase: OrchestratorPhase,
  ): void {
    const context = this.contexts.get(session.id);
    if (!context) return;

    const snapshot: CheckpointSnapshot = {
      context: this.clone(context),
      phases: this.clone(session.phases),
      qualityScore: session.qualityScore,
      genre: session.genre,
      cost: this.clone(session.cost),
    };
    const sequence = (this.checkpointSequences.get(session.id) ?? 0) + 1;
    this.checkpointSequences.set(session.id, sequence);
    const checkpoint: Checkpoint = {
      id: `${session.id}:checkpoint:${sequence}`,
      phase,
      timestamp: Date.now(),
      snapshot: snapshot as unknown as Record<string, unknown>,
    };
    session.checkpoints.push(checkpoint);
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
