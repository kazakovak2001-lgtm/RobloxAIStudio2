/**
 * LuaNamingValidator.ts — Validates Lua identifier naming.
 */

import type { BuiltLuaFile } from "../builders/ServerScriptBuilder";

const LUA_RESERVED = new Set([
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
const VALID_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export interface NamingValidationResult {
  valid: boolean;
  errors: string[];
  duplicates: string[];
}

export class LuaNamingValidator {
  validate(files: BuiltLuaFile[]): NamingValidationResult {
    const errors: string[] = [];
    const names = new Map<string, string>(); // name → path
    const duplicates: string[] = [];

    for (const file of files) {
      const fileName =
        file.path
          .split("/")
          .pop()
          ?.replace(/\.lua$/, "") ?? "";
      if (fileName && !VALID_IDENT.test(fileName)) {
        errors.push(`Invalid file name "${fileName}" in ${file.path}`);
      }
      if (LUA_RESERVED.has(fileName.toLowerCase())) {
        errors.push(`Reserved word used as file name: "${fileName}"`);
      }
      if (names.has(fileName)) {
        duplicates.push(
          `Duplicate module name "${fileName}": ${names.get(fileName)} and ${file.path}`,
        );
      }
      names.set(fileName, file.path);
    }

    return {
      valid: errors.length === 0 && duplicates.length === 0,
      errors,
      duplicates,
    };
  }
}
