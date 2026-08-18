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
      "You are a Roblox Studio technical architect and level designer. Design the client/server architecture, folder structure, data models, and networking strategy, and lay out the physical level the game takes place in. Respond with a JSON object only.",
    user:
      "Design the Roblox technical architecture and the level layout for:\n\nGame: {{name}}\nGame Brief: {{description}}\nGame Type: {{game_type}}\nEstimated Players: {{estimated_players}}\nKey Gameplay Systems: {{systems_summary}}\n\n" +
      'Respond with: { "architecture": object, "roblox_architect": object, "spatialDesign": { "map": {id,name,type,size:{x,y,z},theme}, "zones": Array<{id,name,type,bounds:{minX,minZ,maxX,maxZ},groundHeight?}>, "spawns": Array<{id,name,type,position:{x,y,z}}>, "terrain": Array<{id,shape,material,position:{x,y,z},size:{x,y,z}}>, "objects": Array<{id,name,objectType,position:{x,y,z},size?:{x,y,z},orientation?:{x,y,z},material?,zoneId?}>, "paths": Array<{id,fromZoneId,toZoneId,width?}> } }\n\n' +
      "Level layout rules:\n" +
      "- Derive the whole layout from the Game Brief. Choose a theme, scale and object set that fit what was asked for.\n" +
      "- map.type is one of: main, lobby, arena, dungeon, stage.\n" +
      "- zones[].type is one of: safe, combat, puzzle, exploration, transition.\n" +
      '- spawns[].type is one of: initial, checkpoint, respawn, team. State at least one "initial" spawn, standing clear of obstacles.\n' +
      '- objects[].objectType is one of: terrain, structure, decoration, interactive, barrier. Anything the player collects or activates is "interactive".\n' +
      '- terrain[].shape is one of: block, ball, cylinder. For "ball", size.x is the radius.\n' +
      "- terrain[].material is one of: Grass, Sand, Rock, Slate, Ground, Mud, Snow, Ice, Water, Sandstone, Basalt, Limestone, Asphalt, LeafyGrass, CrackedLava, Salt, Glacier.\n" +
      "- Use terrain regions for landscape and elevation, and objects for anything placed on it.\n" +
      "- Give every object a position that sits on or above the ground beneath it. Vary elevation where the brief calls for it.\n" +
      "- paths[] must connect zone ids you actually defined, so every area is reachable.\n" +
      "- All coordinates and extents are in studs, finite, and within 20000 of the origin.\n" +
      "- Every id must be unique within its own array.",
    variables: [
      "name",
      "description",
      "game_type",
      "estimated_players",
      "systems_summary",
    ],
  },
  {
    id: "tpl-lua-generator",
    agentType: "lua_generator",
    system:
      "You are a Roblox Luau developer producing a playable vertical slice for a blank Baseplate. The server script owns the runtime world: it builds the terrain and every instance the level needs before play begins. Generate executable server/client Scripts plus shared modules. The server must create a visible world and connect an interactive objective; the client must create a visible HUD. Never use TODOs or placeholder implementations. Respond with one JSON object only.",
    user:
      "Generate the runnable game for:\n\nGame: {{name}}\nGame Brief: {{description}}\nArchitecture: {{architecture_summary}}\nGameplay Systems: {{systems_summary}}\nCoding Standards: {{coding_standards}}\n\nLevel to build:\n{{spatial_design}}\n\n" +
      "World-building rules:\n" +
      "- Build exactly the level described above. Use its coordinates, extents, orientations and materials; do not invent a different layout and do not omit parts of it.\n" +
      "- If the level section is empty, design a small coherent layout yourself from the Game Brief.\n" +
      "- Build terrain with the voxel API on the Terrain service: workspace.Terrain:FillBlock(CFrame.new(x, y, z), Vector3.new(sx, sy, sz), Enum.Material.NAME) for block regions, workspace.Terrain:FillBall(Vector3.new(x, y, z), radius, Enum.Material.NAME) for ball regions, and workspace.Terrain:FillCylinder(CFrame.new(x, y, z), height, radius, Enum.Material.NAME) for cylinder regions.\n" +
      "- Call workspace.Terrain:Clear() once before filling, so replay does not stack terrain.\n" +
      "- Create a SpawnLocation at each stated spawn and parent it to workspace, so the player starts in the level rather than falling.\n" +
      "- Create each object as a Part or Model, set Size, CFrame (position and orientation), Material and Anchored = true, and parent it under a named Folder in workspace.\n" +
      "- Build traversal structures named by the level (platforms, bridges, paths) as anchored geometry the player can actually walk on.\n" +
      "- Objects of type `interactive` are the gameplay objects: wire the objective to those, not to a separate part invented for the purpose.\n" +
      "Script ownership rules:\n" +
      "- Emit exactly one server entry and exactly one client entry. Do not split the playable slice across several server or client Scripts.\n" +
      "- That single server Script owns all of it: terrain and world instance creation, the objective and gameplay logic, and the progress RemoteEvent it creates and fires.\n" +
      "- That single client LocalScript owns all of it: HUD creation, progress subscription, and the visible HUD update.\n" +
      "- The server must create the progress RemoteEvent under ReplicatedStorage and actually emit progress through it, using FireClient(player, ...) for one player or FireAllClients(...) for everyone.\n" +
      '- The client must build the HUD first: create a ScreenGui with Instance.new("ScreenGui") and parent it to Players.LocalPlayer:WaitForChild("PlayerGui").\n' +
      "- Every visible HUD element, such as a TextLabel showing progress, must be created as a child of that ScreenGui. Never parent a visible element directly to PlayerGui.\n" +
      "- Size and position GUI elements with UDim2.new(...). Never use Vector2 for GUI size or position.\n" +
      "- Build the complete initial HUD before calling event.OnClientEvent:Connect(...), so it is visible immediately when Play starts.\n" +
      "- Inside the OnClientEvent handler, only update HUD elements that already exist. Never create the HUD inside the event callback.\n" +
      "- Shared entries are optional. Never put world creation, objective logic, or HUD code in them.\n" +
      "- Execution side matters. The server Script may create and own the RemoteEvent and may call FireClient(player, ...) or FireAllClients(...). The server must never reference Players.LocalPlayer and must never subscribe with OnClientEvent.\n" +
      "- The client LocalScript may use Players.LocalPlayer and must subscribe with event.OnClientEvent:Connect(...). The client must never call FireClient or FireAllClients.\n" +
      "- The server must implement a real player interaction that drives the objective, connected to the level's interactive objects. Use whichever genuine Roblox mechanism suits the game: part.Touched, ProximityPrompt.Triggered, ClickDetector.MouseClick, Tool.Activated, or another real interaction event.\n" +
      "- Use only real Roblox APIs: workspace.Terrain, Terrain:FillBlock / FillBall / FillCylinder / Clear, Instance.new, SpawnLocation, Anchored, CFrame, Position, Size, Enum.Material, and game:GetService for real services only. Never invent a service or a convenience method such as CreateObject, CreateTerrain, CreateZone or CreateSpawnLocation.\n",
    variables: [
      "name",
      "description",
      "architecture_summary",
      "systems_summary",
      "coding_standards",
      "spatial_design",
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
    user:
      "Plan assets for:\n\nGame: {{name}}\nTheme: {{theme}}\nKey Locations: {{locations}}\nGameplay Systems: {{systems_summary}}\n\n" +
      'Respond with: { "assetPlan": { "models": Array<{id, name, description, complexity: "simple"|"medium"|"complex", source: "builtin"|"marketplace"|"custom"}>, "textures": Array<{id, name, resolution}>, "sounds": Array<{id, name, type: "sfx"|"music"|"ambient"}>, "animations": Array<{id, name, target, frames}> } }\n\nEvery entry needs a unique id. An animation target must be the exact name of a planned model.',
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
