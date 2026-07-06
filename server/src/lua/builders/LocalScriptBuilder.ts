/**
 * LocalScriptBuilder.ts — Builds client LocalScripts.
 */

import type { ScriptDefinition } from "../../generation/engine/GenerationModel";
import { ScriptTemplate } from "../templates/ScriptTemplate";
import { LuaFormatter } from "../LuaFormatter";
import type { BuiltLuaFile } from "./ServerScriptBuilder";

export class LocalScriptBuilder {
  private template = new ScriptTemplate();
  private formatter = new LuaFormatter();

  build(scripts: ScriptDefinition[]): BuiltLuaFile[] {
    return scripts
      .filter((s) => s.scriptType === "client")
      .map((s) => this.buildOne(s));
  }

  private buildOne(script: ScriptDefinition): BuiltLuaFile {
    const content = script.content
      ? this.formatter.format(script.content)
      : this.formatter.format(
          this.template.render({
            name: script.name,
            metadata: {},
            scriptType: "client",
            services: ["Players", "ReplicatedStorage"],
            body: `-- ${script.name} client logic`,
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
