/**
 * EnvironmentGenerator.ts
 *
 * Generates game environment: maps, zones, spawn points, environment objects.
 * Produces an EnvironmentManifest consumed by asset builders.
 */

import {
  BaseGenerator,
  type GeneratorInput,
  type GeneratorOutput,
  type GeneratorMetadata,
} from "../BaseGenerator";

export interface EnvironmentManifest {
  maps: MapDefinition[];
  zones: ZoneDefinition[];
  spawnPoints: SpawnPointDefinition[];
  environmentObjects: EnvironmentObjectDefinition[];
}

export interface MapDefinition {
  id: string;
  name: string;
  type: "main" | "lobby" | "arena" | "dungeon" | "stage";
  size: { x: number; y: number; z: number };
  theme: string;
  zones: string[];
}

export interface ZoneDefinition {
  id: string;
  name: string;
  mapId: string;
  type: "safe" | "combat" | "puzzle" | "exploration" | "transition";
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  properties: Record<string, unknown>;
}

export interface SpawnPointDefinition {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  type: "initial" | "checkpoint" | "respawn" | "team";
  mapId: string;
}

export interface EnvironmentObjectDefinition {
  id: string;
  name: string;
  objectType:
    "terrain" | "structure" | "decoration" | "interactive" | "barrier";
  position: { x: number; y: number; z: number };
  properties: Record<string, unknown>;
  mapId: string;
}

export class EnvironmentGenerator extends BaseGenerator {
  readonly metadata: GeneratorMetadata = {
    id: "environment-generator",
    name: "Environment Generator",
    version: "1.0.0",
    dependencies: ["game-structure-generator", "gameplay-generator"],
    produces: ["environment-manifest"],
  };

  async generate(input: GeneratorInput): Promise<GeneratorOutput> {
    const start = Date.now();
    const { model, blueprint } = input;
    const modifications: string[] = [];
    const gameType = (blueprint.game_type as string) ?? model.game.genre;

    const maps = this.generateMaps(gameType, model.game.title);
    const zones = this.generateZones(maps, gameType);
    const spawnPoints = this.generateSpawnPoints(maps, gameType);
    const environmentObjects = this.generateObjects(maps, gameType);

    const manifest: EnvironmentManifest = {
      maps,
      zones,
      spawnPoints,
      environmentObjects,
    };

    // Store in context
    if (typeof input.context === "object" && input.context !== null) {
      (input.context as Record<string, unknown>)["environmentManifest"] =
        manifest;
    }

    // Add asset definitions to model
    for (const map of maps) {
      model.assets.push({
        id: `asset-map-${map.id}`,
        name: map.name,
        assetType: "model",
        path: `Workspace/Map/${map.name}`,
        metadata: { mapType: map.type, theme: map.theme, size: map.size },
      });
    }

    modifications.push("environment-manifest", "assets");
    return {
      generatorId: this.metadata.id,
      success: true,
      modifications,
      durationMs: Date.now() - start,
    };
  }

  private generateMaps(gameType: string, gameTitle: string): MapDefinition[] {
    const maps: MapDefinition[] = [];

    // Always generate a lobby
    maps.push({
      id: "map-lobby",
      name: "Lobby",
      type: "lobby",
      size: { x: 200, y: 50, z: 200 },
      theme: "modern",
      zones: ["zone-lobby-safe"],
    });

    switch (gameType) {
      case "obby":
      case "platformer":
        for (let i = 1; i <= 5; i++) {
          maps.push({
            id: `map-stage-${i}`,
            name: `Stage ${i}`,
            type: "stage",
            size: { x: 100 + i * 50, y: 100, z: 50 },
            theme: this.getStageTheme(i),
            zones: [`zone-stage-${i}`],
          });
        }
        break;
      case "rpg":
      case "adventure":
        maps.push({
          id: "map-overworld",
          name: `${gameTitle} World`,
          type: "main",
          size: { x: 1000, y: 200, z: 1000 },
          theme: "fantasy",
          zones: ["zone-town", "zone-wilderness", "zone-dungeon-entrance"],
        });
        maps.push({
          id: "map-dungeon",
          name: "Dungeon",
          type: "dungeon",
          size: { x: 300, y: 100, z: 300 },
          theme: "dark",
          zones: ["zone-dungeon"],
        });
        break;
      default:
        maps.push({
          id: "map-main",
          name: `${gameTitle} Arena`,
          type: "main",
          size: { x: 500, y: 100, z: 500 },
          theme: "default",
          zones: ["zone-main"],
        });
    }

    return maps;
  }

