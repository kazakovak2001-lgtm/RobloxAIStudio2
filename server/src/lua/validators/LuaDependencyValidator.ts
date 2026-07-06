/**
 * LuaDependencyValidator.ts — Validates require dependencies between Lua files.
 */

import type { BuiltLuaFile } from "../builders/ServerScriptBuilder";

export interface DependencyValidationResult {
  valid: boolean;
  missingRequires: string[];
  errors: string[];
}

export class LuaDependencyValidator {
  validate(files: BuiltLuaFile[]): DependencyValidationResult {
    const errors: string[] = [];
    const missingRequires: string[] = [];
    const knownModules = new Set(
      files.map(
        (f) =>
          f.path
            .split("/")
            .pop()
            ?.replace(/\.lua$/, "") ?? "",
      ),
    );

    for (const file of files) {
      const requires = file.content.match(/require\([^)]*"([^"]+)"\)/g) ?? [];
      for (const req of requires) {
        const match = req.match(/"([^"]+)"/);
        if (match) {
          const modName = match[1];
          if (!knownModules.has(modName) && !modName.includes(".")) {
            missingRequires.push(
              `${file.path}: requires "${modName}" (not found)`,
            );
          }
        }
      }
    }

    if (missingRequires.length > 0) {
      errors.push(`${missingRequires.length} unresolved require(s)`);
    }

    return { valid: errors.length === 0, missingRequires, errors };
  }
}
