/**
 * ServiceGenerator.ts — Generates service definitions from blueprint.
 */

import {
  BaseGenerator,
  type GeneratorInput,
  type GeneratorOutput,
  type GeneratorMetadata,
} from "../BaseGenerator";

export class ServiceGenerator extends BaseGenerator {
  readonly metadata: GeneratorMetadata = {
    id: "service-generator",
    name: "Service Generator",
    version: "1.0.0",
    dependencies: ["folder-generator"],
    produces: ["services"],
  };

  async generate(input: GeneratorInput): Promise<GeneratorOutput> {
    const start = Date.now();
    const { model, blueprint } = input;
    const modifications: string[] = [];
    const gameType = (blueprint.game_type as string) ?? model.game.genre;

    // Always include core services
    const coreServices = [
      {
        name: "PlayerDataService",
        type: "server" as const,
        description: "Manages player data persistence",
      },
      {
        name: "GameStateService",
        type: "server" as const,
        description: "Manages game state transitions",
      },
      {
        name: "NetworkService",
        type: "shared" as const,
        description: "Client-server communication layer",
      },
    ];

    for (const svc of coreServices) {
      if (!model.services.some((s) => s.name === svc.name)) {
        model.services.push({ ...svc, dependencies: [] });
        modifications.push(svc.name);
      }
    }

    // Game-type specific services
    if (gameType === "rpg" || gameType === "adventure") {
      model.services.push({
        name: "InventoryService",
        type: "server",
        description: "Player inventory management",
        dependencies: ["PlayerDataService"],
      });
      modifications.push("InventoryService");
    }

    if (gameType === "obby" || gameType === "platformer") {
      model.services.push({
        name: "CheckpointService",
        type: "server",
        description: "Player checkpoint tracking",
        dependencies: ["PlayerDataService"],
      });
      modifications.push("CheckpointService");
    }

    return {
      generatorId: this.metadata.id,
      success: true,
      modifications,
      durationMs: Date.now() - start,
    };
  }
}
