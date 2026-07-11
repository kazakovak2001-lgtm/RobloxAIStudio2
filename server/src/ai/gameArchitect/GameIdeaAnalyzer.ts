/**
 * GameIdeaAnalyzer — Analyzes user game ideas and expands them into structured requirements.
 */

import type { GameIdeaInput, GameAnalysis } from "./GameArchitectTypes";

const GENRE_SYSTEMS: Record<string, string[]> = {
  rpg: [
    "character progression",
    "inventory",
    "quest system",
    "NPC interactions",
    "combat",
    "skill trees",
    "dialogue system",
  ],
  survival: [
    "resource gathering",
    "crafting",
    "building",
    "health/hunger",
    "day/night cycle",
    "enemy AI",
    "inventory",
  ],
  tycoon: [
    "money system",
    "upgrades",
    "automation",
    "prestige/rebirth",
    "workers",
    "unlockables",
  ],
  simulator: [
    "skill progression",
    "collection",
    "rebirth system",
    "pets",
    "multiplier system",
    "trading",
  ],
  obby: [
    "checkpoints",
    "stage progression",
    "timer",
    "difficulty scaling",
    "rewards",
    "leaderboards",
  ],
  adventure: [
    "exploration",
    "puzzle solving",
    "story progression",
    "collectibles",
    "NPCs",
    "quests",
  ],
  fps: [
    "weapons",
    "health system",
    "respawning",
    "teams",
    "maps",
    "matchmaking",
    "loadouts",
  ],
  horror: [
    "atmosphere",
    "jump scares",
    "puzzle elements",
    "story",
    "chase mechanics",
    "flashlight system",
  ],
  racing: [
    "vehicles",
    "tracks",
    "boost system",
    "upgrades",
    "leaderboards",
    "drift mechanics",
  ],
  social: [
    "chat",
    "emotes",
    "housing",
    "customization",
    "minigames",
    "parties",
  ],
};

const GENRE_MOTIVATIONS: Record<string, string[]> = {
  rpg: ["mastery", "story progression", "character growth", "exploration"],
  survival: [
    "challenge",
    "creativity",
    "resource mastery",
    "territory control",
  ],
  tycoon: ["accumulation", "optimization", "growth", "automation satisfaction"],
  simulator: ["collection", "progression", "competition", "completionism"],
  obby: ["skill mastery", "completion", "competition", "speedrunning"],
  adventure: ["exploration", "discovery", "story", "puzzle solving"],
  fps: ["competition", "skill", "teamwork", "ranking"],
  horror: ["thrill", "story discovery", "challenge", "atmosphere"],
  racing: ["speed", "competition", "mastery", "customization"],
  social: ["connection", "creativity", "expression", "community"],
};

export class GameIdeaAnalyzer {
  /**
   * Analyze a game idea and produce structured analysis.
   */
  analyze(input: GameIdeaInput): GameAnalysis {
    const genre = this.detectGenre(input);
    const subGenre = this.detectSubGenre(input, genre);
    const systems = this.determineRequiredSystems(input, genre);
    const complexity = this.estimateComplexity(systems, input);

    return {
      genre,
      subGenre,
      gameplayLoop: this.generateGameplayLoop(input, genre),
      playerMotivation: this.determinePlayerMotivation(genre, input),
      progressionSystem: this.designProgression(genre, input),
      difficultyModel: this.determineDifficulty(genre, input),
      requiredSystems: systems,
      technicalComplexity: complexity,
      estimatedAgents: this.determineRequiredAgents(systems),
      risks: this.identifyRisks(complexity, systems, input),
      improvements: this.suggestImprovements(input, genre),
    };
  }

  private detectGenre(input: GameIdeaInput): string {
    if (input.genre) return input.genre.toLowerCase();

    const desc = input.description.toLowerCase();
    const genreKeywords: Record<string, string[]> = {
      rpg: ["rpg", "quest", "level up", "character", "inventory", "skills"],
      survival: ["survival", "craft", "build", "gather", "hunger"],
      tycoon: ["tycoon", "money", "business", "earn", "buy"],
      simulator: ["simulator", "collect", "rebirth", "pet"],
      obby: ["obby", "obstacle", "parkour", "jump", "checkpoint"],
      adventure: ["adventure", "explore", "puzzle", "story"],
      fps: ["shooter", "gun", "fps", "weapon", "combat"],
      horror: ["horror", "scary", "dark", "monster", "escape"],
      racing: ["race", "car", "vehicle", "speed", "track"],
      social: ["social", "hangout", "roleplay", "chat"],
    };

    for (const [genre, keywords] of Object.entries(genreKeywords)) {
      if (keywords.some((kw) => desc.includes(kw))) return genre;
    }
    return "adventure";
  }

  private detectSubGenre(input: GameIdeaInput, genre: string): string {
    const desc = input.description.toLowerCase();
    const subGenres: Record<string, Record<string, string[]>> = {
      rpg: {
        action_rpg: ["action", "combat"],
        story_rpg: ["story", "narrative"],
        mmorpg: ["multiplayer", "mmo", "online"],
      },
      survival: {
        pve_survival: ["zombie", "monster"],
        sandbox: ["sandbox", "build"],
        battle_royale: ["battle royale", "last"],
      },
      tycoon: {
        idle_tycoon: ["idle", "afk"],
        management: ["manage", "hire"],
        factory: ["factory", "produce"],
      },
    };
    const genreSubs = subGenres[genre] ?? {};
    for (const [sub, keywords] of Object.entries(genreSubs)) {
      if (keywords.some((kw) => desc.includes(kw))) return sub;
    }
    return `${genre}_standard`;
  }

