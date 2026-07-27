/**
 * AgentDecisionEngine.ts
 *
 * Core decision engine for adaptive agent selection.
 * Called by PlanExecutor before each node execution to select the best agent.
 *
 * Decision factors:
 *   1. Historical performance (AgentPerformanceMemory)
 *   2. Task type compatibility
 *   3. Context fit (similar prior contexts)
 *   4. Current policy mode (strict/balanced/experimental)
 *   5. Fallback chains on failure
 *
 * Safety constraints:
 *   - Max 2 switches per node (configurable via policy)
 *   - No switching without evaluation signal
 *   - Deterministic mode override available
 */

import { AgentPerformanceMemory } from "./AgentPerformanceMemory";
import { AgentSelectionPolicy } from "./AgentSelectionPolicy";
import type {
  AgentScore,
  AgentSelectionResult,
  AgentFallbackResult,
  SelectionPolicyMode,
  AgentExecutionRecord,
} from "./types";

export class AgentDecisionEngine {
  private memory: AgentPerformanceMemory;
  private policy: AgentSelectionPolicy;
  private switchCounts: Map<string, number> = new Map(); // nodeId → switch count
  private deterministic = false; // when true, always use the assigned agent

  constructor(
    memory?: AgentPerformanceMemory,
    policyMode?: SelectionPolicyMode,
  ) {
    this.memory = memory ?? new AgentPerformanceMemory();
    this.policy = new AgentSelectionPolicy(policyMode ?? "balanced");
  }

  /**
   * Select the best agent for a given task node.
   * Returns the recommended agent with scoring details.
   */
  selectAgent(params: {
    taskType: string;
    assignedAgent: string;
    availableAgents: string[];
    contextKeys?: string[];
    executionId?: string;
  }): AgentSelectionResult {
    const {
      taskType,
      assignedAgent,
      availableAgents,
      contextKeys = [],
    } = params;

    // Deterministic mode: always return assigned agent
    if (this.deterministic) {
      const score = this.memory.computeScore(assignedAgent, contextKeys);
      score.compositeScore = this.policy.computeComposite(score);
      return {
        selectedAgent: assignedAgent,
        score,
        alternates: [],
        selectionReason: "Deterministic mode — using assigned agent",
        policyMode: this.policy.mode,
      };
    }

    const taskHistory = this.memory.getTaskTypeHistory(taskType);
    const assignedHasTaskEvidence = taskHistory.some(
      (record) => record.agent === assignedAgent,
    );

    if (!assignedHasTaskEvidence) {
      const score = this.memory.computeScore(assignedAgent, contextKeys);
      score.compositeScore = this.policy.computeComposite(score);
      return {
        selectedAgent: assignedAgent,
        score,
        alternates: [],
        selectionReason:
          "No task-specific evidence for assigned agent — preserving plan assignment",
        policyMode: this.policy.mode,
      };
    }

    const evidenceBackedAgents = availableAgents.filter(
      (agent) =>
        agent === assignedAgent ||
        taskHistory.some((record) => record.agent === agent),
    );

    // Score only agents with exact task-type evidence. An unevaluated
    // agent must not replace the planner's explicit assignment.
    const scoredAgents: Array<{ agent: string; score: AgentScore }> = [];

    for (const agent of evidenceBackedAgents) {
      const rawScore = this.memory.computeScore(agent, contextKeys);
      rawScore.compositeScore = this.policy.computeComposite(rawScore);
      scoredAgents.push({ agent, score: rawScore });
    }

    // Also score the assigned agent if not in list
    if (!evidenceBackedAgents.includes(assignedAgent)) {
      const rawScore = this.memory.computeScore(assignedAgent, contextKeys);
      rawScore.compositeScore = this.policy.computeComposite(rawScore);
      scoredAgents.push({ agent: assignedAgent, score: rawScore });
    }

    // Filter by eligibility
    const eligible = scoredAgents.filter((s) =>
      this.policy.isEligible(s.score),
    );

    // If no eligible agents, fall back to assigned
    if (eligible.length === 0) {
      const assignedScore =
        scoredAgents.find((s) => s.agent === assignedAgent)?.score ??
        this.memory.computeScore(assignedAgent, contextKeys);
      assignedScore.compositeScore =
        this.policy.computeComposite(assignedScore);

      return {
        selectedAgent: assignedAgent,
        score: assignedScore,
        alternates: [],
        selectionReason: "No eligible alternatives — using assigned agent",
        policyMode: this.policy.mode,
      };
    }

    // Sort by composite score (descending)
    eligible.sort((a, b) => b.score.compositeScore - a.score.compositeScore);

    // Check task-type historical performance
    const bestForTask = this.memory.getBestAgentForTask(
      taskType,
      eligible.map((e) => e.agent),
    );

    // Selection: prefer best composite, but boost task-type specialist
    let selected = eligible[0];
    let reason = `Highest composite score (${selected.score.compositeScore})`;

    if (bestForTask && bestForTask.agent !== selected.agent) {
      const specialist = eligible.find((e) => e.agent === bestForTask.agent);
      if (
        specialist &&
        specialist.score.compositeScore >= selected.score.compositeScore * 0.85
      ) {
        // Specialist is within 15% of best — prefer specialist
        selected = specialist;
        reason = `Task-type specialist for "${taskType}" (score: ${specialist.score.compositeScore}, task-fit: ${Math.round(bestForTask.score)})`;
      }
    }

    // Build alternates
    const alternates = eligible
      .filter((e) => e.agent !== selected.agent)
      .slice(0, 3)
      .map((e) => ({
        agent: e.agent,
        score: e.score.compositeScore,
        reason: `Composite: ${e.score.compositeScore}, Quality: ${Math.round(e.score.avgQuality)}`,
      }));

    return {
      selectedAgent: selected.agent,
      score: selected.score,
      alternates,
      selectionReason: reason,
      policyMode: this.policy.mode,
    };
  }

