/**
 * GameDesignGenerator — Generates a professional Game Design Document from analysis.
 */

import type {
  GameIdeaInput,
  GameAnalysis,
  GameDesignDocument,
} from "./GameArchitectTypes";

export class GameDesignGenerator {
  /**
   * Generate a complete game design document.
   */
  generate(input: GameIdeaInput, analysis: GameAnalysis): GameDesignDocument {
    return {
      gameVision: this.generateVision(input, analysis),
      coreLoop: this.generateCoreLoop(analysis),
      targetPlayer: this.generateTargetPlayer(input, analysis),
      worldDesign: this.generateWorldDesign(input, analysis),
      characters: this.generateCharacters(input, analysis),
      progressionSystem: this.generateProgression(analysis),
      economyDesign: this.generateEconomy(input, analysis),
      multiplayerDesign: this.generateMultiplayer(input, analysis),
      uiUxDirection: this.generateUiUx(input, analysis),
      technicalArchitecture: this.generateTechArchitecture(analysis),
      performanceStrategy: this.generatePerformanceStrategy(analysis),
    };
  }

  private generateVision(input: GameIdeaInput, analysis: GameAnalysis): string {
    const title = input.title ?? "Untitled Project";
    return (
      `${title} is a ${analysis.genre} experience on Roblox targeting ${input.targetAudience ?? "all ages"}. ` +
      `The game delivers ${analysis.playerMotivation.slice(0, 2).join(" and ")} through ${analysis.gameplayLoop.toLowerCase()}. ` +
      `Players will experience a ${input.theme ?? analysis.genre}-themed world with ${input.visualStyle ?? "stylized"} visuals.`
    );
  }

  private generateCoreLoop(analysis: GameAnalysis): string {
    return (
      `Primary Loop: ${analysis.gameplayLoop}\n\n` +
      `Session Structure:\n` +
      `- Short session (5-15 min): Complete one cycle of the core loop\n` +
      `- Medium session (15-45 min): Progress through multiple cycles with meaningful advancement\n` +
      `- Long session (45+ min): Deep engagement with systems, social interaction, and mastery\n\n` +
      `Retention hooks: ${analysis.playerMotivation.join(", ")}`
    );
  }

  private generateTargetPlayer(
    input: GameIdeaInput,
    analysis: GameAnalysis,
  ): string {
    const audience = input.targetAudience ?? "casual players ages 9-16";
    return (
      `Primary audience: ${audience}\n` +
      `Player motivations: ${analysis.playerMotivation.join(", ")}\n` +
      `Session length expectation: 15-30 minutes average\n` +
      `Skill level: Beginner-friendly with depth for experienced players\n` +
      `Social preference: ${input.multiplayerType ?? "optional co-op"}`
    );
  }

  private generateWorldDesign(
    input: GameIdeaInput,
    analysis: GameAnalysis,
  ): string {
    const theme = input.theme ?? analysis.genre;
    return (
      `Theme: ${theme}\n` +
      `Visual style: ${input.visualStyle ?? "Stylized low-poly with vibrant colors"}\n` +
      `World structure: Hub-based with unlockable zones\n` +
      `Environment variety: 4-6 distinct biomes/areas\n` +
      `Scale: Medium (supports ${input.multiplayerType === "mmo" ? "50+" : "10-20"} concurrent players per server)\n` +
      `Atmosphere: Matches ${theme} theme with dynamic lighting and particle effects`
    );
  }

  private generateCharacters(
    _input: GameIdeaInput,
    analysis: GameAnalysis,
  ): string {
    const hasNpcs = analysis.requiredSystems.some((s) => s.includes("NPC"));
    if (!hasNpcs) {
      return `Player avatar customization with unlockable cosmetics.\nNo NPC characters required for this game type.`;
    }
    return (
      `Player Characters:\n- Fully customizable avatar\n- Class/role selection (if applicable)\n- Progression-based visual upgrades\n\n` +
      `NPCs:\n- Quest givers with dialogue trees\n- Merchants for trading\n- Environmental characters for atmosphere\n- Boss/enemy characters with unique behaviors`
    );
  }

