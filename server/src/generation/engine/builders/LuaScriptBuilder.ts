/**
 * LuaScriptBuilder.ts — Converts ScriptDefinitions into final Lua file artifacts.
 */

import type { ScriptDefinition } from "../GenerationModel";
import type { ProjectNode } from "../model/RobloxProjectModel";

export interface BuiltScript {
  node: ProjectNode;
  path: string;
  content: string;
  sizeBytes: number;
}

export class LuaScriptBuilder {
  /**
   * Build a ProjectNode from a ScriptDefinition.
   */
  build(script: ScriptDefinition): BuiltScript {
    const nodeType = this.mapScriptType(script.scriptType);
    const content = script.content;

    return {
      node: { name: script.name, type: nodeType, path: script.path, content },
      path: script.path,
      content,
      sizeBytes: content.length * 2,
    };
  }

  /**
   * Build all scripts from a model.
   */
  buildAll(scripts: ScriptDefinition[]): BuiltScript[] {
    return scripts.map((s) => this.build(s));
  }

  private mapScriptType(
    scriptType: ScriptDefinition["scriptType"],
  ): ProjectNode["type"] {
    switch (scriptType) {
      case "server":
        return "Script";
      case "client":
        return "LocalScript";
      case "module":
        return "ModuleScript";
      default:
        return "Script";
    }
  }
}
