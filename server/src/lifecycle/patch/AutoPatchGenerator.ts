/**
 * AutoPatchGenerator.ts
 *
 * Generates structured patches from simulation, economy, and world analysis results.
 * Each patch is incremental and reversible.
 */

import type { LivePatch } from "../live/LiveUpdateEngine";

export interface PatchSource {
  type: "simulation" | "economy" | "world" | "health";
  data: Record<string, unknown>;
}

export class AutoPatchGenerator {
  private patchCounter = 0;

  /**
   * Generate patches from multiple analysis sources.
   */
  generate(sources: PatchSource[]): LivePatch[] {
    const patches: LivePatch[] = [];

    for (const source of sources) {
      switch (source.type) {
        case "economy":
          patches.push(...this.economyPatches(source.data));
          break;
        case "simulation":
          patches.push(...this.simulationPatches(source.data));
          break;
        case "world":
          patches.push(...this.worldPatches(source.data));
          break;
        case "health":
          patches.push(...this.healthPatches(source.data));
          break;
      }
    }

    console.log(
      `[AUTO-PATCH] Generated ${patches.length} patches from ${sources.length} sources`,
    );
    return patches;
  }

  private economyPatches(data: Record<string, unknown>): LivePatch[] {
    const patches: LivePatch[] = [];
    const adjustments = data.adjustments as
      | Array<{
          target: string;
          action: string;
          factor: number;
          reason: string;
        }>
      | undefined;

    if (adjustments) {
      for (const adj of adjustments) {
        this.patchCounter++;
        patches.push({
          id: `patch-econ-${this.patchCounter}`,
          target: adj.target,
          action:
            adj.action === "increase"
              ? "increment"
              : adj.action === "decrease"
                ? "increment"
                : "set",
          value:
            adj.action === "decrease" ? -(adj.factor * 10) : adj.factor * 10,
          reason: adj.reason,
          timestamp: new Date(),
        });
      }
    }

    return patches;
  }

  private simulationPatches(data: Record<string, unknown>): LivePatch[] {
    const patches: LivePatch[] = [];

    if (data.shouldRegenerate === true) {
      // Don't full-regen — just patch the weak areas
      const areas = data.refinementAreas as string[] | undefined;
      if (areas) {
        for (const area of areas) {
          this.patchCounter++;
          patches.push({
            id: `patch-sim-${this.patchCounter}`,
            target: area,
            action: "set",
            value: "auto-refined",
            reason: `Simulation flagged ${area} for refinement`,
            timestamp: new Date(),
          });
        }
      }
    }

    return patches;
  }

  private worldPatches(data: Record<string, unknown>): LivePatch[] {
    const patches: LivePatch[] = [];
    const mutations = data.mutations as
      Array<{ type: string; target: string; reason: string }> | undefined;

    if (mutations) {
      for (const mut of mutations) {
        this.patchCounter++;
        patches.push({
          id: `patch-world-${this.patchCounter}`,
          target: `world.${mut.target}`,
          action: "set",
          value: mut.type,
          reason: mut.reason,
          timestamp: new Date(),
        });
      }
    }

    return patches;
  }

  private healthPatches(data: Record<string, unknown>): LivePatch[] {
    const patches: LivePatch[] = [];
    const score = data.healthScore as number | undefined;

    if (score !== undefined && score < 50) {
      this.patchCounter++;
      patches.push({
        id: `patch-health-${this.patchCounter}`,
        target: "progression.stages",
        action: "set",
        value: ["beginner", "intermediate", "advanced"],
        reason: `Health score critical (${score}) — simplify progression`,
        timestamp: new Date(),
      });
    }

    return patches;
  }
}
