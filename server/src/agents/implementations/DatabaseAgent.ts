import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import type { AgentInput } from "../../types";
import { LLMOutputParser } from "../../ai/outputParser";

export class DatabaseAgent extends BaseAgent {
  public readonly name = "Database";
  public readonly description =
    "Designs DataStore schema and data persistence strategy";

  public readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      requirements: { type: "object" },
      gameplay: { type: "object" },
      blueprint: { type: "object" },
    },
  };

  public readonly outputSchema: Record<string, unknown> = {
    type: "object",
    properties: { database: { type: "object" } },
    required: ["database"],
  };

  constructor(config?: Partial<AgentConfig>) {
    super(config);
  }

  protected async process(input: AgentInput): Promise<Record<string, unknown>> {
    const bp = input.blueprint as Record<string, unknown> | undefined;
    const name = String(bp?.name ?? "Unnamed Game");

    const fallback: Record<string, unknown> = {
      database: {
        tables: [
          {
            name: "PlayerData",
            fields: ["userId", "level", "currency", "inventory", "lastLogin"],
            primaryKey: "userId",
          },
          {
            name: "GameState",
            fields: ["sessionId", "phase", "startTime", "activeCount"],
            primaryKey: "sessionId",
          },
        ],
        relationships: [
          {
            from: "PlayerData",
            to: "GameState",
            type: "many-to-one",
            on: "sessionId",
          },
        ],
        datastoreKeys: ["PlayerData_{{userId}}", "GlobalLeaderboard"],
        cachingStrategy:
          "In-memory cache with 5-minute TTL, write-through on session end",
      },
    };

    if (!this.llm) return fallback;

    const prompt =
      "You are a Roblox DataStore architect. Design the data persistence schema. " +
      'Respond with: { "database": { "tables": Array<{name,fields,primaryKey}>, ' +
      '"relationships": Array<{from,to,type,on}>, "datastoreKeys": string[], "cachingStrategy": string } }\n\n' +
      `Game: ${name}\n\nReturn only valid JSON.`;

    const raw = await this.llm.generate(prompt, {
      temperature: 0.3,
      maxTokens: 800,
    });

    return LLMOutputParser.parseAndValidate(
      raw,
      ["database"],
      fallback,
      this.name,
    );
  }
}
