import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import type { AgentInput } from "../../types";
import { LLMOutputParser } from "../../ai/outputParser";

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
    properties: {
      requirements: { type: "object" },
    },
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

    // Use PromptTemplateRegistry as single source of truth for prompt content.
    // Falls back to inline prompt only if no template is registered.
    const registryPrompt = this.buildPrompt({
      name,
      genre,
      game_type: gameType,
      description,
      target_audience: targetAudience,
      difficulty,
    });

    const systemPrompt =
      "You are a game requirements analyst for Roblox. " +
      "Extract structured functional requirements, constraints, and success criteria. " +
      "Respond with a single JSON object matching this schema: " +
      '{ "requirements": { "functional": string[], "non_functional": Record<string,string>, ' +
      '"constraints": string[], "success_criteria": string[] } }';

    const userPrompt =
      `Analyze this game concept and extract structured requirements:\n\n` +
      `Name: ${name}\nGenre: ${genre}\nGame Type: ${gameType}\n` +
      `Description: ${description}\nTarget Audience: ${targetAudience}\n` +
      `Difficulty: ${difficulty}\n\nReturn only valid JSON.`;

    const prompt = registryPrompt ?? `${systemPrompt}\n\n${userPrompt}`;

    const raw = await this.llm.generate(prompt, {
      temperature: 0.3,
      maxTokens: 1200,
    });

    return LLMOutputParser.parseAndValidate(
      raw,
      ["requirements"],
      fallback,
      this.name,
    );
