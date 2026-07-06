/**
 * PlaytestAgent.ts
 *
 * Virtual player agent that explores a game blueprint systematically.
 * Detects friction points, broken loops, and engagement issues.
 */

import type { RobloxGameBlueprint } from "../../generation/blueprint/GameBlueprintEngine";
import type { SimulationResult } from "../core/GameSimulationEngine";

export interface PlaytestIssue {
  severity: "critical" | "high" | "medium" | "low";
  category: "friction" | "broken-loop" | "dead-end" | "economy" | "pacing";
  description: string;
  tick?: number;
}

export interface PlaytestReport {
  blueprintId: string;
  issues: PlaytestIssue[];
  engagementScore: number; // 0–100
  loopCompletionRate: number; // 0–1
  mechanicsCoverage: number; // 0–1
  npcInteractionRate: number; // 0–1
  suggestions: string[];
}

export class PlaytestAgent {
  /**
   * Analyze simulation results and produce a playtest report.
   */
  analyze(
    blueprint: RobloxGameBlueprint,
    simulation: SimulationResult,
  ): PlaytestReport {
    const issues: PlaytestIssue[] = [];
    const suggestions: string[] = [];
    const events = simulation.events;

    // Loop completion
    const loopComplete = events.some((e) => e.type === "loop_complete");
    if (!loopComplete) {
      issues.push({
        severity: "high",
        category: "broken-loop",
        description: "Core gameplay loop was never completed during simulation",
      });
      suggestions.push("Simplify the core loop or add more discovery paths");
    }

    // Friction detection
    const frictionEvents = events.filter((e) => e.type === "friction");
    for (const f of frictionEvents) {
      issues.push({
        severity: "medium",
        category: "friction",
        description: f.detail,
        tick: f.tick,
      });
    }
    if (frictionEvents.length > 0) {
      suggestions.push(
        "Add variety to mid-game mechanics to prevent stale gameplay",
      );
    }

    // Economy analysis
    const currencyGains = events.filter(
      (e) => e.type === "currency_gain",
    ).length;
    const levelUps = events.filter((e) => e.type === "level_up").length;
    if (currencyGains > 0 && levelUps === 0) {
      issues.push({
        severity: "medium",
        category: "economy",
        description:
          "Currency earned but no progression occurred — economy may be too slow",
      });
      suggestions.push(
        "Reduce level-up thresholds or increase currency rewards",
      );
    }

    // Pacing
    if (simulation.totalTicks < 20 && !loopComplete) {
      issues.push({
        severity: "high",
        category: "pacing",
        description:
          "Player disengaged very early — game start may be too confusing",
      });
      suggestions.push("Add a tutorial or guided onboarding sequence");
    }

    // Engagement metrics
    const mechanicsCoverage =
      simulation.finalState.mechanicsUsed.size /
      Math.max(blueprint.mechanics.length, 1);
    const npcInteracted = simulation.finalState.npcStates.filter(
      (n) => n.interacted,
    ).length;
    const npcRate =
      blueprint.npcs.length > 0 ? npcInteracted / blueprint.npcs.length : 1;
    const engagementScore = Math.round(
      simulation.finalState.loopProgress * 40 +
        mechanicsCoverage * 30 +
        npcRate * 15 +
        (simulation.finalState.playerState.engaged ? 15 : 0),
    );

    if (npcRate < 0.5) {
      issues.push({
        severity: "low",
        category: "dead-end",
        description: `Only ${Math.round(npcRate * 100)}% of NPCs were interacted with`,
      });
      suggestions.push(
        "Place NPCs closer to player paths or add quest markers",
      );
    }

    console.log(
      `[PLAYTEST] Report | Blueprint: ${blueprint.id} | Engagement: ${engagementScore} | Issues: ${issues.length}`,
    );

    return {
      blueprintId: blueprint.id,
      issues,
      engagementScore,
      loopCompletionRate: simulation.finalState.loopProgress,
      mechanicsCoverage,
      npcInteractionRate: npcRate,
      suggestions,
    };
  }
}
