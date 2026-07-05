import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import type { AgentInput } from "../../types";

export class TesterAgent extends BaseAgent {
  public readonly name = "Tester";
  public readonly description =
    "Produces a test plan and validation checklist for generated code";

  public readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      lua_generator: { type: "object" },
      gameplay: { type: "object" },
      blueprint: { type: "object" },
    },
  };

  public readonly outputSchema: Record<string, unknown> = {
    type: "object",
    properties: { testResults: { type: "object" } },
    required: ["testResults"],
  };

  constructor(config?: Partial<AgentConfig>) {
    super(config);
  }

  protected async process(input: AgentInput): Promise<Record<string, unknown>> {
    const bp = input.blueprint as Record<string, unknown> | undefined;
    const name = String(bp?.name ?? "Unnamed Game");

    const fallback: Record<string, unknown> = {
      testResults: {
        passed: 0,
        failed: 0,
        tests: [
          {
            id: "t01",
            name: "Server scripts load without error",
            status: "pending",
          },
          { id: "t02", name: "Player join flow completes", status: "pending" },
          {
            id: "t03",
            name: "DataStore read/write succeeds",
            status: "pending",
          },
          { id: "t04", name: "Core gameplay loop executes", status: "pending" },
          { id: "t05", name: "UI renders on client", status: "pending" },
        ],
        coverage: "Manual validation required",
      },
    };

    if (!this.llm) return fallback;

    const prompt =
      "You are a Roblox QA engineer. Produce a test plan. " +
      'Respond with: { "testResults": { "passed": 0, "failed": 0, ' +
      '"tests": Array<{id,name,status:"pending"|"passed"|"failed",description?}>, "coverage": string } }\n\n' +
      `Game: ${name}\n\nReturn only valid JSON.`;

    return this.generateWithRetry(prompt, ["testResults"], fallback, {
      temperature: 0.3,
      maxTokens: 800,
    });
  }
}
