/**
 * LuaSyntaxValidator.ts
 *
 * Basic Lua syntax validation (no full parser — pattern-based checks).
 * Validates: syntax patterns, identifiers, empty scripts, duplicates, unsupported chars.
 */

export interface LuaValidationResult {
  valid: boolean;
  errors: Array<{ path: string; line?: number; message: string }>;
  warnings: Array<{ path: string; message: string }>;
  scriptsChecked: number;
}

export class LuaSyntaxValidator {
  /**
   * Validate a set of Lua scripts.
   */
  validateAll(
    scripts: Array<{ path: string; content: string; name: string }>,
  ): LuaValidationResult {
    const errors: LuaValidationResult["errors"] = [];
    const warnings: LuaValidationResult["warnings"] = [];
    const names = new Set<string>();

    for (const script of scripts) {
      // Empty script check
      if (!script.content || script.content.trim().length === 0) {
        errors.push({ path: script.path, message: "Empty script" });
        continue;
      }

      // Duplicate module name check
      if (names.has(script.name)) {
        errors.push({
          path: script.path,
          message: `Duplicate script name: "${script.name}"`,
        });
      }
      names.add(script.name);

      // Validate content
      const contentErrors = this.validateContent(script.path, script.content);
      errors.push(...contentErrors.errors);
      warnings.push(...contentErrors.warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      scriptsChecked: scripts.length,
    };
  }

  /**
   * Validate a single Lua script content.
   */
  validate(
    path: string,
    content: string,
  ): { valid: boolean; errors: string[] } {
    const result = this.validateContent(path, content);
    return {
      valid: result.errors.length === 0,
      errors: result.errors.map((e) => e.message),
    };
  }

  private validateContent(
    path: string,
    content: string,
  ): {
    errors: LuaValidationResult["errors"];
    warnings: LuaValidationResult["warnings"];
  } {
    const errors: LuaValidationResult["errors"] = [];
    const warnings: LuaValidationResult["warnings"] = [];
    const lines = content.split("\n");

    // Unsupported characters (non-UTF8 control chars)
    if (/[\x00-\x08\x0E-\x1F]/.test(content)) {
      errors.push({ path, message: "Contains unsupported control characters" });
    }

    // Unbalanced blocks
    let blockDepth = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
        .replace(/--.*$/, "")
        .replace(/"[^"]*"/g, '""')
        .replace(/'[^']*'/g, "''"); // strip comments and strings
      const opens = (line.match(/\b(function|if|for|while|repeat|do)\b/g) ?? [])
        .length;
      // elseif contains 'if' but doesn't open a new block
      const elseifs = (line.match(/\belseif\b/g) ?? []).length;
      const closes = (line.match(/\b(end|until)\b/g) ?? []).length;
      blockDepth += opens - elseifs - closes;
    }
    if (blockDepth > 0) {
      errors.push({
        path,
        message: `Unbalanced blocks: ${blockDepth} unclosed block(s)`,
      });
    } else if (blockDepth < 0) {
      errors.push({
        path,
        message: `Unbalanced blocks: ${Math.abs(blockDepth)} extra 'end' statement(s)`,
      });
    }

    // Invalid identifiers in local declarations
    const localPattern = /local\s+([a-zA-Z_]\w*)/g;
    let match;
    while ((match = localPattern.exec(content)) !== null) {
      if (this.isReservedWord(match[1])) {
        errors.push({
          path,
          message: `Reserved word used as identifier: "${match[1]}"`,
        });
      }
    }

    // Very long lines (warning only)
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length > 200) {
        warnings.push({
          path,
          message: `Line ${i + 1} exceeds 200 characters`,
        });
        break; // only warn once
      }
    }

    return { errors, warnings };
  }

  private isReservedWord(word: string): boolean {
    const reserved = new Set([
      "and",
      "break",
      "do",
      "else",
      "elseif",
      "end",
      "false",
      "for",
      "function",
      "goto",
      "if",
      "in",
      "local",
      "nil",
      "not",
      "or",
      "repeat",
      "return",
      "then",
      "true",
      "until",
      "while",
    ]);
    return reserved.has(word);
  }
}
