/**
 * PatternRepository — Stores and retrieves recognized game patterns.
 */

import { randomUUID } from "crypto";
import type { GamePattern, PatternType } from "./KnowledgeTypes";

export class PatternRepository {
  private patterns: Map<string, GamePattern> = new Map();

  constructor() {
    this.seedDefaults();
  }

  store(
    pattern: Omit<GamePattern, "id" | "createdAt" | "updatedAt">,
  ): GamePattern {
    const full: GamePattern = {
      ...pattern,
      id: `pat-${randomUUID().slice(0, 8)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.patterns.set(full.id, full);
    return full;
  }

  get(id: string): GamePattern | null {
    return this.patterns.get(id) ?? null;
  }

  getByType(type: PatternType): GamePattern[] {
    return this.getAll().filter((p) => p.type === type);
  }

  getAll(): GamePattern[] {
    return [...this.patterns.values()].sort(
      (a, b) => b.successRate - a.successRate,
    );
  }

  getBestForGenre(genre: string): GamePattern[] {
    return this.getAll()
      .filter((p) => p.genre.includes(genre) || p.genre.includes("all"))
      .slice(0, 5);
  }

  recordUsage(id: string, score: number): void {
    const pattern = this.patterns.get(id);
    if (!pattern) return;
    pattern.usageCount++;
    pattern.averageScore = Math.round(
      (pattern.averageScore * (pattern.usageCount - 1) + score) /
        pattern.usageCount,
    );
    pattern.successRate =
      score >= 70
        ? Math.min(1, pattern.successRate + 0.02)
        : Math.max(0, pattern.successRate - 0.01);
    pattern.updatedAt = Date.now();
  }

  private seedDefaults(): void {
    const defaults: Array<Omit<GamePattern, "id" | "createdAt" | "updatedAt">> =
      [
        {
          type: "inventory",
          name: "Standard Inventory",
          description: "Slot-based inventory with stacking",
          scripts: ["InventoryService", "InventoryUI"],
          dependencies: ["DataService", "RemoteEvents"],
          genre: ["all"],
          successRate: 0.85,
          usageCount: 0,
          averageScore: 82,
        },
        {
          type: "quest",
          name: "Linear Quest System",
          description: "Sequential quest progression with objectives",
          scripts: ["QuestManager", "QuestUI"],
          dependencies: ["DataService", "NPCManager"],
          genre: ["rpg", "adventure"],
          successRate: 0.78,
          usageCount: 0,
          averageScore: 76,
        },
        {
          type: "combat",
          name: "Basic Combat",
          description: "Health-based combat with cooldowns",
          scripts: ["CombatSystem", "DamageService"],
          dependencies: ["RemoteEvents", "SharedConfig"],
          genre: ["rpg", "fps", "adventure"],
          successRate: 0.8,
          usageCount: 0,
          averageScore: 79,
        },
        {
          type: "economy",
          name: "Dual Currency",
          description: "Free + premium currency with shop",
          scripts: ["EconomyService", "ShopUI"],
          dependencies: ["DataService", "RemoteEvents"],
          genre: ["all"],
          successRate: 0.88,
          usageCount: 0,
          averageScore: 84,
        },
        {
          type: "save",
          name: "DataStore Persistence",
          description: "Auto-save with retry and session locking",
          scripts: ["DataService"],
          dependencies: ["SharedConfig"],
          genre: ["all"],
          successRate: 0.92,
          usageCount: 0,
          averageScore: 90,
        },
        {
          type: "lobby",
          name: "Standard Lobby",
          description: "Player spawn with protection and welcome",
          scripts: ["LobbyManager"],
          dependencies: ["SharedConfig", "RemoteEvents"],
          genre: ["all"],
          successRate: 0.9,
          usageCount: 0,
          averageScore: 88,
        },
        {
          type: "dialogue",
          name: "NPC Dialogue",
          description: "Tree-based dialogue with choices",
          scripts: ["DialogueManager", "DialogueUI"],
          dependencies: ["NPCManager", "RemoteEvents"],
          genre: ["rpg", "adventure"],
          successRate: 0.72,
          usageCount: 0,
          averageScore: 71,
        },
        {
          type: "progression",
          name: "XP & Levels",
          description: "XP-based leveling with rewards",
          scripts: ["ProgressionService"],
          dependencies: ["DataService", "SharedConfig"],
          genre: ["all"],
          successRate: 0.87,
          usageCount: 0,
          averageScore: 85,
        },
      ];

    for (const d of defaults) this.store(d);
  }
}
