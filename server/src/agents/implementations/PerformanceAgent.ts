import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import type { AgentInput } from "../../types";
import { LLMOutputParser } from "../../ai/outputParser";

export class PerformanceAgent extends BaseAgent {
  public readonly name = "Performance";
  public readonly description =
    "Produces performance optimization recommendations for the game";

  public readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      lua_generator: { type: "object" },
      architecture: { type: "object" },
      blueprint: { type: "object" },
    },
  };

  public readonly outputSchema: Record<string, unknown> = {
    type: "object",
    properties: { optimization: { type: "object" } },
    required: ["optimization"],
  };

  constructor(config?: Partial<AgentConfig>) {
    super(config);
  }

  protected async process(input: AgentInput): Promise<Record<string, unknown>> {
    const bp = input.blueprint as Record<string, unknown> | undefined;
    const name = String(bp?.name ?? "Unnamed Game");
    const estimatedPlayers = String(bp?.estimated_players ?? "small-group");

    const fallback: Record<string, unknown> = {
      optimization: {
        recommendations: [
          "Use RunService.Heartbeat for physics updates, not while-true loops",
          "Batch RemoteEvent calls to reduce network overhead",
          "Cache frequently-read DataStore values in-memory",
          "Use streaming enabled for large worlds",
          "Pool part instances instead of creating/destroying repeatedly",
        ],
        improvements: [
          { area: "Networking", action: "Compress RemoteEvent payloads > 1KB" },
          {
            area: "Memory",
            action: "Disconnect events when objects are destroyed",
          },
          {
            area: "Rendering",
            action: "Set appropriate LOD distances per asset",
          },
        ],
        targetFPS: 60,
        targetPlayers: estimatedPlayers,
      },
    };

    if (!this.llm) return fallback;

    const prompt =
      "You are a Roblox performance engineer. Provide targeted optimization recommendations. " +
      'Respond with: { "optimization": { ' +
      '"recommendations": string[], "improvements": Array<{area,action}>, ' +
      '"targetFPS": number, "targetPlayers": string } }\n\n' +
      `Game: ${name}\nExpected concurrency: ${estimatedPlayers}\n\nReturn only valid JSON.`;

    const raw = await this.llm.generate(prompt, {
      temperature: 0.3,
      maxTokens: 800,
    });

    return LLMOutputParser.parseAndValidate(
      raw,
      ["optimization"],
      fallback,
      this.name,
    );
  }
}
