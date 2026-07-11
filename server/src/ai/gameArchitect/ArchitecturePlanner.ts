/**
 * ArchitecturePlanner — Generates Roblox technical architecture recommendations.
 */

import type { GameAnalysis, GameArchitecturePlan } from "./GameArchitectTypes";

export class ArchitecturePlanner {
  /**
   * Generate a technical architecture plan for Roblox Studio.
   */
  plan(analysis: GameAnalysis): GameArchitecturePlan {
    return {
      serverArchitecture: this.planServer(analysis),
      clientArchitecture: this.planClient(analysis),
      dataStoreUsage: this.planDataStore(analysis),
      remoteEvents: this.planRemoteEvents(analysis),
      moduleScripts: this.planModules(analysis),
      optimizationStrategy: this.planOptimization(analysis),
      securityConsiderations: this.planSecurity(analysis),
    };
  }

  private planServer(analysis: GameAnalysis): string[] {
    const scripts = [
      "GameManager — orchestrates game state and lifecycle",
      "PlayerManager — handles join/leave, data loading, session management",
      "DataManager — DataStore operations with retry and caching",
    ];
    if (analysis.requiredSystems.some((s) => s.includes("combat"))) {
      scripts.push(
        "CombatSystem — server-authoritative damage, abilities, cooldowns",
      );
    }
    if (analysis.requiredSystems.some((s) => s.includes("quest"))) {
      scripts.push(
        "QuestManager — quest state, objectives, rewards distribution",
      );
    }
    if (
      analysis.requiredSystems.some(
        (s) =>
          s.includes("economy") ||
          s.includes("money") ||
          s.includes("currency"),
      )
    ) {
      scripts.push(
        "EconomyService — currency transactions, shop purchases, trading",
      );
    }
    if (analysis.requiredSystems.some((s) => s.includes("NPC"))) {
      scripts.push(
        "NPCController — NPC spawning, AI behavior, dialogue triggers",
      );
    }
    if (analysis.requiredSystems.some((s) => s.includes("matchmaking"))) {
      scripts.push(
        "MatchmakingService — lobby system, team assignment, game start",
      );
    }
    scripts.push("AdminService — moderation tools, banning, analytics events");
    return scripts;
  }

  private planClient(analysis: GameAnalysis): string[] {
    const scripts = [
      "UIController — manages all screen GUIs and navigation",
      "InputManager — keyboard/mouse/touch/gamepad input handling",
      "CameraController — camera modes, transitions, effects",
      "SoundManager — music, SFX, spatial audio",
    ];
    if (analysis.requiredSystems.some((s) => s.includes("combat"))) {
      scripts.push("CombatUI — health bars, damage numbers, ability cooldowns");
    }
    if (analysis.requiredSystems.some((s) => s.includes("inventory"))) {
      scripts.push(
        "InventoryUI — item display, drag-and-drop, equipment slots",
      );
    }
    scripts.push("NotificationSystem — toasts, achievements, rewards popups");
    return scripts;
  }

  private planDataStore(analysis: GameAnalysis): string[] {
    const stores = [
      "PlayerData — level, XP, inventory, settings, achievements",
      "SessionData — temporary progress, active quests, buffs",
    ];
    if (analysis.requiredSystems.some((s) => s.includes("leaderboard"))) {
      stores.push("Leaderboards — OrderedDataStore for global/weekly rankings");
    }
    if (analysis.requiredSystems.some((s) => s.includes("trading"))) {
      stores.push("TradeLog — transaction history for audit and rollback");
    }
    if (analysis.requiredSystems.some((s) => s.includes("building"))) {
      stores.push("BuildData — player structures and placement data");
    }
    stores.push("Analytics — play session metrics, funnel tracking");
    return stores;
  }

  private planRemoteEvents(analysis: GameAnalysis): string[] {
    const events = [
      "PlayerAction — generic player input relay (validated server-side)",
      "UIUpdate — server pushes state changes to client UI",
      "NotifyPlayer — server-to-client notifications and rewards",
    ];
    if (analysis.requiredSystems.some((s) => s.includes("combat"))) {
      events.push("CombatAction — attack/ability requests from client");
      events.push("DamageUpdate — server broadcasts damage/healing events");
    }
    if (analysis.requiredSystems.some((s) => s.includes("trading"))) {
      events.push("TradeRequest — initiate/accept/decline trade operations");
    }
    if (analysis.requiredSystems.some((s) => s.includes("chat"))) {
      events.push("ChatMessage — filtered chat relay");
    }
    return events;
  }

  private planModules(analysis: GameAnalysis): string[] {
    const modules = [
      "Config — game constants, tuning values, feature flags",
      "Utils — shared utility functions (math, formatting, validation)",
      "Types — shared TypeScript-like type definitions for Luau",
      "EventBus — internal pub/sub for decoupled communication",
    ];
    if (analysis.requiredSystems.some((s) => s.includes("inventory"))) {
      modules.push("ItemDatabase — item definitions, stats, rarity tiers");
    }
    if (analysis.requiredSystems.some((s) => s.includes("progression"))) {
      modules.push(
        "ProgressionConfig — XP curves, level rewards, unlock conditions",
      );
    }
    if (analysis.requiredSystems.some((s) => s.includes("crafting"))) {
      modules.push("RecipeRegistry — crafting recipes, requirements, outputs");
    }
    return modules;
  }

  private planOptimization(analysis: GameAnalysis): string[] {
    const strategies = [
      "Enable StreamingEnabled for world loading",
      "Use object pooling for projectiles and particles",
      "Batch RemoteEvent calls (max 60/sec per player)",
      "Implement LOD system for distant objects",
      "Use CollectionService tags for efficient iteration",
    ];
    if (analysis.technicalComplexity > 60) {
      strategies.push("Implement spatial partitioning for large worlds");
      strategies.push("Use deferred signal behavior for performance");
    }
    if (analysis.technicalComplexity > 80) {
      strategies.push("Profile regularly with MicroProfiler");
      strategies.push("Consider parallel Luau for heavy computations");
    }
    return strategies;
  }

  private planSecurity(analysis: GameAnalysis): string[] {
    const security = [
      "Server-authoritative: never trust client for game state",
      "Validate all RemoteEvent payloads on server",
      "Rate-limit client requests (prevent spam attacks)",
      "Sanity-check player movement (anti-teleport)",
    ];
    if (
      analysis.requiredSystems.some(
        (s) => s.includes("economy") || s.includes("money"),
      )
    ) {
      security.push("Double-validate currency transactions server-side");
      security.push("Log all economic operations for audit trail");
    }
    if (analysis.requiredSystems.some((s) => s.includes("trading"))) {
      security.push("Implement trade confirmation with cooldown period");
    }
    security.push("Use HttpService cautiously — whitelist external endpoints");
    return security;
  }
}
