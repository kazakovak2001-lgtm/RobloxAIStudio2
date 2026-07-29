import type {
  OrchestratorSession,
  OrchestratorPhase,
  GoalConfig,
  ExecutionNode,
  CostTracker,
  Checkpoint,
  EvidenceLevel,
  ExecutionStatus,
} from "./OrchestratorTypes";
import { DEFAULT_GOALS, createSessionId } from "./OrchestratorTypes";
import type { PipelineEventEmitter } from "../socket/streaming";

const PHASE_AGENT_NAMES: Record<string, string> = {
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

const PHASE_DURATIONS: Record<string, number> = {
  genre_detection: 50,
  knowledge_search: 80,
  blueprint: 100,
  agent_collaboration: 150,
  lua_generation: 200,
  asset_generation: 100,
  experience_assembly: 80,
  playtest: 120,
  repair: 180,
  benchmark: 60,
  studio_sync: 40,
};

const PHASE_ORDER: OrchestratorPhase[] = [
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
  simulationDelayMs?: number;
}

interface PhaseExecutionResult {
  status: Extract<ExecutionStatus, "completed" | "simulated">;
  evidence: EvidenceLevel;
  output: Record<string, unknown>;
}

export class AutonomousOrchestrator {
  private sessions: Map<string, OrchestratorSession> = new Map();
  private activeRuns: Map<string, Promise<void>> = new Map();
  private events?: PipelineEventEmitter;
  private options: AutonomousOrchestratorOptions;

  constructor(
    events?: PipelineEventEmitter,
    options: AutonomousOrchestratorOptions = {},
  ) {
    this.events = events;
    this.options = options;
  }

  /**
   * Start preview-only autonomous simulation from a single prompt.
   */
  run(
    prompt: string,
    projectId: string,
    goals?: Partial<GoalConfig>,
  ): OrchestratorSession {
    const config: GoalConfig = { ...DEFAULT_GOALS, ...goals };
    const sessionId = createSessionId();

    const session: OrchestratorSession = {
      id: sessionId,
      projectId,
      prompt,
      executionMode: "simulation",
      resultAuthority: "preview-only",
      status: "running",
      currentPhase: "genre_detection",
      phases: [
        ...PHASE_ORDER.map((phase) => ({
          id: `node-${phase}`,
          phase,
          status: "pending" as const,
          executionMode: "simulation" as const,
        })),
        {
          id: "node-simulated",
          phase: "simulated",
          status: "pending",
          executionMode: "simulation",
          evidence: "synthetic",
        },
      ],
      goals: config,
      cost: this.emptyCost(),
      checkpoints: [],
      qualityScore: null,
      startedAt: Date.now(),
      estimatedTimeMs: this.estimateTime(config),
      estimatedCost: 0,
    };

    this.sessions.set(sessionId, session);

    void this.events?.emit({
      type: "pipeline.started",
      pipelineId: session.id,
      projectId: session.projectId,
      data: {
        executionMode: session.executionMode,
        resultAuthority: session.resultAuthority,
        preview: true,
      },
      timestamp: new Date(),
    });

    this.startExecution(session);
    return session;
  }

  getSession(sessionId: string): OrchestratorSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  pause(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "running") return false;
    session.status = "paused";
    session.currentPhase = "paused";
    return true;
  }

  resume(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "paused") return false;
    session.status = "running";
    const next = session.phases.find(
      (phase) =>
        phase.phase !== "simulated" &&
        (phase.status === "pending" || phase.status === "running"),
    );
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
    return true;
  }

  private startExecution(session: OrchestratorSession): void {
    if (this.activeRuns.has(session.id)) return;

    const run = this.executePhases(session).finally(() => {
      if (this.activeRuns.get(session.id) !== run) return;
      this.activeRuns.delete(session.id);

      if (session.status === "running" && this.hasRemainingWork(session)) {
        this.startExecution(session);
      }
    });

    this.activeRuns.set(session.id, run);
  }

  private async executePhases(session: OrchestratorSession): Promise<void> {
    for (const node of session.phases) {
      if (node.phase === "simulated") continue;
      if (
        node.status === "completed" ||
        node.status === "simulated" ||
        node.status === "skipped"
      ) {
        continue;
      }
      if (session.status !== "running") break;

      if (this.shouldSkip(session, node.phase)) {
        node.status = "skipped";
        node.executionMode = "simulation";
        node.evidence = "synthetic";
        node.skippedReason = this.skipReason(session, node.phase);
        continue;
      }

      if (this.isOverBudget(session)) {
        this.failForBudget(session, node);
        break;
      }

      session.currentPhase = node.phase;
      node.status = "running";
      node.startedAt = Date.now();

      const agentName = PHASE_AGENT_NAMES[node.phase] ?? node.phase;
      const stepId = `auto-${node.phase}`;
      void this.events?.emitStepStarted(
        session.id,
        stepId,
        agentName,
        session.projectId,
      );

      try {
        const result = await this.executePhase(session, node.phase);
        if (session.status !== "running") {
          node.status = "pending";
          return;
        }

        node.status = result.status;
        node.executionMode = "simulation";
        node.evidence = result.evidence;
        node.completedAt = Date.now();
        node.durationMs = node.completedAt - node.startedAt;
        node.output = result.output;

        this.trackCost(session, node);

        const eventOutput = {
          ...result.output,
          executionMode: session.executionMode,
          resultAuthority: session.resultAuthority,
          evidence: result.evidence,
          cost: session.cost.perPhase[node.phase],
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
            type: "step.simulated",
            pipelineId: session.id,
            projectId: session.projectId,
            stepId,
            data: { name: agentName, output: eventOutput },
            timestamp: new Date(),
          });
        }

        this.checkpoint(session, node.phase);
      } catch (error) {
        if (session.status !== "running") {
          node.status = "pending";
          return;
        }

        this.failPhase(session, node, stepId, agentName, error);
        break;
      }
    }

    if (session.status === "running" && !this.hasRemainingWork(session)) {
      this.finishPreview(session);
    }
  }

  private hasRemainingWork(session: OrchestratorSession): boolean {
    return session.phases.some(
      (phase) =>
        phase.phase !== "simulated" &&
        (phase.status === "pending" || phase.status === "running"),
    );
  }

  private async executePhase(
    session: OrchestratorSession,
    phase: OrchestratorPhase,
  ): Promise<PhaseExecutionResult> {
    const duration =
      this.options.simulationDelayMs ?? PHASE_DURATIONS[phase] ?? 50;
    await new Promise((resolve) => setTimeout(resolve, duration));

    if (phase === "genre_detection") {
      session.genre = this.detectGenre(session.prompt);
      return {
        status: "completed",
        evidence: "heuristic",
        output: {
          genre: session.genre,
          method: "local-keyword-heuristic",
          verified: false,
        },
      };
    }

    if (phase === "playtest") {
      return {
        status: "simulated",
        evidence: "synthetic",
        output: {
          score: null,
          verification: "not-performed",
          reason: "No Roblox runtime playtest is executed in simulation mode.",
        },
      };
    }

    if (phase === "benchmark") {
      return {
        status: "simulated",
        evidence: "synthetic",
        output: {
          benchmarkScore: null,
          verification: "not-performed",
        },
      };
    }

    return {
      status: "simulated",
      evidence: "synthetic",
      output: {
        phase,
        status: "simulated",
        engineInvoked: false,
      },
    };
  }

  private finishPreview(session: OrchestratorSession): void {
    session.status = "simulated";
    session.currentPhase = "simulated";
    session.finishedAt = Date.now();

    const terminalNode = session.phases.find(
      (phase) => phase.phase === "simulated",
    );
    if (terminalNode) {
      terminalNode.status = "simulated";
      terminalNode.executionMode = "simulation";
      terminalNode.evidence = "synthetic";
      terminalNode.startedAt = session.finishedAt;
      terminalNode.completedAt = session.finishedAt;
      terminalNode.durationMs = 0;
      terminalNode.output = {
        productionCompleted: false,
        resultAuthority: session.resultAuthority,
      };
    }

    const simulatedPhases = session.phases.filter(
      (phase) => phase.status === "simulated",
    ).length;
    const completedHeuristics = session.phases.filter(
      (phase) => phase.status === "completed",
    ).length;

    void this.events?.emit({
      type: "pipeline.preview.completed",
      pipelineId: session.id,
      projectId: session.projectId,
      data: {
        executionMode: session.executionMode,
        resultAuthority: session.resultAuthority,
        simulatedPhases,
        completedHeuristics,
        skippedPhases: session.phases.filter(
          (phase) => phase.status === "skipped",
        ).length,
        qualityScore: session.qualityScore,
        genre: session.genre,
        totalCost: session.cost.totalCost,
        productionCompleted: false,
      },
      timestamp: new Date(),
    });
  }

  private shouldSkip(
    session: OrchestratorSession,
    phase: OrchestratorPhase,
  ): boolean {
    const qualityScore = session.qualityScore;
    if (phase === "repair") {
      if (qualityScore === null) return true;
      return qualityScore >= session.goals.targetScore;
    }
    if (phase === "studio_sync") {
      if (session.executionMode === "simulation") return true;
      return qualityScore !== null && qualityScore < 50;
    }
    return false;
  }

  private skipReason(
    session: OrchestratorSession,
    phase: OrchestratorPhase,
  ): string {
    if (phase === "repair" && session.qualityScore === null) {
      return "No verified playtest score is available in simulation mode.";
    }
    if (phase === "repair") {
      return `Quality ${session.qualityScore} >= target ${session.goals.targetScore}`;
    }
    if (phase === "studio_sync" && session.executionMode === "simulation") {
      return "Simulation mode cannot deliver or verify artifacts in Roblox Studio.";
    }
    if (phase === "studio_sync") {
      return `Quality ${session.qualityScore} too low for sync`;
    }
    return "Skipped by preview policy";
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

    const agentName = PHASE_AGENT_NAMES[node.phase] ?? node.phase;
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
          (phase) =>
            phase.status === "completed" || phase.status === "simulated",
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
    node.durationMs = node.completedAt - (node.startedAt ?? Date.now());
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
          (phase) =>
            phase.status === "completed" || phase.status === "simulated",
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
      source: "synthetic",
    };
  }

  private checkpoint(
    session: OrchestratorSession,
    phase: OrchestratorPhase,
  ): void {
    const checkpoint: Checkpoint = {
      phase,
      timestamp: Date.now(),
      snapshot: {
        executionMode: session.executionMode,
        resultAuthority: session.resultAuthority,
        qualityScore: session.qualityScore,
        cost: {
          ...session.cost,
          perPhase: { ...session.cost.perPhase },
        },
        completedHeuristics: session.phases.filter(
          (item) => item.status === "completed",
        ).length,
        simulatedPhases: session.phases.filter(
          (item) => item.status === "simulated",
        ).length,
      },
    };
    session.checkpoints.push(checkpoint);
  }

  private detectGenre(prompt: string): string {
    const lower = prompt.toLowerCase();
    if (lower.includes("rpg")) return "rpg";
    if (lower.includes("obby")) return "obby";
    if (lower.includes("simulator")) return "simulator";
    if (lower.includes("tycoon")) return "tycoon";
    if (lower.includes("fps") || lower.includes("shooter")) return "fps";
    if (lower.includes("tower defense")) return "tower_defense";
    if (lower.includes("survival")) return "survival";
    if (lower.includes("horror")) return "horror";
    if (lower.includes("idle")) return "idle";
    if (lower.includes("pet")) return "pet_simulator";
    if (lower.includes("arena") || lower.includes("pvp")) return "battle_arena";
    return "adventure";
  }

  private estimateTime(config: GoalConfig): number {
    const estimated = PHASE_ORDER.reduce(
      (sum, phase) =>
        sum + (this.options.simulationDelayMs ?? PHASE_DURATIONS[phase] ?? 50),
      0,
    );
    return Math.min(config.timeLimitMs, estimated);
  }

  private emptyCost(): CostTracker {
    return {
      totalTokens: 0,
      totalCost: 0,
      totalTimeMs: 0,
      source: "synthetic",
      perPhase: {},
    };
  }
}
