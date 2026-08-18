import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import { identifyRequirements } from "../../validation/requirementTraceability";
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

    // INTENT-DEFAULT-CONTAMINATION-001. Values the user never stated, used
    // both to warn the model and to mark derived requirements below.
    const assumed = Array.isArray(bp?.assumed_fields)
      ? (bp.assumed_fields as string[])
      : [];

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

    if (!this.llm) return this.withRequirementIdentity(fallback, assumed, bp);

    // PromptTemplateRegistry is the single source of truth; inline is the fallback.
    const registryPrompt = this.buildPrompt({
      name,
      genre,
      game_type: gameType,
      description,
      target_audience: targetAudience,
      difficulty,
    });

    // INTENT-DEFAULT-CONTAMINATION-001. Saying which values are defaults keeps
    // the model from hardening an assumption into a requirement.
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
    const result = await this.generateWithRetry(
      prompt,
      ["requirements"],
      fallback,
      {
        temperature: 0.3,
        maxTokens: 1200,
      },
    );

    return this.withRequirementIdentity(result, assumed, bp);
  }

  /**
   * INTENT-FIDELITY-001. Attach identity to the requirements this run produced.
   *
   * The existing `requirements` shape is left exactly as it was, because every
   * downstream agent reads it. `requirement_specs` is added alongside, so a
   * requirement can be named and later asked about without changing what any
   * current consumer sees.
   */
  private withRequirementIdentity(
    result: Record<string, unknown>,
    assumedFields: readonly string[],
    blueprint: Record<string, unknown> | undefined,
  ): Record<string, unknown> {
    // A requirement is marked derived when its text echoes a value the system
    // assumed, so the assumed values themselves are what we look for.
    const assumedValues = assumedFields
      .map((field) => blueprint?.[field])
      .flatMap((value) =>
        Array.isArray(value) ? value : value === undefined ? [] : [value],
      )
      .filter((value): value is string => typeof value === "string");

    return {
      ...result,
      requirement_specs: identifyRequirements(
        result.requirements,
        assumedValues,
      ),
    };
  }
}
