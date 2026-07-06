/**
 * ServiceTemplate.ts — Template for service module generation.
 */

import { BaseLuaTemplate, type TemplateContext } from "./BaseLuaTemplate";

export interface ServiceTemplateContext extends TemplateContext {
  serviceType: "server" | "client" | "shared";
  dependencies: string[];
  methods: string[];
}

export class ServiceTemplate extends BaseLuaTemplate {
  readonly templateId = "service";

  render(context: TemplateContext): string {
    const ctx = context as ServiceTemplateContext;
    const lines: string[] = [];
    lines.push(this.header(`${ctx.name} Service`, "ServiceTemplate"));
    lines.push("");
    for (const dep of ctx.dependencies ?? []) {
      lines.push(
        `local ${dep} = require(script.Parent:FindFirstChild("${dep}"))`,
      );
    }
    if ((ctx.dependencies ?? []).length > 0) lines.push("");
    lines.push(`local ${ctx.name} = {}`);
    lines.push(`${ctx.name}.__index = ${ctx.name}`);
    lines.push("");
    lines.push(`function ${ctx.name}.new()`);
    lines.push(`    local self = setmetatable({}, ${ctx.name})`);
    lines.push(`    self._initialized = false`);
    lines.push(`    return self`);
    lines.push(`end`);
    lines.push("");
    lines.push(`function ${ctx.name}:Init()`);
    lines.push(`    self._initialized = true`);
    lines.push(`end`);
    lines.push("");
    for (const method of ctx.methods ?? []) {
      lines.push(`function ${ctx.name}:${method}()`);
      lines.push(`    -- TODO: Implement ${method}`);
      lines.push(`end`);
      lines.push("");
    }
    lines.push(`return ${ctx.name}`);
    lines.push("");
    return lines.join("\n");
  }
}
