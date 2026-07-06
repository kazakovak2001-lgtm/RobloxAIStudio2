/**
 * GameStructureGenerator.ts
 *
 * Generates the fundamental Roblox game structure from a blueprint:
 *   - Folder hierarchy
 *   - Service definitions
 *   - Object layout
 *   - Dependency graph
 *
 * Produces a GameStructureManifest for downstream consumers.
 */

import {
  BaseGenerator,
  type GeneratorInput,
  type GeneratorOutput,
  type GeneratorMetadata,
} from "../BaseGenerator";
import type {
  GenerationModel,
  ServiceDefinition,
  FolderDefinition,
  DependencyEntry,
} from "../GenerationModel";

export interface GameStructureManifest {
  folders: FolderDefinition[];
  services: ServiceDefinition[];
  objects: Array<{ name: string; type: string; parent: string }>;
  hierarchy: Array<{ parent: string; children: string[] }>;
  dependencies: DependencyEntry[];
}

export class GameStructureGenerator extends BaseGenerator {
  readonly metadata: GeneratorMetadata = {
    id: "game-structure-generator",
    name: "Game Structure Generator",
    version: "1.0.0",
    dependencies: [],
    produces: ["folders", "services", "dependencies"],
  };

  async generate(input: GeneratorInput): Promise<GeneratorOutput> {
    const start = Date.now();
    const { model, blueprint } = input;
    const modifications: string[] = [];

    // Generate folder hierarchy
    const folders = this.generateFolders(blueprint);
    model.folders = folders;
    modifications.push("folders");

    // Generate services
    const services = this.generateServices(model, blueprint);
    model.services = services;
    modifications.push("services");

    // Generate dependency graph
    const deps = this.generateDependencies(services);
    model.dependencies = deps;
    modifications.push("dependencies");

    // Store manifest in model metadata for downstream access
    const manifest: GameStructureManifest = {
      folders,
      services,
      objects: this.generateObjects(blueprint),
      hierarchy: this.buildHierarchy(folders),
      dependencies: deps,
    };

    // Attach to context for pipeline access
    if (typeof input.context === "object" && input.context !== null) {
      (input.context as Record<string, unknown>)["gameStructureManifest"] =
        manifest;
    }

    return {
      generatorId: this.metadata.id,
      success: true,
      modifications,
      durationMs: Date.now() - start,
    };
  }

  private generateFolders(
    blueprint: Record<string, unknown>,
  ): FolderDefinition[] {
    const folders: FolderDefinition[] = [
      {
        path: "ServerScriptService",
        parent: "game",
        purpose: "Server scripts",
      },
      {
        path: "ServerScriptService/Services",
        parent: "ServerScriptService",
        purpose: "Game service modules",
      },
      {
        path: "ServerScriptService/Systems",
        parent: "ServerScriptService",
        purpose: "Core game systems",
      },
      { path: "ReplicatedStorage", parent: "game", purpose: "Shared assets" },
      {
        path: "ReplicatedStorage/Modules",
        parent: "ReplicatedStorage",
        purpose: "Shared modules",
      },
      {
        path: "ReplicatedStorage/Events",
        parent: "ReplicatedStorage",
        purpose: "Remote events",
      },
      {
        path: "ReplicatedStorage/Config",
        parent: "ReplicatedStorage",
        purpose: "Shared configuration",
      },
      {
        path: "StarterPlayerScripts",
        parent: "StarterPlayer",
        purpose: "Client scripts",
      },
      {
        path: "StarterPlayerScripts/Controllers",
        parent: "StarterPlayerScripts",
        purpose: "Client controllers",
      },
      { path: "StarterGui", parent: "game", purpose: "UI" },
      {
        path: "StarterGui/Screens",
        parent: "StarterGui",
        purpose: "Screen GUIs",
      },
      { path: "Workspace", parent: "game", purpose: "3D world" },
      { path: "Workspace/Map", parent: "Workspace", purpose: "Map geometry" },
      { path: "ServerStorage", parent: "game", purpose: "Server-only storage" },
      { path: "Lighting", parent: "game", purpose: "Lighting configuration" },
    ];

    // Game-type-specific folders
    const gameType =
      (blueprint.game_type as string) ?? (blueprint.genre as string) ?? "";
    if (gameType === "obby" || gameType === "platformer") {
      folders.push({
        path: "Workspace/Map/Stages",
        parent: "Workspace/Map",
        purpose: "Obby stages",
      });
      folders.push({
        path: "Workspace/Map/Checkpoints",
        parent: "Workspace/Map",
        purpose: "Checkpoint markers",
      });
    }
    if (gameType === "rpg" || gameType === "adventure") {
      folders.push({
        path: "Workspace/Map/NPCs",
        parent: "Workspace/Map",
        purpose: "NPC spawn locations",
      });
      folders.push({
        path: "Workspace/Map/Quests",
        parent: "Workspace/Map",
        purpose: "Quest trigger zones",
      });
    }

    return folders;
  }

