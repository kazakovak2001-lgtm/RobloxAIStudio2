/**
 * WorldSimulationBridge.ts
 *
 * Connects World Intelligence layer to Simulation v1.1, Economy v1.2, and Memory v0.6.
 */

import type { EmergenceReport } from "../emergence/EmergentBehaviorEngine";
import type { WorldMutation } from "../mutation/WorldMutationEngine";
import { MemoryEngine } from "../../memory/core/MemoryEngine";

export interface WorldFeedbackResult {
  blueprintId: string;
  worldStability: number;
  mutations: number;
  memoryUpdated: boolean;
  emergentPhenomena: number;
}

export class WorldSimulationBridge {
  private memoryEngine: MemoryEngine;

  constructor(memoryEngine?: MemoryEngine) {
    this.memoryEngine = memoryEngine ?? new MemoryEngine();
  }

  /**
   * Send world simulation results to the broader system.
   */
  async processFeedback(
    blueprintId: string,
    emergence: EmergenceReport,
    mutations: WorldMutation[],
  ): Promise<WorldFeedbackResult> {
    let memoryUpdated = false;

    try {
      await this.memoryEngine.storeMemory({
        agentId: "world-intelligence",
        projectId: blueprintId,
        input: {
          stability: emergence.worldStability,
          phenomena: emergence.totalDetected,
        },
        output: {
          phenomena: emergence.phenomena.map((p) => ({
            type: p.type,
            severity: p.severity,
          })),
          mutations: mutations
            .filter((m) => m.applied)
            .map((m) => ({ type: m.type, target: m.target })),
          stability: emergence.worldStability,
        },
        timestamp: new Date(),
        tags: [
          "world",
          "emergence",
          emergence.worldStability < 50 ? "unstable" : "stable",
        ],
      });
      memoryUpdated = true;
    } catch {
      /* non-blocking */
    }

    console.log(
      `[WORLD-BRIDGE] Feedback | Stability: ${emergence.worldStability} | Phenomena: ${emergence.totalDetected} | Mutations: ${mutations.filter((m) => m.applied).length}`,
    );

    return {
      blueprintId,
      worldStability: emergence.worldStability,
      mutations: mutations.filter((m) => m.applied).length,
      memoryUpdated,
      emergentPhenomena: emergence.totalDetected,
    };
  }
}
