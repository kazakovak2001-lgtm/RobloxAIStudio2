import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import type { AgentInput, GameDesignSeed } from "../../types";

export class UIGeneratorAgent extends BaseAgent {
  public readonly name = "UIGenerator";
  public readonly description =
    "Generates Roblox UI screen layouts and HUD definitions";

  public readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      gameplay: { type: "object" },
      blueprint: { type: "object" },
      gameDesignSeed: { type: "object" },
    },
  };

  public readonly outputSchema: Record<string, unknown> = {
    type: "object",
    properties: { uiDesign: { type: "object" } },
    required: ["uiDesign"],
  };

  constructor(config?: Partial<AgentConfig>) {
    super(config);
  }

  protected async process(input: AgentInput): Promise<Record<string, unknown>> {
    const bp = input.blueprint as Record<string, unknown> | undefined;
    const seed = input.gameDesignSeed as GameDesignSeed | undefined;
    const gameplay = input.gameplay as Record<string, unknown> | undefined;

    const name = String(bp?.name ?? "Unnamed Game");
    const gameType = String(bp?.game_type ?? "adventure");
    const theme = seed?.theme ?? "fantasy";

    const mechanicsArr = (gameplay as any)?.mechanics;
    const keyFeatures = Array.isArray(mechanicsArr)
      ? mechanicsArr
          .slice(0, 4)
          .map((m: any) => String(m?.name ?? m))
          .join(", ")
      : "core gameplay";

    const fallback: Record<string, unknown> = {
      uiDesign: {
        screens: [
          {
            name: "MainHUD",
            type: "hud",
            elements: [
              { id: "health_bar", type: "ProgressBar", label: "Health" },
              { id: "score_display", type: "TextLabel", label: "Score: 0" },
            ],
          },
          {
            name: "MainMenu",
            type: "menu",
            elements: [
              { id: "play_btn", type: "TextButton", label: "Play" },
              { id: "settings_btn", type: "TextButton", label: "Settings" },
            ],
          },
          {
            name: "PauseMenu",
            type: "dialog",
            elements: [
              { id: "resume_btn", type: "TextButton", label: "Resume" },
              { id: "quit_btn", type: "TextButton", label: "Quit" },
            ],
          },
        ],
        components: { theme, primaryColor: "#1a1a2e", accentColor: "#e94560" },
      },
    };

    if (!this.llm) return fallback;

    const registryPrompt = this.buildPrompt({
      name,
      game_type: gameType,
      key_features: keyFeatures,
      theme,
    });

    const inlinePrompt =
      "You are a Roblox UI/UX designer. " +
      "Respond with a single JSON object:\n" +
      '{ "uiDesign": { "screens": Array<{name,type,elements:Array<{id,type,label}>}>, ' +
      '"components": {theme,primaryColor,accentColor} } }\n\n' +
      `Game: ${name}\nGame Type: ${gameType}\nTheme: ${theme}\nKey Features: ${keyFeatures}\n\n` +
      "Include Main HUD, Main Menu, Pause Menu. Return only valid JSON.";

    const prompt = registryPrompt ?? inlinePrompt;

    return this.generateWithRetry(prompt, ["uiDesign"], fallback, {
      temperature: 0.4,
      maxTokens: 1500,
    });
  }
}