  private generateServices(
    model: GenerationModel,
    blueprint: Record<string, unknown>,
  ): ServiceDefinition[] {
    const services: ServiceDefinition[] = [
      {
        name: "DataStoreService",
        type: "server",
        description: "Player data persistence",
        dependencies: [],
      },
      {
        name: "GameStateManager",
        type: "server",
        description: "Core game state machine",
        dependencies: [],
      },
      {
        name: "PlayerManager",
        type: "server",
        description: "Player lifecycle management",
        dependencies: ["DataStoreService"],
      },
      {
        name: "NetworkManager",
        type: "shared",
        description: "Client-server communication",
        dependencies: [],
      },
    ];

    const gameType = (blueprint.game_type as string) ?? model.game.genre;
    if (gameType === "obby" || gameType === "platformer") {
      services.push({
        name: "CheckpointManager",
        type: "server",
        description: "Checkpoint tracking",
        dependencies: ["DataStoreService", "PlayerManager"],
      });
      services.push({
        name: "StageManager",
        type: "server",
        description: "Stage progression",
        dependencies: ["GameStateManager"],
      });
    }
    if (gameType === "rpg" || gameType === "adventure") {
      services.push({
        name: "InventoryService",
        type: "server",
        description: "Player inventory",
        dependencies: ["DataStoreService"],
      });
      services.push({
        name: "QuestManager",
        type: "server",
        description: "Quest tracking",
        dependencies: ["PlayerManager"],
      });
    }

    return services;
  }

  private generateObjects(
    blueprint: Record<string, unknown>,
  ): Array<{ name: string; type: string; parent: string }> {
    const objects = [
      { name: "SpawnLocation", type: "SpawnLocation", parent: "Workspace" },
      {
        name: "GameConfig",
        type: "Configuration",
        parent: "ReplicatedStorage/Config",
      },
    ];

    const gameType = (blueprint.game_type as string) ?? "";
    if (gameType === "obby") {
      objects.push({
        name: "FinishPlatform",
        type: "Part",
        parent: "Workspace/Map",
      });
    }

    return objects;
  }

  private buildHierarchy(
    folders: FolderDefinition[],
  ): Array<{ parent: string; children: string[] }> {
    const parentMap = new Map<string, string[]>();
    for (const folder of folders) {
      if (!parentMap.has(folder.parent)) parentMap.set(folder.parent, []);
      parentMap.get(folder.parent)!.push(folder.path);
    }
    return [...parentMap.entries()].map(([parent, children]) => ({
      parent,
      children,
    }));
  }

  private generateDependencies(
    services: ServiceDefinition[],
  ): DependencyEntry[] {
    const deps: DependencyEntry[] = [];
    for (const svc of services) {
      for (const dep of svc.dependencies) {
        deps.push({ from: svc.name, to: dep, type: "requires" });
      }
    }
    return deps;
  }
}
