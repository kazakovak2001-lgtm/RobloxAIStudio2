import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import type { AgentInput, GameDesignSeed } from "../../types";

export class GameDesignerAgent extends BaseAgent {
  public readonly name = "GameDesigner";
  public readonly description =
    "Designs game mechanics, systems, and gameplay loop";

  public readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      requirements: { type: "object" },
      plan: { type: "object" },
      blueprint: { type: "object" },
      gameDesignSeed: { type: "object" },
    },
  };

  public readonly outputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      gameplay: { type: "object" },
      loop: { type: "string" },
      winCondition: { type: "string" },
      loseCondition: { type: "string" },
      progressionModel: { type: "string" },
      interactionSystems: { type: "array" },
      economyOrScoring: { type: "string" },
    },
    required: ["gameplay"],
  };

  constructor(config?: Partial<AgentConfig>) {
    super(config);
  }

  protected async process(input: AgentInput): Promise<Record<string, unknown>> {
    const bp = input.blueprint as Record<string, unknown> | undefined;
    const seed = input.gameDesignSeed as GameDesignSeed | undefined;

    const name = String(bp?.name ?? "Unnamed Game");
    const genre = Array.isArray(bp?.genre)
      ? (bp.genre as string[]).join(", ")
      : String(bp?.genre ?? "Adventure");
    const coreLoop = seed?.coreLoop ?? "explore → engage → reward";
    const theme = seed?.theme ?? "fantasy";
    const mechanics =
      seed?.mechanics?.join(", ") ?? "movement, interaction, progression";
    const innovations = seed?.innovationModifiers?.join("; ") ?? "";

    const fallback: Record<string, unknown> = {
      gameplay: {
        mechanics: (
          seed?.mechanics ?? ["exploration", "combat", "progression"]
        ).map((m: string) => ({
          name: m,
          description: `Core mechanic: ${m}`,
          parameters: {},
        })),
        progression: {
          loop: coreLoop,
          player_progression_model:
            "Milestone-based unlocking with escalating difficulty",
          unlocking_system: "Level thresholds",
        },
        balance: {
          winCondition: "Complete the core loop objective",
          loseCondition: "Fail to maintain the progression constraints",
          interactionSystems: seed?.mechanics?.slice(0, 5) ?? [],
          economyOrScoring: "Points earned from successful interactions",
          theme,
        },
      },
      loop: coreLoop,
      winCondition: "Complete the core loop objective",
      loseCondition: "Fail to maintain the progression constraints",
      progressionModel: "Milestone-based unlocking with escalating difficulty",
      interactionSystems: seed?.mechanics?.slice(0, 5) ?? [],
      economyOrScoring: "Points earned from successful interactions",
    };

    if (!this.llm) return fallback;

    const registryPrompt = this.buildPrompt({
      name,
      genre,
      core_loop: coreLoop,
      theme,
      mechanics,
      innovation_modifiers: innovations,
    });

    const inlinePrompt =
      "You are a Roblox game designer. Design detailed gameplay systems. " +
      "Respond with a single JSON object:\n" +
      '{ "gameplay": { "mechanics": Array<{name,description,parameters}>, ' +
      '"progression": {loop,player_progression_model,unlocking_system}, ' +
      '"balance": {winCondition,loseCondition,interactionSystems,economyOrScoring,theme} }, ' +
      '"loop": string, "winCondition": string, "loseCondition": string, ' +
      '"progressionModel": string, "interactionSystems": string[], "economyOrScoring": string }\n\n' +
      `Game Name: ${name}\nGenre: ${genre}\nCore Loop: ${coreLoop}\nTheme: ${theme}\n` +
      `Mechanics: ${mechanics}\n` +
      (innovations ? `Innovation modifiers: ${innovations}\n` : "") +
      "\nReturn only valid JSON.";

    const prompt = registryPrompt ?? inlinePrompt;

    return this.generateWithRetry(prompt, ["gameplay"], fallback, {
      temperature: 0.5,
      maxTokens: 1800,
    });
  }
}
