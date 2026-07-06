/**
 * ModuleScriptBuilder.ts — Builds ModuleScripts from GenerationModel modules.
 */

import type { ModuleDefinition } from "../../generation/engine/GenerationModel";
import { ModuleTemplate } from "../templates/ModuleTemplate";
import { LuaFormatter } from "../LuaFormatter";
import type { BuiltLuaFile } from "./ServerScriptBuilder";

export class ModuleScriptBuilder {
  private template = new ModuleTemplate();
  private formatter = new LuaFormatter();

  build(modules: ModuleDefinition[]): BuiltLuaFile[] {
    return modules.map((m) => this.buildOne(m));
  }

  private buildOne(mod: ModuleDefinition): BuiltLuaFile {
    const content = this.formatter.format(
      this.template.render({
        name: mod.name,
        metadata: {},
        exports: mod.exports,
        requires: mod.dependencies,
      }),
    );
    return {
      path: mod.path,
      content,
      lines: content.split("\n").length,
      size: content.length * 2,
    };
  }
}