  private generateProgression(analysis: GameAnalysis): string {
    return (
      `Model: ${analysis.progressionSystem}\n\n` +
      `Progression layers:\n` +
      `1. Short-term: Per-session rewards and immediate feedback\n` +
      `2. Medium-term: Unlockables, upgrades, and area progression\n` +
      `3. Long-term: Prestige systems, rare collectibles, and mastery badges\n\n` +
      `Difficulty: ${analysis.difficultyModel}`
    );
  }

  private generateEconomy(
    input: GameIdeaInput,
    analysis: GameAnalysis,
  ): string {
    const hasMoney = analysis.requiredSystems.some(
      (s) => s.includes("money") || s.includes("currency"),
    );
    const monetization =
      input.monetizationGoals?.join(", ") ?? "game passes and cosmetic items";
    return (
      `In-game economy:\n` +
      `- Primary currency: Earned through gameplay\n` +
      `- Premium currency: Optional (Robux-based)\n` +
      (hasMoney ? `- Trading system between players\n` : "") +
      `\nMonetization: ${monetization}\n` +
      `- Game passes for permanent upgrades\n` +
      `- Developer products for consumables\n` +
      `- Premium benefits (non-pay-to-win)`
    );
  }

  private generateMultiplayer(
    input: GameIdeaInput,
    _analysis: GameAnalysis,
  ): string {
    const type = input.multiplayerType ?? "cooperative";
    return (
      `Multiplayer type: ${type}\n` +
      `Server capacity: ${type === "mmo" ? "50-100" : "10-30"} players\n` +
      `Synchronization: Server-authoritative with client prediction\n` +
      `Social features: Party system, friends list integration, chat\n` +
      `Anti-grief: Report system, moderation tools, safe zones`
    );
  }

  private generateUiUx(input: GameIdeaInput, _analysis: GameAnalysis): string {
    return (
      `Visual style: ${input.visualStyle ?? "Clean, modern Roblox UI"}\n` +
      `Key screens:\n` +
      `- Main menu / lobby\n` +
      `- HUD (health, currency, minimap)\n` +
      `- Inventory / equipment\n` +
      `- Settings\n` +
      `- Shop / store\n` +
      `- Social / party management\n\n` +
      `UX principles:\n` +
      `- Mobile-first responsive design\n` +
      `- Maximum 2 taps to any core action\n` +
      `- Clear visual feedback for all interactions\n` +
      `- Accessible for younger players`
    );
  }

  private generateTechArchitecture(analysis: GameAnalysis): string {
    return (
      `Architecture: Client-Server (Server-authoritative)\n\n` +
      `Server:\n` +
      `- Game state management\n` +
      `- Player data persistence (DataStore)\n` +
      `- Anti-cheat validation\n` +
      `- NPC/AI logic\n\n` +
      `Client:\n` +
      `- Rendering and UI\n` +
      `- Input handling\n` +
      `- Local prediction\n` +
      `- Visual effects\n\n` +
      `Required systems: ${analysis.requiredSystems.slice(0, 8).join(", ")}\n` +
      `Complexity: ${analysis.technicalComplexity}/100`
    );
  }

  private generatePerformanceStrategy(analysis: GameAnalysis): string {
    return (
      `Target: 60 FPS on mid-range mobile devices\n\n` +
      `Optimization strategies:\n` +
      `- Streaming enabled for large worlds\n` +
      `- LOD (Level of Detail) for distant objects\n` +
      `- Object pooling for frequently spawned items\n` +
      `- Efficient RemoteEvent batching\n` +
      `- Memory budget monitoring\n` +
      `- Part count optimization (<50k visible parts)\n\n` +
      `Monitoring:\n` +
      `- Server heartbeat tracking\n` +
      `- Client FPS monitoring\n` +
      `- Memory usage alerts\n` +
      `- Network bandwidth optimization\n\n` +
      `Technical complexity: ${analysis.technicalComplexity}/100`
    );
  }
}
