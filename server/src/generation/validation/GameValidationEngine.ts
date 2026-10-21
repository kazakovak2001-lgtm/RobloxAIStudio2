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
import { getPlayableLuaIssues } from "../../types/playableLua";
import { LuaCodeValidator } from "../lua/LuaCodeValidator";
import { reviewLuaSecurity } from "../../validation/luaSecurityReview";

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
  private readonly luaCodeValidator = new LuaCodeValidator();

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

    // GEN-VIABILITY-2. A structurally valid, syntactically balanced script
    // is not necessarily a runnable one: the game may still have no world,
    // no spawn, no interaction, and no HUD. Reuse the same playable-Lua
    // contract that already gates the other generation pipeline's Studio
    // delivery, rather than inventing a second "is this actually a game"
    // check with its own rules.
    const playableIssues = getPlayableLuaIssues(
      lua.scripts.map((script) => ({
        path: script.path,
        content: script.code,
      })),
    );
    for (const issue of playableIssues) {
      issues.push({ severity: "error", code: "NOT_PLAYABLE", message: issue });
    }
  }

  /**
   * Compile/type/policy gate for one generated script.
   *
   * Delegates to the repo's canonical `LuaCodeValidator` (forbidden APIs —
   * `loadstring`, `getfenv`/`setfenv`, `rawset(_G, ...)`,
   * `debug.setmetatable`, CoreGui injection — plus balanced-block syntax
   * checking) instead of re-implementing a second, weaker pattern set here.
   * `LuaCodeValidator` errors are blocking (`severity: "error"`); its
   * warnings (deprecated APIs, oversized scripts, unyielded loops) are
   * non-blocking, matching how it is already used elsewhere in the codebase
   * (`LuaGenerationEngine`, `LuaArtifactBuilder`).
   */
  private checkLuaSyntax(script: LuaScript, issues: ValidationIssue[]): void {
    const report = this.luaCodeValidator.validate(script.name, script.code);

    for (const error of report.errors) {
      issues.push({
        severity: "error",
        code: "LUA_CODE_ERROR",
        message: `${script.name}: ${error}`,
        file: script.path,
      });
    }
    for (const warning of report.warnings) {
      issues.push({
        severity: "warning",
        code: "LUA_CODE_WARNING",
        message: `${script.name}: ${warning}`,
        file: script.path,
      });
    }

    // Check for empty scripts — not covered by LuaCodeValidator.
    if (script.code.trim().length < 20) {
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

    this.attachSecurityReview(lua, issues);
  }

  /**
   * SECREVIEW-1 trust-boundary review, reused rather than re-implemented.
   *
   * `reviewLuaSecurity` (server/src/validation/luaSecurityReview.ts) is the
   * repo's canonical deep security scanner — it understands `OnServerEvent`/
   * `OnServerInvoke` handlers, tracks which parameters are client-controlled,
   * and catches exploit shapes this engine's own checks above do not (client
   * -awarded currency, unvalidated teleports, dynamic code execution, etc.).
   *
   * Its findings are attached as `info`-severity issues only. Per
   * `docs/00-project-control/SECURITY-REVIEW-B_PROMOTION_CRITERIA.md` the
   * reviewer is deliberately advisory — "a finding never negates generation,
   * delivery or release" — until the documented promotion criteria (measured
   * false-positive rate, human override path, etc.) are satisfied. Promoting
   * it to blocking is a separate, not-yet-scoped delivery and must not happen
   * as a side effect here.
   */
  private attachSecurityReview(
    lua: LuaGenerationResult,
    issues: ValidationIssue[],
  ): void {
    const report = reviewLuaSecurity(
      lua.scripts.map((script) => ({
        path: script.path,
        content: script.code,
      })),
    );

    for (const finding of report.findings) {
      issues.push({
        severity: "info",
        code: `SECURITY_REVIEW_${finding.code}`,
        message: `[advisory, ${finding.severity}] ${finding.message}: ${finding.evidence}`,
        file: finding.path,
      });
    }
  }
}
