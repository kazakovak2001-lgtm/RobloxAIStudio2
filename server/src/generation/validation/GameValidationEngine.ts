/**
 * GameValidationEngine.ts
 *
 * Validates generated game content before export.
 * Checks: Lua syntax, blueprint completeness, gameplay sanity,
 * missing dependencies, exploit risk.
 */

import type { RobloxGameBlueprint } from "../blueprint/GameBlueprintEngine";
import type { LuaGenerationResult, LuaScript } from "../lua/LuaGenerator";
import type { AssetLayout } from "../assets/AssetGenerator";

export interface ValidationIssue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  file?: string;
}

export interface GameValidationResult {
  passed: boolean;
  score: number; // 0–100
  issues: ValidationIssue[];
  errors: number;
  warnings: number;
  checkedAt: Date;
}

export class GameValidationEngine {
  /**
   * Run full validation on generated game content.
   */
  validate(
    blueprint: RobloxGameBlueprint,
    lua: LuaGenerationResult,
    assets: AssetLayout,
  ): GameValidationResult {
    const issues: ValidationIssue[] = [];

    this.validateBlueprint(blueprint, issues);
    this.validateLua(lua, issues);
    this.validateAssets(assets, issues);
    this.validateGameplayLoop(blueprint, issues);
    this.validateExploitRisk(lua, issues);

    const errors = issues.filter((i) => i.severity === "error").length;
    const warnings = issues.filter((i) => i.severity === "warning").length;
    let score = 100 - errors * 15 - warnings * 3;
    score = Math.max(0, Math.min(100, score));

    const result: GameValidationResult = {
      passed: errors === 0,
      score,
      issues,
      errors,
      warnings,
      checkedAt: new Date(),
    };

    console.log(
      `[VALIDATION] Complete | Score: ${score} | Errors: ${errors} | Warnings: ${warnings} | Passed: ${result.passed}`,
    );
    return result;
  }

  private validateBlueprint(
    bp: RobloxGameBlueprint,
    issues: ValidationIssue[],
  ): void {
    if (!bp.title || bp.title.length < 2)
      issues.push({
        severity: "error",
        code: "NO_TITLE",
        message: "Game must have a title",
      });
    if (bp.coreLoop.length === 0)
      issues.push({
        severity: "error",
        code: "NO_LOOP",
        message: "Core gameplay loop is empty",
      });
    if (bp.mechanics.length === 0)
      issues.push({
        severity: "error",
        code: "NO_MECHANICS",
        message: "No mechanics defined",
      });
    if (bp.world.biomes.length === 0)
      issues.push({
        severity: "warning",
        code: "NO_BIOMES",
        message: "No biomes defined for world",
      });
    if (bp.npcs.length === 0)
      issues.push({
        severity: "info",
        code: "NO_NPCS",
        message: "No NPCs defined — game may lack interaction",
      });
  }

  private validateLua(
    lua: LuaGenerationResult,
    issues: ValidationIssue[],
  ): void {
    if (lua.scripts.length === 0) {
      issues.push({
        severity: "error",
        code: "NO_SCRIPTS",
        message: "No Lua scripts generated",
      });
      return;
    }

    const serverScripts = lua.scripts.filter((s) => s.type === "server");
    const clientScripts = lua.scripts.filter((s) => s.type === "client");

    if (serverScripts.length === 0)
      issues.push({
        severity: "error",
        code: "NO_SERVER",
        message: "No server scripts",
      });
    if (clientScripts.length === 0)
      issues.push({
        severity: "warning",
        code: "NO_CLIENT",
        message: "No client scripts",
      });

    // Basic Lua syntax checks
    for (const script of lua.scripts) {
      this.checkLuaSyntax(script, issues);
    }
  }

  private checkLuaSyntax(script: LuaScript, issues: ValidationIssue[]): void {
    const code = script.code;

    // Check for balanced keywords
    const funcCount = (code.match(/\bfunction\b/g) ?? []).length;
    const endCount = (code.match(/\bend\b/g) ?? []).length;
    if (funcCount > endCount) {
      issues.push({
        severity: "error",
        code: "UNBALANCED_FUNC",
        message: `Unclosed function in ${script.name}`,
        file: script.path,
      });
    }

    // Check for dangerous patterns
    if (code.includes("loadstring")) {
      issues.push({
        severity: "error",
        code: "UNSAFE_LOADSTRING",
        message: `loadstring() detected in ${script.name} — security risk`,
        file: script.path,
      });
    }
    if (code.includes("getfenv") || code.includes("setfenv")) {
      issues.push({
        severity: "warning",
        code: "UNSAFE_ENV",
        message: `Environment manipulation in ${script.name}`,
        file: script.path,
      });
    }

    // Check for empty scripts
    if (code.trim().length < 20) {
      issues.push({
        severity: "warning",
        code: "EMPTY_SCRIPT",
        message: `Script ${script.name} appears empty`,
        file: script.path,
      });
    }
  }

  private validateAssets(assets: AssetLayout, issues: ValidationIssue[]): void {
    if (assets.spawnPoints.length === 0) {
      issues.push({
        severity: "error",
        code: "NO_SPAWN",
        message: "No spawn points defined — players cannot enter",
      });
    }
    if (assets.totalObjects === 0) {
      issues.push({
        severity: "warning",
        code: "EMPTY_WORLD",
        message: "No objects in the world",
      });
    }
  }

  private validateGameplayLoop(
    bp: RobloxGameBlueprint,
    issues: ValidationIssue[],
  ): void {
    // Check that core loop has reasonable length
    if (bp.coreLoop.length < 2) {
      issues.push({
        severity: "warning",
        code: "SHORT_LOOP",
        message: "Core loop has fewer than 2 steps — may feel incomplete",
      });
    }
    if (bp.coreLoop.length > 8) {
      issues.push({
        severity: "info",
        code: "LONG_LOOP",
        message: "Core loop has 8+ steps — consider simplifying",
      });
    }
  }

  private validateExploitRisk(
    lua: LuaGenerationResult,
    issues: ValidationIssue[],
  ): void {
    for (const script of lua.scripts) {
      if (script.type === "client" && script.code.includes("DataStore")) {
        issues.push({
          severity: "error",
          code: "CLIENT_DATASTORE",
          message: `Client script ${script.name} accesses DataStore — exploit risk`,
          file: script.path,
        });
      }
      if (script.type === "client" && script.code.includes("ServerStorage")) {
        issues.push({
          severity: "error",
          code: "CLIENT_SERVER_STORAGE",
          message: `Client script ${script.name} accesses ServerStorage — exploit risk`,
          file: script.path,
        });
      }
    }
  }
}
