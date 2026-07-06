/**
 * GenerationRefinementBridge.ts
 *
 * Connects simulation feedback back to the generation pipeline.
 * Can trigger regeneration cycles and update Memory v0.6 with simulation learnings.
 */

import type { SimulationFeedback } from "../feedback/SimulationFeedbackEngine";
import { MemoryEngine } from "../../memory/core/MemoryEngine";

export interface RefinementDecision {
  blueprintId: string;
  shouldRegenerate: boolean;
  feedbackStored: boolean;
  refinementAreas: string[];
  memoryUpdated: boolean;
}

export class GenerationRefinementBridge {
  private memoryEngine: MemoryEngine;

  constructor(memoryEngine?: MemoryEngine) {
    this.memoryEngine = memoryEngine ?? new MemoryEngine();
  }

  /**
   * Process simulation feedback and decide next action.
   * Stores learnings in Memory v0.6 for future generation improvement.
   */
  async processFeedback(
    feedback: SimulationFeedback,
  ): Promise<RefinementDecision> {
    const refinementAreas = feedback.items
      .filter((i) => i.priority === "critical" || i.priority === "high")
      .map((i) => i.target);

    // Store feedback in memory for future generations
    let memoryUpdated = false;
    try {
      await this.memoryEngine.storeMemory({
        agentId: "simulation-feedback",
        projectId: feedback.blueprintId,
        input: { grade: feedback.overallGrade, issues: feedback.items.length },
        output: {
          feedback: feedback.items.map((i) => ({
            action: i.action,
            target: i.target,
            priority: i.priority,
          })),
          grade: feedback.overallGrade,
          shouldRegenerate: feedback.shouldRegenerate,
        },
        timestamp: new Date(),
        tags: ["simulation", "feedback", feedback.overallGrade],
      });
      memoryUpdated = true;
    } catch {
      /* non-blocking */
    }

    const decision: RefinementDecision = {
      blueprintId: feedback.blueprintId,
      shouldRegenerate: feedback.shouldRegenerate,
      feedbackStored: true,
      refinementAreas: [...new Set(refinementAreas)],
      memoryUpdated,
    };

    console.log(
      `[REFINEMENT] Decision | Blueprint: ${feedback.blueprintId} | Regenerate: ${decision.shouldRegenerate} | Areas: ${decision.refinementAreas.join(", ") || "none"}`,
    );

    return decision;
  }
}
