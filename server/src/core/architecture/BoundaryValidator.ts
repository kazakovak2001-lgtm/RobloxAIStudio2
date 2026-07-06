/**
 * BoundaryValidator.ts
 *
 * Core rule engine for architecture boundary enforcement.
 * Validates file placement, import direction, and runtime isolation.
 */

import {
  resolveBoundary,
  FRONTEND_RULES,
  BACKEND_RULES,
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

    if (zone === "frontend") {
      this.validateFrontend(filePath, importStatements, violations);
    } else if (zone === "backend") {
      this.validateBackend(filePath, importStatements, violations);
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

  private validateFrontend(
    filePath: string,
    imports: string[],
    violations: BoundaryViolation[],
  ): void {
    for (const imp of imports) {
      // Frontend must not import from server/src
      if (imp.includes("server/src") || imp.match(/\.\.\/.*server\/src/)) {
        violations.push({
          file: filePath,
          zone: "frontend",
          rule: "NO_BACKEND_IMPORT",
          severity: "critical",
          message: `Frontend file imports backend module: "${imp}"`,
        });
      }
      // Frontend must not use Node-only modules
      for (const forbidden of FRONTEND_RULES.forbiddenImports) {
        if (forbidden.includes("*")) {
          const prefix = forbidden.replace("*", "").replace("/**", "");
          if (imp.startsWith(prefix)) {
            violations.push({
              file: filePath,
              zone: "frontend",
              rule: "NO_NODE_RUNTIME",
              severity: "critical",
              message: `Frontend file imports Node-only module: "${imp}"`,
            });
          }
        } else if (imp === forbidden || imp.startsWith(forbidden + "/")) {
          violations.push({
            file: filePath,
            zone: "frontend",
            rule: "NO_BACKEND_RUNTIME",
            severity: "critical",
            message: `Frontend file imports backend runtime: "${imp}"`,
          });
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
              message: `Backend file imports frontend module: "${imp}"`,
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
