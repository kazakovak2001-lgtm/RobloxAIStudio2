/**
 * ServerScriptBuilder.ts — Builds server scripts from GenerationModel.
 */

import type { ScriptDefinition } from "../../generation/engine/GenerationModel";
import { ScriptTemplate } from "../templates/ScriptTemplate";
import { LuaFormatter } from "../LuaFormatter";

export interface BuiltLuaFile {
  path: string;
  content: string;
  lines: number;
  size: number;
}

export class ServerScriptBuilder {
  private template = new ScriptTemplate();
  private formatter = new LuaFormatter();

  build(scripts: ScriptDefinition[]): BuiltLuaFile[] {
    return scripts
      .filter((s) => s.scriptType === "server")
      .map((s) => this.buildOne(s));
  }

  private buildOne(script: ScriptDefinition): BuiltLuaFile {
    const content = script.content
      ? this.formatter.format(script.content)
      : this.formatter.format(
          this.template.render({
            name: script.name,
            metadata: {},
            scriptType: "server",
            services: ["Players", "ReplicatedStorage"],
            body: `-- ${script.name} server logic`,
          }),
        );
    return {
      path: script.path,
      content,
      lines: content.split("\n").length,
      size: content.length * 2,
    };
  }
}
