/**
 * EconomyFeedbackBridge.ts
 *
 * Connects economy analysis back to the generation pipeline.
 * Stores economy history in Memory v0.6 for future improvements.
 */

import type { ImbalanceReport } from "../detection/ImbalanceDetector";
import type { BalancePatch } from "../balancing/BalanceGenerator";
import { MemoryEngine } from "../../memory/core/MemoryEngine";

export interface EconomyFeedbackResult {
  blueprintId: string;
  patchApplied: boolean;
  memoryUpdated: boolean;
  shouldRegenerate: boolean;
  summary: string;
}

export class EconomyFeedbackBridge {
  private memoryEngine: MemoryEngine;

  constructor(memoryEngine?: MemoryEngine) {
    this.memoryEngine = memoryEngine ?? new MemoryEngine();
  }

  /**
   * Process economy results and feed back into the system.
   */
  async processFeedback(
    report: ImbalanceReport,
    patch: BalancePatch,
  ): Promise<EconomyFeedbackResult> {
    const shouldRegenerate = report.actionRequired && report.critical > 0;

    // Store in memory for future generation improvement
    let memoryUpdated = false;
    try {
      await this.memoryEngine.storeMemory({
        agentId: "economy-balance",
        projectId: report.blueprintId,
        input: {
          healthScore: report.healthScore,
          imbalances: report.imbalances.length,
        },
        output: {
          patch: patch.adjustments,
          healthScore: report.healthScore,
          shouldRegenerate,
          critical: report.critical,
        },
        timestamp: new Date(),
        tags: [
          "economy",
          "balance",
          shouldRegenerate ? "regenerate" : "stable",
        ],
      });
      memoryUpdated = true;
    } catch {
      /* non-blocking */
    }

    const summary =
      `Economy Health: ${report.healthScore}/100 | Imbalances: ${report.imbalances.length} | ` +
      `Adjustments: ${patch.adjustments.length} | Regenerate: ${shouldRegenerate}`;

    console.log(`[ECON-BRIDGE] ${summary}`);

    return {
      blueprintId: report.blueprintId,
      patchApplied: patch.adjustments.length > 0,
      memoryUpdated,
      shouldRegenerate,
      summary,
    };
  }
}
