import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import { summariseForPrompt } from "../../ai/promptValues";
import type { AgentInput, GameDesignSeed } from "../../types";

export class AssetPlannerAgent extends BaseAgent {
  public readonly name = "AssetPlanner";
  public readonly description =
    "Plans 3D models, textures, sounds, and animations";

  public readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      requirements: { type: "object" },
      gameplay: { type: "object" },
      blueprint: { type: "object" },
      gameDesignSeed: { type: "object" },
    },
  };

  public readonly outputSchema: Record<string, unknown> = {
    type: "object",
    properties: { assetPlan: { type: "object" } },
    required: ["assetPlan"],
  };

  constructor(config?: Partial<AgentConfig>) {
    super(config);
  }

  protected async process(input: AgentInput): Promise<Record<string, unknown>> {
    const bp = input.blueprint as Record<string, unknown> | undefined;
    const seed = input.gameDesignSeed as GameDesignSeed | undefined;
    const gameplay = input.gameplay as Record<string, unknown> | undefined;

    const name = String(bp?.name ?? "Unnamed Game");
    const theme = seed?.theme ?? "fantasy";

    const mechanicsArr = (gameplay as any)?.mechanics;
    // SERIALIZATION-001. A mechanic without a name used to stringify to
    // `[object Object]`, telling the model a system existed and nothing about
    // it. Now its content travels instead.
    const systemsSummary = Array.isArray(mechanicsArr)
      ? summariseForPrompt(mechanicsArr.slice(0, 4), "core gameplay")
      : "core gameplay";

    const fallback: Record<string, unknown> = {
      assetPlan: {
        models: [
          {
            id: "model_player",
            name: "PlayerCharacter",
            description: "Main player avatar",
            complexity: "medium",
            source: "builtin",
          },
          {
            id: "model_env_01",
            name: "EnvironmentBase",
            description: "Base world geometry",
            complexity: "simple",
            source: "custom",
          },
          {
            id: "model_prop_01",
            name: "InteractiveProp",
            description: "Core interaction object",
            complexity: "simple",
            source: "marketplace",
          },
        ],
        textures: [
          {
            id: "tex_env_diffuse",
            name: "EnvironmentDiffuse",
            resolution: "1024x1024",
          },
          { id: "tex_ui_atlas", name: "UIAtlas", resolution: "512x512" },
        ],
        sounds: [
          { id: "sfx_interact", name: "InteractSound", type: "sfx" },
          { id: "sfx_ui_click", name: "UIClick", type: "sfx" },
          { id: "music_main", name: "MainTheme", type: "music" },
          { id: "amb_env", name: "EnvironmentAmbient", type: "ambient" },
        ],
        animations: [
          {
            id: "anim_idle",
            name: "PlayerIdle",
            target: "PlayerCharacter",
            frames: 30,
          },
          {
            id: "anim_walk",
            name: "PlayerWalk",
            target: "PlayerCharacter",
            frames: 24,
          },
          {
            id: "anim_interact",
            name: "PlayerInteract",
            target: "PlayerCharacter",
            frames: 15,
          },
        ],
      },
    };

    if (!this.llm) return fallback;

    const registryPrompt = this.buildPrompt({
      name,
      theme,
      locations: "main world area, player spawn",
      systems_summary: systemsSummary,
    });

    const inlinePrompt =
      "You are a Roblox asset planner. " +
      "Respond with a single JSON object:\n" +
      '{ "assetPlan": { ' +
      '"models": Array<{id,name,description,complexity:"simple"|"medium"|"complex",source:"builtin"|"marketplace"|"custom"}>, ' +
      '"textures": Array<{id,name,resolution}>, ' +
      '"sounds": Array<{id,name,type:"sfx"|"music"|"ambient"}>, ' +
      '"animations": Array<{id,name,target,frames}> } }\n\n' +
      `Game: ${name}\nTheme: ${theme}\nGameplay Systems: ${systemsSummary}\n\n` +
      "Plan 3-5 models, 2-4 textures, 3-5 sounds, 2-4 animations. Return only valid JSON.";

    const prompt = registryPrompt ?? inlinePrompt;

    return this.generateWithRetry(prompt, ["assetPlan"], fallback, {
      temperature: 0.4,
      maxTokens: 1500,
    });
  }
}
