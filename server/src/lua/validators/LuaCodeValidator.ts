/**
 * LuaCodeValidator.ts — Validates generated Lua files.
 */

import type { BuiltLuaFile } from "../builders/ServerScriptBuilder";

export interface CodeValidationResult {
  valid: boolean;
  filesChecked: number;
  errors: Array<{ path: string; message: string }>;
  warnings: Array<{ path: string; message: string }>;
}

export class LuaCodeValidator {
  validate(files: BuiltLuaFile[]): CodeValidationResult {
    const errors: CodeValidationResult["errors"] = [];
    const warnings: CodeValidationResult["warnings"] = [];

    for (const file of files) {
      if (!file.content || file.content.trim().length === 0) {
        errors.push({ path: file.path, message: "Empty file" });
        continue;
      }
      if (/[\x00-\x08\x0E-\x1F]/.test(file.content)) {
        errors.push({
          path: file.path,
          message: "Contains control characters",
        });
      }
      // Block balance
      const stripped = file.content
        .replace(/--\[\[[\s\S]*?\]\]/g, "")
        .replace(/--[^\n]*/g, "")
        .replace(/"[^"]*"/g, '""')
        .replace(/'[^']*'/g, "''");
      const opens = (
        stripped.match(/\b(function|if|for|while|repeat|do)\b/g) ?? []
      ).length;
      const elseifs = (stripped.match(/\belseif\b/g) ?? []).length;
      const closes = (stripped.match(/\b(end|until)\b/g) ?? []).length;
      const balance = opens - elseifs - closes;
      if (balance !== 0) {
        errors.push({
          path: file.path,
          message: `Unbalanced blocks (${balance > 0 ? balance + " unclosed" : Math.abs(balance) + " extra end"})`,
        });
      }
      if (file.lines > 500)
        warnings.push({
          path: file.path,
          message: `Large file: ${file.lines} lines`,
        });
    }

    return {
      valid: errors.length === 0,
      filesChecked: files.length,
      errors,
      warnings,
    };
  }
}
