/**
 * AutonomousOrchestrator — Single-prompt to complete Roblox Experience.
 * Coordinates all modules: Domain, Knowledge, Agents, Lua, Assets, Assembly, Playtest, Repair, Benchmark.
 */

import type {
  OrchestratorSession,
  OrchestratorPhase,
  GoalConfig,
  ExecutionNode,
  Checkpoint,
  CostTracker,
} from "./OrchestratorTypes";
import { DEFAULT_GOALS, createSessionId } from "./OrchestratorTypes";

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
  "completed",
];

export class AutonomousOrchestrator {
  private sessions: Map<string, OrchestratorSession> = new Map();

  /**
   * Start autonomous generation from a single prompt.
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
      status: "running",
      currentPhase: "genre_detection",
      phases: PHASE_ORDER.map((phase) => ({
        id: `node-${phase}`,
        phase,
        status: "pending",
      })),
      goals: config,
      cost: this.emptyCost(),
      checkpoints: [],
      qualityScore: 0,
      startedAt: Date.now(),
      estimatedTimeMs: this.estimateTime(config),
      estimatedCost: this.estimateCost(config),
    };

    this.sessions.set(sessionId, session);

    // Execute phases sequentially (async fire-and-forget)
    void this.executePhases(session);

    return session;
  }

  /**
   * Get session status.
   */
  getSession(sessionId: string): OrchestratorSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  /**
   * Pause execution.
   */
  pause(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "running") return false;
    session.status = "paused";
    session.currentPhase = "paused";
    return true;
  }

  /**
   * Resume execution.
   */
  resume(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "paused") return false;
    session.status = "running";
    // Find the last incomplete phase
    const next = session.phases.find((p) => p.status === "pending");
    if (next) {
      session.currentPhase = next.phase;
      void this.executePhases(session);
    }
    return true;
  }

  /**
   * Cancel execution.
   */
  cancel(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (
      !session ||
      (session.status !== "running" && session.status !== "paused")
    )
      return false;
    session.status = "cancelled";
    session.currentPhase = "cancelled";
    session.finishedAt = Date.now();
    return true;
  }

  private async executePhases(session: OrchestratorSession): Promise<void> {
    for (const node of session.phases) {
      if (node.status === "completed" || node.status === "skipped") continue;
      if (session.status !== "running") break;
      if (node.phase === "completed") {
        session.status = "completed";
        session.currentPhase = "completed";
        session.finishedAt = Date.now();
        break;
      }

      // Check smart skip conditions
      if (this.shouldSkip(session, node.phase)) {
        node.status = "skipped";
        node.skippedReason = this.skipReason(session, node.phase);
        continue;
      }

      // Check budget/time limits
      if (this.isOverBudget(session)) {
        session.status = "failed";
        session.currentPhase = "failed";
        session.finishedAt = Date.now();
        node.status = "failed";
        node.error = "Budget or time limit exceeded";
        break;
      }

      // Execute phase
      session.currentPhase = node.phase;
      node.status = "running";
      node.startedAt = Date.now();

      try {
        const output = await this.executePhase(session, node.phase);
        node.status = "completed";
        node.completedAt = Date.now();
        node.durationMs = node.completedAt - node.startedAt;
        node.output = output;

        // Update cost tracking
        this.trackCost(session, node);

        // Checkpoint after each phase
        this.checkpoint(session, node.phase);
      } catch (err) {
        node.status = "failed";
        node.completedAt = Date.now();
        node.durationMs = node.completedAt - (node.startedAt ?? Date.now());
        node.error = err instanceof Error ? err.message : String(err);
        session.status = "failed";
        session.currentPhase = "failed";
        session.finishedAt = Date.now();
        break;
      }
    }
  }

  private async executePhase(
    session: OrchestratorSession,
    phase: OrchestratorPhase,
  ): Promise<unknown> {
    // Simulate phase execution with realistic timing
    // In production, each phase calls its respective engine
    const durations: Record<string, number> = {
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

    await new Promise((resolve) => setTimeout(resolve, durations[phase] ?? 50));

    // Simulate outputs
    switch (phase) {
      case "genre_detection":
        session.genre = this.detectGenre(session.prompt);
        return { genre: session.genre };
      case "playtest":
        session.qualityScore = 75 + Math.floor(Math.random() * 20);
        return { score: session.qualityScore };
      case "repair":
        session.qualityScore = Math.min(100, session.qualityScore + 10);
        return { scoreAfter: session.qualityScore };
      case "benchmark":
        return { benchmarkScore: session.qualityScore };
      default:
        return { phase, status: "ok" };
    }
  }

  private shouldSkip(
    session: OrchestratorSession,
    phase: OrchestratorPhase,
  ): boolean {
    if (phase === "repair" && session.qualityScore >= session.goals.targetScore)
      return true;
    if (phase === "studio_sync" && session.qualityScore < 50) return true;
    return false;
  }

  private skipReason(
    session: OrchestratorSession,
    phase: OrchestratorPhase,
  ): string {
    if (phase === "repair")
      return `Quality ${session.qualityScore} >= target ${session.goals.targetScore}`;
    if (phase === "studio_sync")
      return `Quality ${session.qualityScore} too low for sync`;
    return "Skipped by optimizer";
  }

  private isOverBudget(session: OrchestratorSession): boolean {
    const elapsed = Date.now() - session.startedAt;
    if (elapsed > session.goals.timeLimitMs) return true;
    if (session.cost.totalCost > session.goals.maxCost) return true;
    return false;
  }

  private trackCost(session: OrchestratorSession, node: ExecutionNode): void {
    const tokens = Math.floor(Math.random() * 500) + 100;
    const cost = tokens * 0.000002;
    const timeMs = node.durationMs ?? 0;

    session.cost.totalTokens += tokens;
    session.cost.totalCost += cost;
    session.cost.totalTimeMs += timeMs;
    session.cost.perPhase[node.phase] = { tokens, cost, timeMs };
  }

  private checkpoint(
    session: OrchestratorSession,
    phase: OrchestratorPhase,
  ): void {
    const cp: Checkpoint = {
      phase,
      timestamp: Date.now(),
      snapshot: {
        qualityScore: session.qualityScore,
        cost: { ...session.cost },
        completedPhases: session.phases.filter((p) => p.status === "completed")
          .length,
      },
    };
    session.checkpoints.push(cp);
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
    return Math.min(config.timeLimitMs, 60_000);
  }

  private estimateCost(config: GoalConfig): number {
    return Math.min(config.maxCost, 0.15);
  }

  private emptyCost(): CostTracker {
    return { totalTokens: 0, totalCost: 0, totalTimeMs: 0, perPhase: {} };
  }
}
