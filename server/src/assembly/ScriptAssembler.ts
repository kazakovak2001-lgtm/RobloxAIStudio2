import type {
  AssemblyScript,
  ScriptType,
  RobloxService,
} from "./AssemblyTypes";
import type { GameBlueprint } from "../generation/GenerationBlueprint";

/**
 * ScriptAssembler
 *
 * Assembles logical script definitions from the GameBlueprint.
 * Assigns each script a type, service, and path based on its role.
 * Only creates metadata and placement — no Lua optimization.
 */
export class ScriptAssembler {
  private counter = 0;

  /**
   * Assemble all scripts from the blueprint.
   * Returns: { scripts (Server), modules (ModuleScript), ui (LocalScript) }
   */
  assemble(blueprint: GameBlueprint): {
    scripts: AssemblyScript[];
    modules: AssemblyScript[];
    ui: AssemblyScript[];
  } {
    const scripts: AssemblyScript[] = [];
    const modules: AssemblyScript[] = [];
    const ui: AssemblyScript[] = [];

    // ── Server scripts ──────────────────────────────────────────────────
    if (blueprint.scripts?.server) {
      for (const s of blueprint.scripts.server) {
        scripts.push(
          this.createScript(
            s.name,
            "Script",
            "ServerScriptService",
            `ServerScriptService/${this.cleanName(s.name)}`,
            s.code,
            ["server"],
          ),
        );
      }
    }

    // ── Client scripts ──────────────────────────────────────────────────
    if (blueprint.scripts?.client) {
      for (const s of blueprint.scripts.client) {
        ui.push(
          this.createScript(
            s.name,
            "LocalScript",
            "StarterPlayer",
            `StarterPlayer/StarterPlayerScripts/${this.cleanName(s.name)}`,
            s.code,
            ["client"],
          ),
        );
      }
    }

    // ── Shared modules ──────────────────────────────────────────────────
    if (blueprint.scripts?.shared) {
      for (const s of blueprint.scripts.shared) {
        modules.push(
          this.createScript(
            s.name,
            "ModuleScript",
            "ReplicatedStorage",
            `ReplicatedStorage/Shared/${this.cleanName(s.name)}`,
            s.code,
            ["shared", "module"],
          ),
        );
      }
    }

    // ── UI scripts from ui section ──────────────────────────────────────
    if (blueprint.ui?.screens) {
      for (const screen of blueprint.ui.screens) {
        const screenName =
          typeof screen.name === "string" ? screen.name : "Screen";
        ui.push(
          this.createScript(
            `${screenName}Controller`,
            "LocalScript",
            "StarterGui",
            `StarterGui/Screens/${this.cleanName(screenName)}`,
            `-- UI Controller: ${screenName}\nlocal controller = {}\nreturn controller`,
            ["ui", "screen"],
          ),
        );
      }
    }

    // ── Configuration module ────────────────────────────────────────────
    if (blueprint.project) {
      modules.push(
        this.createScript(
          "GameConfig",
          "ModuleScript",
          "ReplicatedStorage",
          "ReplicatedStorage/Config/GameConfig",
          `-- Game Configuration\nreturn {\n\tNAME = "${blueprint.project.name ?? "Game"}",\n\tVERSION = "1.0.0",\n\tGAME_TYPE = "${blueprint.project.gameType ?? "adventure"}",\n}`,
          ["config", "shared"],
        ),
      );
    }

    console.log(
      `[ASSEMBLY] Script Assembly | Server: ${scripts.length} | Client/UI: ${ui.length} | Modules: ${modules.length}`,
    );

    return { scripts, modules, ui };
  }

  private createScript(
    name: string,
    type: ScriptType,
    service: RobloxService,
    path: string,
    code: string,
    tags: string[],
  ): AssemblyScript {
    this.counter++;
    return {
      id: `script-${this.counter}`,
      name: this.cleanName(name),
      type,
      service,
      path,
      code,
      tags,
    };
  }

  private cleanName(name: string): string {
    return name
      .replace(/\.(server|client|lua)$/i, "")
      .replace(/[^a-zA-Z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
  }
}
