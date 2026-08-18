import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import type { AgentInput } from "../../types";

export class RequirementsAgent extends BaseAgent {
  public readonly name = "Requirements";
  public readonly description =
    "Analyzes and extracts structured game requirements";

  public readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      blueprint: { type: "object" },
      gameDesignSeed: { type: "object" },
    },
  };

  public readonly outputSchema: Record<string, unknown> = {
    type: "object",
    properties: { requirements: { type: "object" } },
    required: ["requirements"],
  };

  constructor(config?: Partial<AgentConfig>) {
    super(config);
  }

  protected async process(input: AgentInput): Promise<Record<string, unknown>> {
    const bp = input.blueprint as Record<string, unknown> | undefined;

    const name = String(bp?.name ?? "Unnamed Game");
    const genre = Array.isArray(bp?.genre)
      ? (bp.genre as string[]).join(", ")
      : String(bp?.genre ?? "Adventure");
    const gameType = String(bp?.game_type ?? "adventure");
    const description = String(bp?.description ?? "");
    const targetAudience = String(bp?.target_audience ?? "general");
    const difficulty = String(bp?.difficulty ?? "medium");

    const fallback: Record<string, unknown> = {
      requirements: {
        functional: [
          `Core gameplay loop for ${genre} ${gameType}`,
          "Player progression system",
          "Win and lose conditions",
          "Multiplayer support",
        ],
        non_functional: {
          performance: "60fps on mid-range devices",
          scalability: `Support for ${bp?.estimated_players ?? "small-group"} players`,
        },
        constraints: [
          "Must run on Roblox platform",
          `Difficulty level: ${difficulty}`,
        ],
        success_criteria: [
          "Player completes the core loop",
          "Positive engagement metric > 5 minutes average session",
        ],
      },
    };

    if (!this.llm) return fallback;

    // PromptTemplateRegistry is the single source of truth; inline is the fallback.
    const registryPrompt = this.buildPrompt({
      name,
      genre,
      game_type: gameType,
      description,
      target_audience: targetAudience,
      difficulty,
    });

    // INTENT-DEFAULT-CONTAMINATION-001. Some of the fields below may be system
    // defaults rather than anything the user chose. Saying so keeps the model
    // from hardening an assumption into a requirement, which is how a project
    // with no stated genre ended up being designed as the default one.
    const assumed = Array.isArray(bp?.assumed_fields)
      ? (bp.assumed_fields as string[])
      : [];
    const assumptionNote =
      assumed.length > 0
        ? `\n\nThe user did not state these fields; the values shown are system ` +
          `defaults, not requirements: ${assumed.join(", ")}. ` +
          `Do not treat them as constraints the user asked for, and do not ` +
          `build the design around them.`
        : "";

    const inlinePrompt =
      "You are a game requirements analyst for Roblox. " +
      "Extract structured functional requirements, constraints, and success criteria. " +
      'Respond with a JSON object only: { "requirements": { "functional": string[], ' +
      '"non_functional": object, "constraints": string[], "success_criteria": string[] } }\n\n' +
      `Name: ${name}\nGenre: ${genre}\nGame Type: ${gameType}\n` +
      `Description: ${description}\nTarget Audience: ${targetAudience}\n` +
      `Difficulty: ${difficulty}${assumptionNote}\n\nReturn only valid JSON.`;

    const prompt = registryPrompt ?? inlinePrompt;

    // generateWithRetry: try → retry with strict prompt → throw on second failure
    return this.generateWithRetry(prompt, ["requirements"], fallback, {
      temperature: 0.3,
      maxTokens: 1200,
    });
  }
}