  /**
   * Request a fallback agent after a node failure.
   * Respects max-switch safety constraint.
   */
  requestFallback(params: {
    nodeId: string;
    failedAgent: string;
    taskType: string;
    availableAgents: string[];
    contextKeys?: string[];
  }): AgentFallbackResult | null {
    const {
      nodeId,
      failedAgent,
      taskType,
      availableAgents,
      contextKeys = [],
    } = params;

    // Check switch count safety
    const currentSwitches = this.switchCounts.get(nodeId) ?? 0;
    if (currentSwitches >= this.policy.maxSwitchesPerNode) {
      return null; // max switches reached — no more fallbacks
    }

    // Score alternatives (exclude failed agent)
    const candidates = availableAgents.filter((a) => a !== failedAgent);
    if (candidates.length === 0) return null;

    const scored = candidates.map((agent) => {
      const score = this.memory.computeScore(agent, contextKeys);
      score.compositeScore = this.policy.computeComposite(score);
      return { agent, score: score.compositeScore };
    });

    // Also consider task-type history
    const bestForTask = this.memory.getBestAgentForTask(taskType, candidates);

    // Select fallback
    scored.sort((a, b) => b.score - a.score);
    let fallback = scored[0];

    if (
      bestForTask &&
      bestForTask.agent !== fallback.agent &&
      bestForTask.score > fallback.score * 0.9
    ) {
      fallback = { agent: bestForTask.agent, score: bestForTask.score };
    }

    // Record switch
    this.switchCounts.set(nodeId, currentSwitches + 1);

    return {
      originalAgent: failedAgent,
      fallbackAgent: fallback.agent,
      switchReason: `Agent "${failedAgent}" failed — switching to "${fallback.agent}" (score: ${Math.round(fallback.score)})`,
      switchCount: currentSwitches + 1,
      maxSwitches: this.policy.maxSwitchesPerNode,
    };
  }

  /**
   * Record an execution result (feeds into performance memory).
   */
  recordExecution(record: AgentExecutionRecord): void {
    this.memory.record(record);
  }

  /**
   * Reset switch counts (call at start of new execution).
   */
  resetSwitchCounts(): void {
    this.switchCounts.clear();
  }

  // ─── Configuration ────────────────────────────────────────────────────

  setDeterministic(enabled: boolean): void {
    this.deterministic = enabled;
  }

  isDeterministic(): boolean {
    return this.deterministic;
  }

  setPolicyMode(mode: SelectionPolicyMode): void {
    this.policy.setMode(mode);
  }

  getPolicyMode(): SelectionPolicyMode {
    return this.policy.mode;
  }

  getPolicy(): AgentSelectionPolicy {
    return this.policy;
  }

  getMemory(): AgentPerformanceMemory {
    return this.memory;
  }

  /**
   * Get scores for all known agents.
   */
  getAllScores(contextKeys: string[] = []): AgentScore[] {
    const agents = this.memory.getKnownAgents();
    return agents.map((agent) => {
      const score = this.memory.computeScore(agent, contextKeys);
      score.compositeScore = this.policy.computeComposite(score);
      return score;
    });
  }

  /**
   * Get agent ranking (sorted by composite score).
   */
  getRanking(contextKeys: string[] = []): AgentScore[] {
    return this.getAllScores(contextKeys).sort(
      (a, b) => b.compositeScore - a.compositeScore,
    );
  }
}
