/**
 * ConfigurationTemplate.ts — Template for configuration module generation.
 */

import { BaseLuaTemplate, type TemplateContext } from "./BaseLuaTemplate";

export interface ConfigTemplateContext extends TemplateContext {
  settings: Record<string, unknown>;
}

export class ConfigurationTemplate extends BaseLuaTemplate {
  readonly templateId = "configuration";

  render(context: TemplateContext): string {
    const ctx = context as ConfigTemplateContext;
    const lines: string[] = [];
    lines.push(
      this.header(`${ctx.name} Configuration`, "ConfigurationTemplate"),
    );
    lines.push("");
    lines.push(`local ${ctx.name} = ${this.luaTable(ctx.settings ?? {})}`);
    lines.push("");
    lines.push(`return ${ctx.name}`);
    lines.push("");
    return lines.join("\n");
  }
}
