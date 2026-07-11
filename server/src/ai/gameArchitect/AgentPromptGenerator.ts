/**
 * AgentPromptGenerator — Creates optimized prompts for specialized AI development agents.
 */

import type {
  GameIdeaInput,
  GameAnalysis,
  GameDesignDocument,
  GameArchitecturePlan,
  AgentPrompt,
  AgentPromptPackage,
} from "./GameArchitectTypes";

export class AgentPromptGenerator {
  /**
   * Generate a complete prompt package for all required agents.
   */
  generate(
    input: GameIdeaInput,
    analysis: GameAnalysis,
    design: GameDesignDocument,
    architecture: GameArchitecturePlan,
  ): AgentPromptPackage {
    const prompts: AgentPrompt[] = [
      this.worldBuilderPrompt(input, analysis, design),
      this.gameplayDeveloperPrompt(input, analysis, design, architecture),
      this.programmerPrompt(analysis, design, architecture),
      this.artDirectorPrompt(input, analysis, design),
      this.uiUxPrompt(input, analysis, design),
      this.economyDesignerPrompt(input, analysis, design),
      this.qaTesterPrompt(analysis, design, architecture),
    ];

    return {
      projectTitle: input.title ?? "Untitled Roblox Game",
      generatedAt: Date.now(),
      prompts,
      totalAgents: prompts.length,
    };
  }

  private worldBuilderPrompt(
    input: GameIdeaInput,
    analysis: GameAnalysis,
    design: GameDesignDocument,
  ): AgentPrompt {
    return {
      agentId: "world_builder",
      agentName: "World Builder Agent",
      objective: `Create the complete world environment for a ${analysis.genre} game: "${input.title ?? input.description.slice(0, 40)}"`,
      responsibilities: [
        "Design terrain layout and biome distribution",
        "Plan lighting and atmosphere settings",
        "Define environment props and decorations",
        "Create spawn points and player flow paths",
        "Design area transitions and loading zones",
        "Plan weather and time-of-day systems",
      ],
      technicalRequirements: [
        "Use StreamingEnabled-compatible chunk sizes",
        "Keep part count under 50,000 per visible area",
        "Design for mobile performance (simple geometry)",
        "Use Terrain for large natural landscapes",
        "Implement LOD zones for distant rendering",
      ],
      expectedOutput: [
        "World layout blueprint (zones, connections, scale)",
        "Biome specifications (terrain, lighting, audio)",
        "Prop placement guide per zone",
        "Spawn and teleport point definitions",
        "Performance budget per area",
      ],
      validationRules: [
        "All zones must be reachable from spawn",
        "No zone exceeds 30,000 parts",
        "Lighting must be consistent within biomes",
        "Player flow must support the core gameplay loop",
      ],
      context: `World design: ${design.worldDesign}\nGameplay loop: ${design.coreLoop}`,
    };
  }

  private gameplayDeveloperPrompt(
    input: GameIdeaInput,
    analysis: GameAnalysis,
    design: GameDesignDocument,
    architecture: GameArchitecturePlan,
  ): AgentPrompt {
    return {
      agentId: "gameplay_developer",
      agentName: "Gameplay Developer Agent",
      objective: `Implement core gameplay systems for "${input.title ?? input.description.slice(0, 40)}" — a ${analysis.genre} experience`,
      responsibilities: [
        "Implement the core gameplay loop",
        "Build progression and reward systems",
        "Create player interaction mechanics",
        "Implement difficulty scaling",
        `Build required systems: ${analysis.requiredSystems.slice(0, 5).join(", ")}`,
        "Handle game state transitions",
      ],
      technicalRequirements: [
        "Server-authoritative game logic",
        "Client prediction for responsiveness",
        `Use ModuleScripts: ${architecture.moduleScripts.slice(0, 3).join(", ")}`,
        "Event-driven architecture with EventBus",
        "Type-safe Luau with strict mode",
      ],
      expectedOutput: [
        "Core loop implementation (ServerScript)",
        "Player progression module",
        "Gameplay system modules",
        "Configuration values and tuning data",
        "Integration points with other systems",
      ],
      validationRules: [
        "All game logic runs on server",
        "No exploitable client-side state",
        "Progression saves correctly to DataStore",
        "Core loop completes in under 100ms server time",
      ],
      context: `Core loop: ${design.coreLoop}\nProgression: ${design.progressionSystem}\nSystems: ${analysis.requiredSystems.join(", ")}`,
    };
  }

