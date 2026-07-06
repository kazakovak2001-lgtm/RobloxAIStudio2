/**
 * ModuleTemplate.ts — Template for ModuleScript generation.
 */

import { BaseLuaTemplate, type TemplateContext } from "./BaseLuaTemplate";

export interface ModuleTemplateContext extends TemplateContext {
  exports: string[];
  requires: string[];
}

export class ModuleTemplate extends BaseLuaTemplate {
  readonly templateId = "module";

  render(context: TemplateContext): string {
    const ctx = context as ModuleTemplateContext;
    const lines: string[] = [];
    lines.push(this.header(ctx.name, "ModuleTemplate"));
    lines.push("");
    for (const req of ctx.requires ?? []) {
      lines.push(
        `local ${req} = require(script.Parent:FindFirstChild("${req}"))`,
      );
    }
    if ((ctx.requires ?? []).length > 0) lines.push("");
    lines.push(`local ${ctx.name} = {}`);
    lines.push("");
    for (const exp of ctx.exports ?? []) {
      lines.push(`function ${ctx.name}.${exp}()`);
      lines.push(`    -- TODO: Implement ${exp}`);
      lines.push(`end`);
      lines.push("");
    }
    lines.push(`return ${ctx.name}`);
    lines.push("");
    return lines.join("\n");
  }
}
