/**
 * GameplayGenerator.ts
 *
 * Generates game mechanics, player systems, progression, objectives, and events.
 * Produces a GameplayManifest consumed by downstream ScriptGenerator.
 */

import {
  BaseGenerator,
  type GeneratorInput,
  type GeneratorOutput,
  type GeneratorMetadata,
} from "../BaseGenerator";

export interface GameplayManifest {
  mechanics: MechanicDefinition[];
  playerSystems: PlayerSystemDefinition[];
  progression: ProgressionDefinition;
  objectives: ObjectiveDefinition[];
  events: GameEventDefinition[];
}

export interface MechanicDefinition {
  id: string;
  name: string;
  type: "movement" | "combat" | "collection" | "puzzle" | "social" | "custom";
  description: string;
  requiredServices: string[];
}

export interface PlayerSystemDefinition {
  id: string;
  name: string;
  scope: "server" | "client" | "shared";
  responsibilities: string[];
}

export interface ProgressionDefinition {
  type: "linear" | "branching" | "open-world" | "level-based";
  stages: number;
  unlockMechanism: string;
  rewards: string[];
}

export interface ObjectiveDefinition {
  id: string;
  name: string;
  type: "main" | "side" | "daily" | "achievement";
  description: string;
  completionCriteria: string;
}

export interface GameEventDefinition {
  name: string;
  trigger: string;
  scope: "server" | "client" | "replicated";
  payload: string;
}

export class GameplayGenerator extends BaseGenerator {
  readonly metadata: GeneratorMetadata = {
    id: "gameplay-generator",
    name: "Gameplay Generator",
    version: "1.0.0",
    dependencies: ["game-structure-generator"],
    produces: ["gameplay-manifest"],
  };

  async generate(input: GeneratorInput): Promise<GeneratorOutput> {
    const start = Date.now();
    const { model, blueprint } = input;
    const modifications: string[] = [];

    const mechanics = this.generateMechanics(blueprint, model.game.mechanics);
    const playerSystems = this.generatePlayerSystems(mechanics);
    const progression = this.generateProgression(blueprint);
    const objectives = this.generateObjectives(blueprint, mechanics);
    const events = this.generateEvents(mechanics, playerSystems);

    const manifest: GameplayManifest = {
      mechanics,
      playerSystems,
      progression,
      objectives,
      events,
    };

    // Store in context for downstream generators
    if (typeof input.context === "object" && input.context !== null) {
      (input.context as Record<string, unknown>)["gameplayManifest"] = manifest;
    }

    // Generate networking entries from events
    for (const event of events) {
      if (event.scope === "replicated") {
        model.networking.remoteEvents.push({
          name: event.name,
          direction: "bidirectional",
          payload: event.payload,
        });
        modifications.push(`event:${event.name}`);
      }
    }

    modifications.push("gameplay-manifest");
    return {
      generatorId: this.metadata.id,
      success: true,
      modifications,
      durationMs: Date.now() - start,
    };
  }

  private generateMechanics(
    blueprint: Record<string, unknown>,
    modelMechanics: string[],
  ): MechanicDefinition[] {
    const raw = (blueprint.mechanics as string[]) ?? modelMechanics ?? [];
    return raw.map((name, i) => ({
      id: `mech-${i}`,
      name,
      type: this.classifyMechanic(name),
      description: `${name} mechanic implementation`,
      requiredServices: this.getServicesForMechanic(name),
    }));
  }

  private generatePlayerSystems(
    mechanics: MechanicDefinition[],
  ): PlayerSystemDefinition[] {
    const systems: PlayerSystemDefinition[] = [
      {
        id: "ps-input",
        name: "InputSystem",
        scope: "client",
        responsibilities: ["Handle player input", "Map controls to actions"],
      },
      {
        id: "ps-state",
        name: "PlayerStateSystem",
        scope: "shared",
        responsibilities: ["Track player state", "Sync state to clients"],
      },
    ];

    if (mechanics.some((m) => m.type === "combat")) {
      systems.push({
        id: "ps-health",
        name: "HealthSystem",
        scope: "server",
        responsibilities: ["Track health", "Handle damage", "Handle death"],
      });
    }
    if (mechanics.some((m) => m.type === "collection")) {
      systems.push({
        id: "ps-inventory",
        name: "InventorySystem",
        scope: "server",
        responsibilities: ["Store items", "Handle pickups"],
      });
    }

    return systems;
  }

