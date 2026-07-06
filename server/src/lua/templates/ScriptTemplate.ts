/**
 * ScriptTemplate.ts — Template for Server/LocalScript generation.
 */

import { BaseLuaTemplate, type TemplateContext } from "./BaseLuaTemplate";

export interface ScriptTemplateContext extends TemplateContext {
  scriptType: "server" | "client";
  services: string[];
  body: string;
}

export class ScriptTemplate extends BaseLuaTemplate {
  readonly templateId = "script";

  render(context: TemplateContext): string {
    const ctx = context as ScriptTemplateContext;
    const lines: string[] = [];
    lines.push(this.header(ctx.name, "ScriptTemplate"));
    lines.push("");
    for (const svc of ctx.services ?? []) {
      lines.push(`local ${svc} = game:GetService("${svc}")`);
    }
    if ((ctx.services ?? []).length > 0) lines.push("");
    lines.push(ctx.body ?? `-- ${ctx.name} implementation`);
    lines.push("");
    return lines.join("\n");
  }
}
