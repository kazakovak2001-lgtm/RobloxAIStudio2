/**
 * GameBlueprintEngine.ts
 *
 * Converts a planner output into a structured game model (GameBlueprint).
 * This is the core data definition that drives all downstream generation.
 */

export interface NPCDefinition {
  id: string;
  name: string;
  role: string;
  behavior: string;
  spawnLocation?: string;
}

export interface EconomyModel {
  currency: string;
  sources: string[];
  sinks: string[];
  balanceStrategy: string;
}

export interface ProgressionModel {
  type: string;
  stages: string[];
  unlockMechanism: string;
  estimatedPlaytime: string;
}

export interface WorldDefinition {
  mapType: string;
  size: string;
  biomes: string[];
  landmarks: string[];
}

export interface RobloxGameBlueprint {
  id: string;
  title: string;
  genre: string;
  description: string;
  coreLoop: string[];
  mechanics: string[];
  world: WorldDefinition;
  npcs: NPCDefinition[];
  economy: EconomyModel;
  progression: ProgressionModel;
  createdAt: Date;
}

export class GameBlueprintEngine {
  private counter = 0;

  /**
   * Generate a full game blueprint from planner outputs.
   */
  generate(planOutputs: Record<string, unknown>): RobloxGameBlueprint {
    this.counter++;
    const id = `blueprint-${Date.now()}-${this.counter}`;

    const gameplay = (planOutputs.gameplay ??
      planOutputs["task-game_designer"]) as Record<string, unknown> | undefined;
    const goal = planOutputs.goal as string | undefined;

    const mechanics = this.extractMechanics(gameplay);
    const coreLoop = this.extractCoreLoop(gameplay);

    const blueprint: RobloxGameBlueprint = {
      id,
      title: String(
        (planOutputs as any)?.blueprint?.name ?? goal ?? "Untitled Game",
      ),
      genre: String((planOutputs as any)?.blueprint?.game_type ?? "adventure"),
      description: String(
        (planOutputs as any)?.blueprint?.description ?? goal ?? "",
      ),
      coreLoop,
      mechanics,
      world: this.buildWorld(planOutputs),
      npcs: this.buildNPCs(planOutputs),
      economy: this.buildEconomy(gameplay),
      progression: this.buildProgression(gameplay),
      createdAt: new Date(),
    };

    console.log(
      `[BLUEPRINT] Generated | ID: ${id} | Title: ${blueprint.title} | Mechanics: ${mechanics.length}`,
    );
    return blueprint;
  }

  private extractMechanics(
    gameplay: Record<string, unknown> | undefined,
  ): string[] {
    const mechs = (gameplay as any)?.mechanics;
    if (Array.isArray(mechs)) {
      return mechs.map((m: any) =>
        typeof m === "string" ? m : String(m?.name ?? m),
      );
    }
    return ["exploration", "interaction", "progression"];
  }

  private extractCoreLoop(
    gameplay: Record<string, unknown> | undefined,
  ): string[] {
    const loop =
      (gameplay as any)?.loop ?? (gameplay as any)?.progression?.loop;
    if (typeof loop === "string")
      return loop.split("→").map((s: string) => s.trim());
    return ["discover", "engage", "reward", "repeat"];
  }

  private buildWorld(outputs: Record<string, unknown>): WorldDefinition {
    const world = (outputs as any)?.world;
    return {
      mapType: String(world?.name ?? "open-world"),
      size: "medium",
      biomes: Array.isArray(world?.places)
        ? world.places.map((p: any) => String(p?.name ?? p))
        : ["spawn", "main-area"],
      landmarks: [],
    };
  }

  private buildNPCs(outputs: Record<string, unknown>): NPCDefinition[] {
    const npcs = (outputs as any)?.npcs;
    if (Array.isArray(npcs)) {
      return npcs.slice(0, 10).map((n: any, i: number) => ({
        id: `npc-${i + 1}`,
        name: String(n?.name ?? n?.id ?? `NPC-${i + 1}`),
        role: String(n?.role ?? "generic"),
        behavior: String(n?.behavior ?? "idle"),
        spawnLocation: n?.spawn?.location,
      }));
    }
    return [
      {
        id: "npc-1",
        name: "Guide",
        role: "tutorial",
        behavior: "greet-player",
      },
    ];
  }

  private buildEconomy(
    gameplay: Record<string, unknown> | undefined,
  ): EconomyModel {
    return {
      currency: String((gameplay as any)?.balance?.economyOrScoring ?? "coins"),
      sources: ["quests", "exploration", "combat"],
      sinks: ["upgrades", "cosmetics", "unlocks"],
      balanceStrategy: "progressive-earning with soft caps",
    };
  }

  private buildProgression(
    gameplay: Record<string, unknown> | undefined,
  ): ProgressionModel {
    return {
      type: String((gameplay as any)?.progressionModel ?? "milestone-based"),
      stages: ["beginner", "intermediate", "advanced", "mastery"],
      unlockMechanism: String(
        (gameplay as any)?.progression?.unlocking_system ?? "level-thresholds",
      ),
      estimatedPlaytime: "10-50 hours",
    };
  }
}
