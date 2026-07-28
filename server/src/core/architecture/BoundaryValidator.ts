/**
 * BoundaryValidator.ts
 *
 * Core rule engine for architecture boundary enforcement.
 * Validates file placement, import direction, and runtime isolation.
 */

import {
  resolveBoundary,
  BACKEND_RULES,
  STUDIO_PLUGIN_RULES,
  type BoundaryZone,
} from "./ArchitecturePolicy";

export interface BoundaryViolation {
  file: string;
  zone: BoundaryZone;
  rule: string;
  severity: "warning" | "critical";
  message: string;
}

export class BoundaryValidator {
  /**
   * Validate a file's placement and content against boundary rules.
   */
  validateFile(
    filePath: string,
    importStatements: string[] = [],
  ): BoundaryViolation[] {
    const violations: BoundaryViolation[] = [];
    const zone = resolveBoundary(filePath);

    if (zone === "backend") {
      this.validateBackend(filePath, importStatements, violations);
    } else if (zone === "studio-plugin") {
      this.validateStudioPlugin(filePath, importStatements, violations);
    }

    return violations;
  }

  /**
   * Validate a batch of files.
   */
  validateFiles(
    files: Array<{ path: string; imports: string[] }>,
  ): BoundaryViolation[] {
    const allViolations: BoundaryViolation[] = [];
    for (const file of files) {
      allViolations.push(...this.validateFile(file.path, file.imports));
    }
    return allViolations;
  }

  /**
   * Check if a proposed file path is allowed in its target zone.
   */
  isPathAllowed(filePath: string): { allowed: boolean; reason?: string } {
    const zone = resolveBoundary(filePath);
    if (zone === "unknown") {
      return {
        allowed: false,
        reason: `File "${filePath}" is outside all defined boundary zones`,
      };
    }
    return { allowed: true };
  }

  private validateStudioPlugin(
    filePath: string,
    imports: string[],
    violations: BoundaryViolation[],
  ): void {
    for (const imp of imports) {
      for (const forbidden of STUDIO_PLUGIN_RULES.forbiddenImports) {
        if (forbidden.includes("*")) {
          const prefix = forbidden.replace(/\*\*/g, "").replace(/\*/g, "");
          if (imp.includes(prefix)) {
            violations.push({
              file: filePath,
              zone: "studio-plugin",
              rule: "STUDIO_RUNTIME_ISOLATION",
              severity: "critical",
              message: `Studio plugin imports a local application source zone: "${imp}"`,
            });
          }
        }
      }
    }
  }

  private validateBackend(
    filePath: string,
    imports: string[],
    violations: BoundaryViolation[],
  ): void {
    for (const imp of imports) {
      for (const forbidden of BACKEND_RULES.forbiddenImports) {
        if (forbidden.includes("*")) {
          const pattern = forbidden.replace(/\*\*/g, "").replace(/\*/g, "");
          if (imp.includes(pattern)) {
            violations.push({
              file: filePath,
              zone: "backend",
              rule: "NO_FRONTEND_IMPORT",
              severity: "critical",
              message: `Backend file imports removed frontend module: "${imp}"`,
            });
          }
        } else if (imp === forbidden || imp.startsWith(forbidden)) {
          violations.push({
            file: filePath,
            zone: "backend",
            rule: "NO_BROWSER_RUNTIME",
            severity: "critical",
            message: `Backend file imports browser runtime: "${imp}"`,
          });
        }
      }
    }
  }
}