  private generateProgression(
    blueprint: Record<string, unknown>,
  ): ProgressionDefinition {
    const gameType =
      (blueprint.game_type as string) ??
      (blueprint.genre as string) ??
      "adventure";
    switch (gameType) {
      case "obby":
      case "platformer":
        return {
          type: "linear",
          stages: 10,
          unlockMechanism: "reach-end",
          rewards: ["badge", "next-stage"],
        };
      case "rpg":
        return {
          type: "branching",
          stages: 20,
          unlockMechanism: "quest-complete",
          rewards: ["xp", "items", "abilities"],
        };
      default:
        return {
          type: "open-world",
          stages: 5,
          unlockMechanism: "exploration",
          rewards: ["unlockables"],
        };
    }
  }

  private generateObjectives(
    blueprint: Record<string, unknown>,
    mechanics: MechanicDefinition[],
  ): ObjectiveDefinition[] {
    const objectives: ObjectiveDefinition[] = [
      {
        id: "obj-main",
        name: "Complete the Game",
        type: "main",
        description: "Finish all stages",
        completionCriteria: "all-stages-done",
      },
    ];

    if (mechanics.some((m) => m.type === "collection")) {
      objectives.push({
        id: "obj-collect",
        name: "Collector",
        type: "achievement",
        description: "Collect all items",
        completionCriteria: "all-items-collected",
      });
    }

    const gameType = (blueprint.game_type as string) ?? "";
    if (gameType === "obby") {
      objectives.push({
        id: "obj-speed",
        name: "Speed Runner",
        type: "achievement",
        description: "Complete in under 5 minutes",
        completionCriteria: "time < 300",
      });
    }

    return objectives;
  }

  private generateEvents(
    mechanics: MechanicDefinition[],
    systems: PlayerSystemDefinition[],
  ): GameEventDefinition[] {
    const events: GameEventDefinition[] = [
      {
        name: "PlayerReady",
        trigger: "player-loaded",
        scope: "replicated",
        payload: "{ playerId: string }",
      },
      {
        name: "GameStateChanged",
        trigger: "state-transition",
        scope: "replicated",
        payload: "{ from: string, to: string }",
      },
    ];

    for (const mechanic of mechanics.slice(0, 3)) {
      events.push({
        name: `${this.pascalCase(mechanic.name)}Triggered`,
        trigger: `${mechanic.name}-action`,
        scope: "replicated",
        payload: `{ playerId: string, context: unknown }`,
      });
    }

    if (systems.some((s) => s.name === "HealthSystem")) {
      events.push({
        name: "PlayerDamaged",
        trigger: "damage-taken",
        scope: "server",
        payload: "{ playerId: string, amount: number }",
      });
    }

    return events;
  }

  private classifyMechanic(name: string): MechanicDefinition["type"] {
    const lower = name.toLowerCase();
    if (
      lower.includes("jump") ||
      lower.includes("run") ||
      lower.includes("climb") ||
      lower.includes("slide")
    )
      return "movement";
    if (
      lower.includes("fight") ||
      lower.includes("combat") ||
      lower.includes("attack") ||
      lower.includes("shoot")
    )
      return "combat";
    if (
      lower.includes("collect") ||
      lower.includes("gather") ||
      lower.includes("pickup")
    )
      return "collection";
    if (lower.includes("puzzle") || lower.includes("solve")) return "puzzle";
    if (
      lower.includes("trade") ||
      lower.includes("chat") ||
      lower.includes("team")
    )
      return "social";
    return "custom";
  }

  private getServicesForMechanic(name: string): string[] {
    const type = this.classifyMechanic(name);
    switch (type) {
      case "combat":
        return ["HealthSystem", "NetworkManager"];
      case "collection":
        return ["InventoryService", "DataStoreService"];
      case "movement":
        return ["PlayerManager"];
      default:
        return ["GameStateManager"];
    }
  }

  private pascalCase(str: string): string {
    return str
      .replace(/(?:^|\s|-|_)\w/g, (c) => c.toUpperCase())
      .replace(/[\s_-]/g, "");
  }
}