  private generateZones(
    maps: MapDefinition[],
    gameType: string,
  ): ZoneDefinition[] {
    const zones: ZoneDefinition[] = [];

    for (const map of maps) {
      if (map.type === "lobby") {
        zones.push({
          id: "zone-lobby-safe",
          name: "Lobby Safe Zone",
          mapId: map.id,
          type: "safe",
          bounds: { minX: -100, minZ: -100, maxX: 100, maxZ: 100 },
          properties: { pvpEnabled: false },
        });
      } else if (map.type === "stage") {
        zones.push({
          id: `zone-${map.id}`,
          name: `${map.name} Zone`,
          mapId: map.id,
          type: "exploration",
          bounds: { minX: 0, minZ: 0, maxX: map.size.x, maxZ: map.size.z },
          properties: {},
        });
      } else if (map.type === "main") {
        zones.push({
          id: `zone-${map.id}-safe`,
          name: "Safe Area",
          mapId: map.id,
          type: "safe",
          bounds: { minX: -50, minZ: -50, maxX: 50, maxZ: 50 },
          properties: {},
        });
        if (gameType === "rpg") {
          zones.push({
            id: `zone-${map.id}-combat`,
            name: "Combat Zone",
            mapId: map.id,
            type: "combat",
            bounds: { minX: 100, minZ: 100, maxX: 400, maxZ: 400 },
            properties: { enemyLevel: 1 },
          });
        }
      }
    }

    return zones;
  }

  private generateSpawnPoints(
    maps: MapDefinition[],
    gameType: string,
  ): SpawnPointDefinition[] {
    const spawns: SpawnPointDefinition[] = [];

    // Initial spawn (lobby)
    spawns.push({
      id: "spawn-initial",
      name: "InitialSpawn",
      position: { x: 0, y: 5, z: 0 },
      type: "initial",
      mapId: "map-lobby",
    });

    if (gameType === "obby" || gameType === "platformer") {
      for (let i = 1; i <= 5; i++) {
        spawns.push({
          id: `spawn-stage-${i}`,
          name: `Stage${i}Checkpoint`,
          position: { x: 0, y: 5, z: 0 },
          type: "checkpoint",
          mapId: `map-stage-${i}`,
        });
      }
    } else {
      spawns.push({
        id: "spawn-respawn",
        name: "Respawn",
        position: { x: 0, y: 5, z: 10 },
        type: "respawn",
        mapId: maps.length > 1 ? maps[1].id : "map-lobby",
      });
    }

    return spawns;
  }

  private generateObjects(
    maps: MapDefinition[],
    gameType: string,
  ): EnvironmentObjectDefinition[] {
    const objects: EnvironmentObjectDefinition[] = [];

    // Lobby decorations
    objects.push({
      id: "obj-lobby-sign",
      name: "WelcomeSign",
      objectType: "decoration",
      position: { x: 0, y: 10, z: -20 },
      properties: { text: "Welcome!" },
      mapId: "map-lobby",
    });

    if (gameType === "obby") {
      objects.push({
        id: "obj-finish",
        name: "FinishLine",
        objectType: "interactive",
        position: { x: 0, y: 5, z: 0 },
        properties: { triggerEvent: "StageComplete" },
        mapId: "map-stage-5",
      });
    }

    // Barriers for map edges
    for (const map of maps.filter((m) => m.type !== "lobby")) {
      objects.push({
        id: `obj-barrier-${map.id}`,
        name: `${map.name}Barrier`,
        objectType: "barrier",
        position: { x: 0, y: 0, z: 0 },
        properties: { invisible: true },
        mapId: map.id,
      });
    }

    return objects;
  }

  private getStageTheme(index: number): string {
    const themes = ["grass", "desert", "ice", "lava", "sky"];
    return themes[(index - 1) % themes.length];
  }
}
