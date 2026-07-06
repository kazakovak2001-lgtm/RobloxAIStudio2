/**
 * RobloxExportBuilder.ts
 *
 * Transforms generation output into a Roblox Studio-compatible project structure.
 * Produces a folder tree ready for Rojo sync or Studio import.
 */

import type { RobloxGameBlueprint } from "../blueprint/GameBlueprintEngine";
import type { LuaGenerationResult, LuaScript } from "../lua/LuaGenerator";
import type { AssetLayout } from "../assets/AssetGenerator";

export interface ExportFile {
  path: string;
  content: string;
  type: "script" | "config" | "metadata";
}

export interface RobloxExportResult {
  blueprintId: string;
  projectName: string;
  files: ExportFile[];
  folderStructure: Record<string, string[]>;
  totalFiles: number;
  exportedAt: Date;
}

export class RobloxExportBuilder {
  /**
   * Build an export-ready Roblox project structure.
   */
  build(
    blueprint: RobloxGameBlueprint,
    lua: LuaGenerationResult,
    assets: AssetLayout,
  ): RobloxExportResult {
    const files: ExportFile[] = [];
    const folders: Record<string, string[]> = {
      ServerScriptService: [],
      ReplicatedStorage: [],
      StarterPlayerScripts: [],
      StarterGui: [],
      Workspace: [],
    };

    // Place Lua scripts
    for (const script of lua.scripts) {
      const file = this.scriptToFile(script);
      files.push(file);

      const folder = this.getFolder(script.type);
      folders[folder]?.push(script.name);
    }

    // Game metadata
    files.push({
      path: "game.project.json",
      content: JSON.stringify(
        {
          name: blueprint.title,
          genre: blueprint.genre,
          version: "1.0.0",
          generatedAt: new Date().toISOString(),
          mechanics: blueprint.mechanics,
          biomes: blueprint.world.biomes,
        },
        null,
        2,
      ),
      type: "metadata",
    });

    // Asset manifest
    files.push({
      path: "assets.manifest.json",
      content: JSON.stringify(
        {
          totalObjects: assets.totalObjects,
          spawnPoints: assets.spawnPoints.length,
          npcSpawns: assets.npcSpawns.length,
          environment: assets.environmentObjects.length,
          placements: assets.placements.map((p) => ({
            id: p.id,
            name: p.name,
            type: p.type,
            position: p.position,
          })),
        },
        null,
        2,
      ),
      type: "metadata",
    });

    // Rojo-compatible project file
    files.push({
      path: "default.project.json",
      content: JSON.stringify(
        {
          name: blueprint.title,
          tree: {
            $className: "DataModel",
            ServerScriptService: {
              $className: "ServerScriptService",
              $path: "src/server",
            },
            ReplicatedStorage: {
              $className: "ReplicatedStorage",
              $path: "src/shared",
            },
            StarterPlayer: {
              $className: "StarterPlayer",
              StarterPlayerScripts: {
                $className: "StarterPlayerScripts",
                $path: "src/client",
              },
            },
          },
        },
        null,
        2,
      ),
      type: "config",
    });

    console.log(
      `[EXPORT] Built | Project: ${blueprint.title} | Files: ${files.length}`,
    );

    return {
      blueprintId: blueprint.id,
      projectName: blueprint.title,
      files,
      folderStructure: folders,
      totalFiles: files.length,
      exportedAt: new Date(),
    };
  }

  private scriptToFile(script: LuaScript): ExportFile {
    const dir =
      script.type === "server"
        ? "src/server"
        : script.type === "client"
          ? "src/client"
          : "src/shared";
    return {
      path: `${dir}/${script.name}.lua`,
      content: script.code,
      type: "script",
    };
  }

  private getFolder(type: LuaScript["type"]): string {
    switch (type) {
      case "server":
        return "ServerScriptService";
      case "client":
        return "StarterPlayerScripts";
      case "shared":
        return "ReplicatedStorage";
    }
  }
}
