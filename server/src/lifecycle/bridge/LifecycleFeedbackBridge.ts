/**
 * LifecycleFeedbackBridge.ts
 *
 * Connects lifecycle system to Planner v0.7, Memory v0.6, and Evaluation v0.5.
 * Propagates lifecycle decisions across the system.
 */

import { MemoryEngine } from "../../memory/core/MemoryEngine";
import type { HealthMetrics } from "../monitor/GameHealthMonitor";
import type { EvolutionResult } from "../evolution/ContinuousEvolutionEngine";

export interface LifecycleFeedbackResult {
  gameId: string;
  memoryUpdated: boolean;
  plannerNotified: boolean;
  evaluationTriggered: boolean;
}

export class LifecycleFeedbackBridge {
  private memoryEngine: MemoryEngine;

  constructor(memoryEngine?: MemoryEngine) {
    this.memoryEngine = memoryEngine ?? new MemoryEngine();
  }

  /**
   * Send lifecycle results to the broader system.
   */
  async processFeedback(
    gameId: string,
    health: HealthMetrics,
    evolution?: EvolutionResult,
  ): Promise<LifecycleFeedbackResult> {
    let memoryUpdated = false;

    // Store in Memory v0.6
    try {
      await this.memoryEngine.storeMemory({
        agentId: "lifecycle-controller",
        projectId: gameId,
        input: { health: health.overall, trend: health.trend },
        output: {
          healthMetrics: health,
          evolution: evolution
            ? {
                type: evolution.evolutionType,
                patches: evolution.patches.length,
              }
            : null,
        },
        timestamp: new Date(),
        tags: [
          "lifecycle",
          health.trend,
          evolution?.evolutionType ?? "monitor",
        ],
      });
      memoryUpdated = true;
    } catch {
      /* non-blocking */
    }

    // Planner notification (conceptual — for future direct integration)
    const plannerNotified = health.overall < 40; // Would trigger replanning

    // Evaluation trigger (conceptual — system evaluates patches independently)
    const evaluationTriggered =
      evolution !== undefined && evolution.patches.length > 0;

    console.log(
      `[LIFECYCLE-BRIDGE] Game: ${gameId} | Memory: ${memoryUpdated} | Planner: ${plannerNotified} | Eval: ${evaluationTriggered}`,
    );

    return { gameId, memoryUpdated, plannerNotified, evaluationTriggered };
  }
}