  private programmerPrompt(
    _analysis: GameAnalysis,
    design: GameDesignDocument,
    architecture: GameArchitecturePlan,
  ): AgentPrompt {
    return {
      agentId: "programmer",
      agentName: "Luau Programmer Agent",
      objective:
        "Implement server/client Luau architecture with modular, maintainable code",
      responsibilities: [
        "Write server-side game scripts",
        "Write client-side controllers",
        "Implement RemoteEvent communication",
        "Build DataStore persistence layer",
        "Create shared module libraries",
        "Implement error handling and logging",
      ],
      technicalRequirements: [
        "Luau strict mode enabled",
        "Server-authoritative pattern",
        `Server scripts: ${architecture.serverArchitecture.slice(0, 4).join("; ")}`,
        `Client scripts: ${architecture.clientArchitecture.slice(0, 3).join("; ")}`,
        `Remote events: ${architecture.remoteEvents.slice(0, 3).join("; ")}`,
        "DataStore with retry logic and session locking",
      ],
      expectedOutput: [
        "ServerScriptService scripts",
        "StarterPlayerScripts",
        "ReplicatedStorage modules",
        "RemoteEvent/Function definitions",
        "DataStore schema and operations",
      ],
      validationRules: [
        "No deprecated API usage",
        "All scripts pass Luau type checking",
        "No infinite loops or memory leaks",
        "DataStore operations have error handling",
        "RemoteEvents validate all payloads",
      ],
      context: `Architecture: ${design.technicalArchitecture}\nSecurity: ${architecture.securityConsiderations.join("; ")}`,
    };
  }

  private artDirectorPrompt(
    input: GameIdeaInput,
    analysis: GameAnalysis,
    design: GameDesignDocument,
  ): AgentPrompt {
    return {
      agentId: "art_director",
      agentName: "Art Direction Agent",
      objective: `Define visual identity and asset requirements for a ${analysis.genre} game with ${input.visualStyle ?? "stylized"} aesthetics`,
      responsibilities: [
        "Define color palette and visual language",
        "Specify asset style guide",
        "Plan material and texture approach",
        "Design character visual identity",
        "Define animation requirements",
        "Plan particle effects and VFX",
      ],
      technicalRequirements: [
        "Mobile-friendly polygon budgets",
        "Roblox material system compatible",
        "Maximum texture resolution: 1024x1024",
        "Consistent scale (1 stud = 0.28m)",
        "Optimized mesh geometry",
      ],
      expectedOutput: [
        "Visual style guide document",
        "Color palette (primary, secondary, accent)",
        "Asset list with poly budgets",
        "Material specifications",
        "Animation list with priorities",
        "VFX specifications",
      ],
      validationRules: [
        "Assets must render on mobile at 60 FPS",
        "Visual style must be consistent across all assets",
        "Color palette must meet accessibility contrast ratios",
        "No copyrighted references",
      ],
      context: `Visual style: ${input.visualStyle ?? "stylized"}\nWorld: ${design.worldDesign}\nTheme: ${input.theme ?? analysis.genre}`,
    };
  }