  private determineRequiredSystems(
    input: GameIdeaInput,
    genre: string,
  ): string[] {
    const baseSystems = GENRE_SYSTEMS[genre] ?? GENRE_SYSTEMS.adventure;
    const additional: string[] = [];

    if (input.multiplayerType && input.multiplayerType !== "none") {
      additional.push(
        "multiplayer synchronization",
        "matchmaking",
        "anti-cheat",
      );
    }
    if (input.monetizationGoals?.length) {
      additional.push(
        "game pass system",
        "developer products",
        "premium benefits",
      );
    }
    if (input.gameplayMechanics?.length) {
      for (const mech of input.gameplayMechanics) {
        if (!baseSystems.includes(mech.toLowerCase())) {
          additional.push(mech.toLowerCase());
        }
      }
    }

    return [...new Set([...baseSystems, ...additional])];
  }

  private estimateComplexity(systems: string[], input: GameIdeaInput): number {
    let score = Math.min(systems.length * 8, 60);
    if (input.multiplayerType && input.multiplayerType !== "none") score += 15;
    if (input.monetizationGoals?.length) score += 10;
    if (systems.length > 10) score += 15;
    return Math.min(score, 100);
  }

  private generateGameplayLoop(_input: GameIdeaInput, genre: string): string {
    const loops: Record<string, string> = {
      rpg: "Explore → Fight → Loot → Level Up → Unlock new areas → Repeat",
      survival:
        "Gather resources → Craft tools → Build shelter → Defend → Expand → Repeat",
      tycoon:
        "Earn currency → Purchase upgrades → Automate → Prestige → Repeat faster",
      simulator:
        "Perform action → Gain XP → Level up skill → Unlock new area → Collect → Repeat",
      obby: "Attempt stage → Fail/Succeed → Progress → Unlock harder stages → Repeat",
      adventure:
        "Explore → Discover → Solve puzzle → Progress story → Unlock area → Repeat",
      fps: "Queue match → Compete → Earn rewards → Upgrade loadout → Repeat",
      horror:
        "Enter area → Investigate → Encounter threat → Escape/Solve → Progress → Repeat",
      racing:
        "Select track → Race → Earn credits → Upgrade vehicle → Unlock tracks → Repeat",
      social:
        "Join server → Interact → Customize → Play minigames → Express → Repeat",
    };
    return loops[genre] ?? loops.adventure;
  }

  private determinePlayerMotivation(
    genre: string,
    _input: GameIdeaInput,
  ): string[] {
    return GENRE_MOTIVATIONS[genre] ?? GENRE_MOTIVATIONS.adventure;
  }

  private designProgression(genre: string, _input: GameIdeaInput): string {
    const progressions: Record<string, string> = {
      rpg: "Level-based with XP, skill trees, and equipment tiers",
      survival: "Technology tree with unlockable recipes and building tiers",
      tycoon: "Revenue milestones with rebirth mechanics for multipliers",
      simulator: "Skill-based XP with area unlocks and rebirth prestige",
      obby: "Stage-based with difficulty progression and collectible rewards",
      adventure: "Story chapters with gear upgrades and ability unlocks",
      fps: "Rank-based matchmaking with weapon unlocks and cosmetics",
      horror:
        "Chapter progression with narrative reveals and difficulty scaling",
      racing: "Division-based ranking with vehicle upgrades and track unlocks",
      social: "Social level with unlockable emotes, housing items, and titles",
    };
    return progressions[genre] ?? progressions.adventure;
  }

  private determineDifficulty(_genre: string, _input: GameIdeaInput): string {
    return "Adaptive difficulty with skill-based matchmaking and optional hard modes";
  }

  private determineRequiredAgents(systems: string[]): string[] {
    const agents = ["requirements", "game_designer", "roblox_architect"];
    if (
      systems.some(
        (s) =>
          s.includes("script") || s.includes("combat") || s.includes("system"),
      )
    ) {
      agents.push("lua_generator");
    }
    if (
      systems.some(
        (s) => s.includes("menu") || s.includes("HUD") || s.includes("UI"),
      )
    ) {
      agents.push("ui_generator");
    }
    agents.push("asset_planner", "tester", "performance", "documentation");
    return [...new Set(agents)];
  }

  private identifyRisks(
    complexity: number,
    systems: string[],
    input: GameIdeaInput,
  ): string[] {
    const risks: string[] = [];
    if (complexity > 70)
      risks.push("High technical complexity may increase development time");
    if (systems.length > 12)
      risks.push("Large number of systems increases integration risk");
    if (input.multiplayerType === "mmo")
      risks.push("MMO-scale multiplayer is extremely complex on Roblox");
    if (!input.targetAudience)
      risks.push("No target audience defined — may lead to unfocused design");
    if (systems.some((s) => s.includes("anti-cheat")))
      risks.push("Anti-cheat systems are difficult to implement perfectly");
    return risks;
  }

  private suggestImprovements(input: GameIdeaInput, _genre: string): string[] {
    const suggestions: string[] = [];
    if (!input.targetAudience)
      suggestions.push("Define a specific target audience for focused design");
    if (!input.monetizationGoals?.length)
      suggestions.push("Consider monetization strategy early in development");
    if (!input.multiplayerType)
      suggestions.push(
        "Determine multiplayer approach (solo, co-op, competitive)",
      );
    if (!input.visualStyle)
      suggestions.push(
        "Define visual style direction for consistent art production",
      );
    if (!input.gameplayMechanics?.length)
      suggestions.push(
        "List specific gameplay mechanics for better agent prompts",
      );
    return suggestions;
  }
}
