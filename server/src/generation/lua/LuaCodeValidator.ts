/**
 * LuaCodeValidator — Static analysis and validation for generated Lua scripts.
 */

import type { ValidationReport } from "./LuaGenerationTypes";

const FORBIDDEN_APIS = [
  "loadstring",
  "setfenv",
  "getfenv",
  "rawset.*_G",
  "debug.setmetatable",
  "Instance.new.*ScreenGui.*CoreGui",
];

const DEPRECATED_APIS = [
  "wait(",
  "spawn(",
  "delay(",
  ":connect(",
  "game.Workspace",
];

export class LuaCodeValidator {
  /**
   * Validate a Lua script and produce a report.
   */
  validate(scriptName: string, content: string): ValidationReport {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic syntax checks
    this.checkBalancedBlocks(content, errors);
    this.checkForbiddenApis(content, errors);
    this.checkDeprecatedApis(content, warnings);
    this.checkScriptLength(content, warnings);
    this.checkInfiniteLoops(content, warnings);

    const score = this.calculateScore(errors, warnings, content);

    return {
      scriptName,
      score,
      passed: errors.length === 0 && score >= 60,
      errors,
      warnings,
    };
  }

  private checkBalancedBlocks(content: string, errors: string[]): void {
    const opens =
      (content.match(/\bfunction\b/g) || []).length +
      (content.match(/\bdo\b/g) || []).length +
      (content.match(/\bthen\b/g) || []).length;
    const closes = (content.match(/\bend\b/g) || []).length;

    if (Math.abs(opens - closes) > 1) {
      errors.push(`Unbalanced blocks: ${opens} opens vs ${closes} ends`);
    }
  }

  private checkForbiddenApis(content: string, errors: string[]): void {
    for (const pattern of FORBIDDEN_APIS) {
      const regex = new RegExp(pattern, "i");
      if (regex.test(content)) {
        errors.push(`Forbidden API detected: ${pattern}`);
      }
    }
  }

  private checkDeprecatedApis(content: string, warnings: string[]): void {
    for (const api of DEPRECATED_APIS) {
      if (content.includes(api)) {
        warnings.push(`Deprecated API: ${api} — use modern alternative`);
      }
    }
  }

  private checkScriptLength(content: string, warnings: string[]): void {
    const lines = content.split("\n").length;
    if (lines > 500) {
      warnings.push(
        `Script is ${lines} lines — consider splitting into modules`,
      );
    }
  }

  private checkInfiniteLoops(content: string, warnings: string[]): void {
    if (
      /while\s+true\s+do[\s\S]*?(?!task\.wait|wait)[\s\S]*?end/.test(content)
    ) {
      if (
        !content.includes("task.wait") &&
        !content.includes("wait(") &&
        content.includes("while true do")
      ) {
        warnings.push("Potential infinite loop without yield (task.wait)");
      }
    }
  }

  private calculateScore(
    errors: string[],
    warnings: string[],
    content: string,
  ): number {
    let score = 100;
    score -= errors.length * 20;
    score -= warnings.length * 5;

    // Bonus for good practices
    if (content.includes("--[[")) score += 2; // Has documentation
    if (content.includes(": ")) score += 2; // Has type annotations
    if (content.includes("pcall")) score += 1; // Error handling

    return Math.max(0, Math.min(100, score));
  }
}
