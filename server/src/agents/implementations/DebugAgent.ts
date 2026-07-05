import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import type { AgentInput } from "../../types";

export class DebugAgent extends BaseAgent {
  public readonly name = "Debug";
  public readonly description =
    "Identifies potential issues in generated code and suggests fixes";

  public readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      lua_generator: { type: "object" },
      blueprint: { type: "object" },
    },
  };

  public readonly outputSchema: Record<string, unknown> = {
    type: "object",
    properties: { debugReport: { type: "object" } },
    required: ["debugReport"],
  };

  constructor(config?: Partial<AgentConfig>) {
    super(config);
  }

  protected async process(input: AgentInput): Promise<Record<string, unknown>> {
    const bp = input.blueprint as Record<string, unknown> | undefined;
    const name = String(bp?.name ?? "Unnamed Game");

    const fallback: Record<string, unknown> = {
      debugReport: {
        issues: [],
        fixes: [],
        warnings: [
          "Ensure all RemoteEvents are validated server-side",
          "Add pcall wrappers around DataStore operations",
          "Check for memory leaks in recurring loops",
        ],
        severity: "low",
      },
    };

    if (!this.llm) return fallback;

    const luaOutput = input.lua_generator as
      | Record<string, unknown>
      | undefined;
    const scriptCount = [
      ...(Array.isArray((luaOutput as any)?.server)
        ? (luaOutput as any).server
        : []),
      ...(Array.isArray((luaOutput as any)?.client)
        ? (luaOutput as any).client
        : []),
    ].length;

    const prompt =
      "You are a Roblox Lua debugger. Identify potential issues in the generated code. " +
      'Respond with: { "debugReport": { "issues": Array<{id,description,severity:"low"|"medium"|"high"}>, ' +
      '"fixes": Array<{issueId,fix}>, "warnings": string[], "severity": "low"|"medium"|"high" } }\n\n' +
      `Game: ${name}\nScripts generated: ${scriptCount}\n\nReturn only valid JSON.`;

    return this.generateWithRetry(prompt, ["debugReport"], fallback, {
      temperature: 0.3,
      maxTokens: 800,
    });
  }
}
