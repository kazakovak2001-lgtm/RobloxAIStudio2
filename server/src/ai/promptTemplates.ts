import type { PromptTemplate } from "../types/ai";

/**
 * PromptTemplateRegistry
 *
 * Stores and resolves prompt templates keyed by agent type.
 * Provides variable interpolation so templates reference dynamic values
 * (e.g. blueprint name, genre, seed-derived mechanics) at generation time.
 *
 * This is the interface boundary for the LLM wiring milestone (v0.3).
 * Agents call `registry.render(agentType, vars)` to obtain the final prompt
 * string before invoking `this.llm.generate()`.
 */
export class PromptTemplateRegistry {
  private templates = new Map<string, PromptTemplate>();

  /**
   * Register a prompt template for an agent type.
   * If a template for that agent type already exists it is replaced.
   */
  register(template: PromptTemplate): void {
    this.templates.set(template.agentType, template);
  }

  /**
   * Retrieve the raw template for an agent type, or undefined if none is registered.
   */
  get(agentType: string): PromptTemplate | undefined {
    return this.templates.get(agentType);
  }

  /**
   * Render the user prompt for an agent type with the provided variable values.
   *
   * Variable substitution uses `{{variableName}}` syntax in the template's
   * `user` string. Missing variables are left as-is so callers can detect them.
   */
  render(agentType: string, vars: Record<string, string>): string | null {
    const template = this.templates.get(agentType);
    if (!template) return null;

    let rendered = template.user;
    for (const [key, value] of Object.entries(vars)) {
      rendered = rendered.split(`{{${key}}}`).join(value);
    }
    return rendered;
  }

  /**
   * Render the system prompt for an agent type with variable substitution.
   * Returns the raw system string if no variables are needed.
   */
  renderSystem(
    agentType: string,
    vars: Record<string, string> = {},
  ): string | null {
    const template = this.templates.get(agentType);
    if (!template) return null;

    let rendered = template.system;
    for (const [key, value] of Object.entries(vars)) {
      rendered = rendered.split(`{{${key}}}`).join(value);
    }
    return rendered;
  }

  /**
   * Check whether a template is registered for the given agent type.
   */
  has(agentType: string): boolean {
    return this.templates.has(agentType);
  }

  /**
   * List all registered agent types.
   */
  registeredAgentTypes(): string[] {
    return Array.from(this.templates.keys());
  }

  /**
   * Return all declared variable names for an agent type's template.
   */
  variablesFor(agentType: string): string[] {
    return this.templates.get(agentType)?.variables ?? [];
  }
}

/**
 * Default prompt templates for the core generation pipeline.
 *
 * Each template documents the expected variables so the LLM wiring milestone
 * (v0.3) can populate them from blueprint / GameDesignSeed fields.
 *
 * System prompts are intentionally concise — they establish the agent's role
 * and output contract. User prompts carry the generation context.
 */
export const DEFAULT_TEMPLATES: PromptTemplate[] = [
  {
    id: "tpl-requirements",
    agentType: "requirements",
    system:
      "You are a game requirements analyst for Roblox. Extract structured functional requirements, constraints, and success criteria from the provided game concept. Respond with a JSON object only.",
    user: "Analyze this game concept and produce structured requirements:\n\nName: {{name}}\nGenre: {{genre}}\nGame Type: {{game_type}}\nDescription: {{description}}\nTarget Audience: {{target_audience}}\nDifficulty: {{difficulty}}",
    variables: [
      "name",
      "genre",
      "game_type",
      "description",
      "target_audience",
      "difficulty",
    ],
  },
  {
    id: "tpl-planner",
    agentType: "planner",
    system:
      "You are a Roblox game project planner. Given requirements, produce a phased development plan with milestones and task breakdowns. Respond with a JSON object only.",
    user: "Create a development plan for:\n\nGame: {{name}}\nCore Requirements: {{requirements_summary}}\nCore Loop: {{core_loop}}",
    variables: ["name", "requirements_summary", "core_loop"],
  },
  {
    id: "tpl-game-designer",
    agentType: "game_designer",
    system:
      "You are a Roblox game designer specializing in gameplay systems. Design mechanics, progression, win/lose conditions, and economy. Respond with a JSON object only.",
    user: "Design the gameplay systems for:\n\nName: {{name}}\nGenre: {{genre}}\nCore Loop: {{core_loop}}\nTheme: {{theme}}\nMechanics Pool: {{mechanics}}\nInnovation Modifiers: {{innovation_modifiers}}",
    variables: [
      "name",
      "genre",
      "core_loop",
      "theme",
      "mechanics",
      "innovation_modifiers",
    ],
  },
  {
    id: "tpl-roblox-architect",
    agentType: "roblox_architect",
    system:
      "You are a Roblox Studio technical architect. Design the client/server architecture, folder structure, data models, and networking strategy. Respond with a JSON object only.",
    user: "Design the Roblox technical architecture for:\n\nGame: {{name}}\nGame Type: {{game_type}}\nEstimated Players: {{estimated_players}}\nKey Gameplay Systems: {{systems_summary}}",
    variables: ["name", "game_type", "estimated_players", "systems_summary"],
  },
  {
    id: "tpl-lua-generator",
    agentType: "lua_generator",
    system:
      "You are a Roblox Luau developer producing a playable vertical slice for a blank Baseplate. Generate executable server/client Scripts plus shared modules. The server must create a visible world and connect an interactive objective; the client must create a visible HUD. Never use TODOs or placeholder implementations. Respond with one JSON object only.",
    user: "Generate the runnable game for:\n\nGame: {{name}}\nGame Brief: {{description}}\nArchitecture: {{architecture_summary}}\nGameplay Systems: {{systems_summary}}\nCoding Standards: {{coding_standards}}",
    variables: [
      "name",
      "description",
      "architecture_summary",
      "systems_summary",
      "coding_standards",
    ],
  },
  {
    id: "tpl-ui-generator",
    agentType: "ui_generator",
    system:
      "You are a Roblox UI/UX designer. Define screen layouts, HUD elements, and menu structures appropriate for the game. Respond with a JSON array of UI layout objects only.",
    user: "Design UI layouts for:\n\nGame: {{name}}\nGame Type: {{game_type}}\nKey Features: {{key_features}}\nTheme: {{theme}}",
    variables: ["name", "game_type", "key_features", "theme"],
  },
  {
    id: "tpl-asset-planner",
    agentType: "asset_planner",
    system:
      "You are a Roblox asset planner. List all required 3D models, textures, sounds, and animations with their properties. Respond with a JSON object only.",
    user: "Plan assets for:\n\nGame: {{name}}\nTheme: {{theme}}\nKey Locations: {{locations}}\nGameplay Systems: {{systems_summary}}",
    variables: ["name", "theme", "locations", "systems_summary"],
  },
  {
    id: "tpl-orchestrator",
    agentType: "orchestrator",
    system:
      "You are the final quality-control stage of a Roblox game generation pipeline. Synthesize all prior agent outputs into a cohesive world definition and gameplay system summary. Respond with a JSON object only.",
    user: "Synthesize the complete game definition for:\n\nName: {{name}}\nDescription: {{description}}\nSystems Built: {{systems_built}}\nCode Modules: {{modules_built}}",
    variables: ["name", "description", "systems_built", "modules_built"],
  },
];

/**
 * Build and return a PromptTemplateRegistry pre-loaded with default templates.
 */
export function createDefaultPromptTemplateRegistry(): PromptTemplateRegistry {
  const registry = new PromptTemplateRegistry();
  for (const template of DEFAULT_TEMPLATES) {
    registry.register(template);
  }
  return registry;
}
