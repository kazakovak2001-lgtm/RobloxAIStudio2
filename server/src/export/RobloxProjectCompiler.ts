/**
 * RobloxProjectCompiler.ts
 *
 * MVP CRITICAL — transforms a GameArtifact into a Roblox Studio project structure.
 * Output: folder tree with Lua scripts placed in correct Roblox services.
 * Deterministic: same artifact → same project structure.
 */

import type { GameArtifact } from "../artifacts/GameArtifact";
import type { LuaScript } from "../generation/lua/LuaGenerator";

export interface ProjectFile {
  path: string;
  content: string;
}

export interface RobloxProject {
  artifactId: string;
  projectName: string;
  files: ProjectFile[];
  structure: {
    ServerScriptService: string[];
    ReplicatedStorage: string[];
    StarterPlayerScripts: string[];
    Workspace: string[];
  };
  totalFiles: number;
  compiledAt: Date;
  valid: boolean;
}

export class RobloxProjectCompiler {
  /**
   * Compile a GameArtifact into a Roblox Studio-ready project.
   */
  compile(artifact: GameArtifact): RobloxProject {
    const files: ProjectFile[] = [];
    const structure = {
      ServerScriptService: [] as string[],
      ReplicatedStorage: [] as string[],
      StarterPlayerScripts: [] as string[],
      Workspace: [] as string[],
    };

    // Place scripts into correct services
    for (const script of artifact.scripts.scripts) {
      const file = this.compileScript(script);
      files.push(file);

      switch (script.type) {
        case "server":
          structure.ServerScriptService.push(script.name);
          break;
        case "client":
          structure.StarterPlayerScripts.push(script.name);
          break;
        case "shared":
          structure.ReplicatedStorage.push(script.name);
          break;
      }
    }

    // Game manifest
    files.push({
      path: "game.json",
      content: JSON.stringify(
        {
          name: artifact.blueprint.title,
          genre: artifact.blueprint.genre,
          version: artifact.version,
          mechanics: artifact.blueprint.mechanics,
          validation: {
            score: artifact.validationReport.score,
            passed: artifact.validationReport.passed,
          },
          compiledAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    });

    // Rojo project file (for Studio sync)
    files.push({
      path: "default.project.json",
      content: JSON.stringify(
        {
          name: artifact.blueprint.title,
          tree: {
            $className: "DataModel",
            ServerScriptService: {
              $className: "ServerScriptService",
              $path: "ServerScriptService",
            },
            ReplicatedStorage: {
              $className: "ReplicatedStorage",
              $path: "ReplicatedStorage",
            },
            StarterPlayer: {
              $className: "StarterPlayer",
              StarterPlayerScripts: {
                $className: "StarterPlayerScripts",
                $path: "StarterPlayerScripts",
              },
            },
          },
        },
        null,
        2,
      ),
    });

    // Validate output
    const valid = this.validate(files, structure);

    const project: RobloxProject = {
      artifactId: artifact.id,
      projectName: artifact.blueprint.title,
      files,
      structure,
      totalFiles: files.length,
      compiledAt: new Date(),
      valid,
    };

    console.log(
      `[COMPILER] Project compiled | Name: ${project.projectName} | Files: ${project.totalFiles} | Valid: ${valid}`,
    );

    return project;
  }

  private compileScript(script: LuaScript): ProjectFile {
    const dir = this.getDirectory(script.type);
    return {
      path: `${dir}/${script.name}.lua`,
      content: script.code,
    };
  }

  private getDirectory(type: LuaScript["type"]): string {
    switch (type) {
      case "server":
        return "ServerScriptService";
      case "client":
        return "StarterPlayerScripts";
      case "shared":
        return "ReplicatedStorage";
    }
  }

  private validate(
    files: ProjectFile[],
    structure: RobloxProject["structure"],
  ): boolean {
    // Must have at least one server script
    if (structure.ServerScriptService.length === 0) return false;
    // Must have game manifest
    if (!files.some((f) => f.path === "game.json")) return false;
    // All scripts must have content
    if (
      files.some((f) => f.path.endsWith(".lua") && f.content.trim().length < 10)
    )
      return false;
    return true;
  }
}
