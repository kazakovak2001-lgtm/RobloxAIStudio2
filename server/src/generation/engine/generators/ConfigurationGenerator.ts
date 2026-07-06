/**
 * ConfigurationGenerator.ts — Generates game configuration from blueprint.
 */

import {
  BaseGenerator,
  type GeneratorInput,
  type GeneratorOutput,
  type GeneratorMetadata,
} from "../BaseGenerator";

export class ConfigurationGenerator extends BaseGenerator {
  readonly metadata: GeneratorMetadata = {
    id: "configuration-generator",
    name: "Configuration Generator",
    version: "1.0.0",
    dependencies: ["service-generator"],
    produces: ["configuration"],
  };

  async generate(input: GeneratorInput): Promise<GeneratorOutput> {
    const start = Date.now();
    const { model, blueprint } = input;
    const modifications: string[] = [];

    model.configuration.gameSettings = {
      title: model.game.title,
      genre: model.game.genre,
      maxPlayers: model.game.maxPlayers,
      targetAudience: model.game.targetAudience,
      mechanics: model.game.mechanics,
      gameType: (blueprint.game_type as string) ?? model.game.genre,
    };
    modifications.push("gameSettings");

    model.configuration.serverSettings = {
      tickRate: 30,
      autoSaveInterval: 300,
      maxConcurrentPlayers: model.game.maxPlayers,
      debugMode: false,
    };
    modifications.push("serverSettings");

    model.configuration.clientSettings = {
      renderDistance: 500,
      particleQuality: "medium",
      uiScale: 1.0,
      musicEnabled: true,
      sfxEnabled: true,
    };
    modifications.push("clientSettings");

    return {
      generatorId: this.metadata.id,
      success: true,
      modifications,
      durationMs: Date.now() - start,
    };
  }
}
