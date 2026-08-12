/**
 * LifecycleFeedbackBridge.ts
 *
 * Connects lifecycle system to Planner v0.7, Memory v0.6, and Evaluation v0.5.
 * Propagates lifecycle decisions across the system.
 */

import { MemoryEngine } from "../../memory/core/MemoryEngine";
import type { HealthAssessment } from "../monitor/GameHealthMonitor";
import { isAssessed } from "../monitor/GameHealthMonitor";
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
    health: HealthAssessment,
    evolution?: EvolutionResult,
  ): Promise<LifecycleFeedbackResult> {
    let memoryUpdated = false;

    // SIM-TRUTH-1. The composite and trend are recorded only when an
    // assessment was actually made. An insufficient-evidence result is stored
    // as exactly that, so a later reader cannot mistake it for a reading.
    const assessed = isAssessed(health);

    // Store in Memory v0.6
    try {
      await this.memoryEngine.storeMemory({
        agentId: "lifecycle-controller",
        projectId: gameId,
        input: assessed
          ? { health: health.composite, trend: health.trend }
          : { health: null, trend: null, status: health.status },
        output: {
          healthAssessment: health,
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
          assessed ? (health.trend ?? "no-trend") : "insufficient-evidence",
          evolution?.evolutionType ?? "monitor",
        ],
      });
      memoryUpdated = true;
    } catch {
      /* non-blocking */
    }

    // Planner notification (conceptual — for future direct integration).
    // SIM-TRUTH-1. Only an actual assessment can say a game is struggling.
    // Insufficient evidence is not a low score.
    const plannerNotified = assessed && health.composite < 40;

    // Evaluation trigger (conceptual — system evaluates patches independently)
    const evaluationTriggered =
      evolution !== undefined && evolution.patches.length > 0;

    console.log(
      `[LIFECYCLE-BRIDGE] Game: ${gameId} | Memory: ${memoryUpdated} | Planner: ${plannerNotified} | Eval: ${evaluationTriggered}`,
    );

    return { gameId, memoryUpdated, plannerNotified, evaluationTriggered };
  }
}