  private uiUxPrompt(
    input: GameIdeaInput,
    _analysis: GameAnalysis,
    design: GameDesignDocument,
  ): AgentPrompt {
    return {
      agentId: "ui_ux",
      agentName: "UI/UX Design Agent",
      objective: "Design complete user interface and player experience flow",
      responsibilities: [
        "Design all game screens and menus",
        "Create HUD layout for gameplay",
        "Plan navigation flow between screens",
        "Design interactive elements and feedback",
        "Ensure mobile-first responsive layout",
        "Plan accessibility features",
      ],
      technicalRequirements: [
        "Roblox ScreenGui/BillboardGui system",
        "Responsive: works on mobile, tablet, desktop",
        "Touch-friendly tap targets (44px minimum)",
        "Maximum 3 levels of navigation depth",
        "Support for gamepad navigation",
      ],
      expectedOutput: [
        "Screen inventory (all UI screens)",
        "HUD layout specification",
        "Navigation flow diagram",
        "Component library definitions",
        "Interaction patterns and animations",
        "Responsive breakpoint rules",
      ],
      validationRules: [
        "All screens accessible within 2 taps from main",
        "HUD does not obscure more than 15% of viewport",
        "Text is readable at minimum device resolution",
        "All interactive elements have visual feedback",
      ],
      context: `UI/UX direction: ${design.uiUxDirection}\nTarget audience: ${input.targetAudience ?? "all ages"}\nPlatform: Mobile-first`,
    };
  }

  private economyDesignerPrompt(
    input: GameIdeaInput,
    _analysis: GameAnalysis,
    design: GameDesignDocument,
  ): AgentPrompt {
    return {
      agentId: "economy_designer",
      agentName: "Economy Design Agent",
      objective:
        "Design balanced in-game economy with sustainable monetization",
      responsibilities: [
        "Design currency systems and earn rates",
        "Balance reward distribution",
        "Plan progression-gated purchases",
        "Design monetization without pay-to-win",
        "Create sink/faucet balance model",
        "Plan pricing tiers for game passes",
      ],
      technicalRequirements: [
        "All transactions server-validated",
        "Robux pricing follows Roblox guidelines",
        "Economy must not inflate over 30-day period",
        "Free players must have viable progression path",
        "Premium benefits are time-saving, not power-gaining",
      ],
      expectedOutput: [
        "Currency definitions and earn rates",
        "Price table for all purchasable items",
        "Game pass definitions and pricing",
        "Developer product catalog",
        "Economy simulation (30-day projection)",
        "Anti-inflation mechanisms",
      ],
      validationRules: [
        "Free player can reach endgame (slower pace)",
        "No item costs more than 7 days of active play",
        "Game passes priced between 49-999 Robux",
        "No loot boxes or gambling mechanics for young audience",
      ],
      context: `Economy: ${design.economyDesign}\nMonetization goals: ${input.monetizationGoals?.join(", ") ?? "game passes, cosmetics"}`,
    };
  }

  private qaTesterPrompt(
    analysis: GameAnalysis,
    design: GameDesignDocument,
    architecture: GameArchitecturePlan,
  ): AgentPrompt {
    return {
      agentId: "qa_tester",
      agentName: "QA & Testing Agent",
      objective:
        "Validate all game systems, find bugs, and ensure production quality",
      responsibilities: [
        "Test core gameplay loop end-to-end",
        "Validate server-client synchronization",
        "Test edge cases and error handling",
        "Verify performance on target devices",
        "Test multiplayer race conditions",
        "Validate DataStore persistence",
      ],
      technicalRequirements: [
        "Test on mobile (lowest target device)",
        "Verify server memory stays under 512MB",
        "Confirm 60 FPS on mid-range mobile",
        "Test with maximum concurrent players",
        "Verify all RemoteEvents handle invalid data",
      ],
      expectedOutput: [
        "Test plan document",
        "Bug report list with severity",
        "Performance benchmark results",
        "Security vulnerability assessment",
        "Recommended fixes prioritized by impact",
        "Go/No-Go recommendation",
      ],
      validationRules: [
        "Zero critical bugs for launch",
        "Server does not crash under load",
        "No data loss on player disconnect",
        "All exploits documented and mitigated",
      ],
      context: `Systems to test: ${analysis.requiredSystems.join(", ")}\nArchitecture: ${architecture.serverArchitecture.slice(0, 3).join("; ")}\nPerformance: ${design.performanceStrategy}`,
    };
  }
}
