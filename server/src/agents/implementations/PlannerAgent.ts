import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import type { AgentInput, GameDesignSeed } from "../../types";

export class PlannerAgent extends BaseAgent {
  public readonly name = "Planner";
  public readonly description =
    "Creates a phased development plan from requirements";

  public readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      requirements: { type: "object" },
      blueprint: { type: "object" },
      gameDesignSeed: { type: "object" },
    },
  };

  public readonly outputSchema: Record<string, unknown> = {
    type: "object",
    properties: { plan: { type: "object" } },
    required: ["plan"],
  };

  constructor(config?: Partial<AgentConfig>) {
    super(config);
  }

  protected async process(input: AgentInput): Promise<Record<string, unknown>> {
    const bp = input.blueprint as Record<string, unknown> | undefined;
    const req = input.requirements as Record<string, unknown> | undefined;
    const seed = input.gameDesignSeed as GameDesignSeed | undefined;

    const name = String(bp?.name ?? "Unnamed Game");
    const coreLoop = seed?.coreLoop ?? "explore → engage → reward";
    const reqSummary = req
      ? JSON.stringify(req).slice(0, 400)
      : "Core gameplay requirements";

    const fallback: Record<string, unknown> = {
      plan: {
        phases: [
          {
            name: "Foundation",
            tasks: [
              "Setup project structure",
              "Define data models",
              "Core loop prototype",
            ],
            duration: "1 week",
          },
          {
            name: "Core Systems",
            tasks: [
              "Implement gameplay mechanics",
              "Build UI",
              "Server-client architecture",
            ],
            duration: "2 weeks",
          },
          {
            name: "Polish & Testing",
            tasks: ["Bug fixes", "Performance tuning", "Playtesting"],
            duration: "1 week",
          },
        ],
        timeline: "4 weeks total",
        milestones: [
          "Playable prototype",
          "Feature-complete build",
          "Release candidate",
        ],
      },
    };

    if (!this.llm) return fallback;

    const registryPrompt = this.buildPrompt({
      name,
      requirements_summary: reqSummary,
      core_loop: coreLoop,
    });

    const inlinePrompt =
      "You are a Roblox game project planner. " +
      'Respond with a JSON object: { "plan": { "phases": Array<{name,tasks,duration}>, ' +
      '"timeline": string, "milestones": string[] } }\n\n' +
      `Game: ${name}\nCore Loop: ${coreLoop}\nRequirements: ${reqSummary}\n\nReturn only valid JSON.`;

    const prompt = registryPrompt ?? inlinePrompt;

    return this.generateWithRetry(prompt, ["plan"], fallback, {
      temperature: 0.3,
      maxTokens: 1000,
    });
  }
}
