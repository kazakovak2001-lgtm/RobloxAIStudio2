/**
 * GovernanceValidator.ts
 *
 * Verifies that the repository meets all governance standards:
 *   - Required documents exist
 *   - Required reports exist
 *   - Governance file exists and is non-empty
 *   - Folder structure integrity
 *   - Repository manifest exists
 *
 * No business logic. No runtime dependencies.
 * Pure filesystem checks against governance requirements.
 */

import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";

export interface GovernanceCheck {
  name: string;
  category: "document" | "report" | "structure" | "manifest";
  passed: boolean;
  path: string;
  detail?: string;
}

export interface GovernanceValidationReport {
  timestamp: number;
  status: "COMPLIANT" | "NON-COMPLIANT" | "PARTIAL";
  totalChecks: number;
  passed: number;
  failed: number;
  checks: GovernanceCheck[];
}

export class GovernanceValidator {
  private rootDir: string;

  constructor(rootDir?: string) {
    this.rootDir = rootDir ?? process.cwd();
  }

  /**
   * Run full governance validation.
   */
  validate(): GovernanceValidationReport {
    const checks: GovernanceCheck[] = [
      ...this.checkDocuments(),
      ...this.checkReports(),
      ...this.checkStructure(),
      ...this.checkManifest(),
    ];

    const passed = checks.filter((c) => c.passed).length;
    const failed = checks.filter((c) => !c.passed).length;
    const status =
      failed === 0 ? "COMPLIANT" : failed <= 2 ? "PARTIAL" : "NON-COMPLIANT";

    return {
      timestamp: Date.now(),
      status,
      totalChecks: checks.length,
      passed,
      failed,
      checks,
    };
  }

  /**
   * Export validation report as JSON.
   */
  exportJson(): string {
    return JSON.stringify(this.validate(), null, 2);
  }

  // ─── Document Checks ──────────────────────────────────────────────────

  private checkDocuments(): GovernanceCheck[] {
    const required = [
      {
        name: "AI Development Governance",
        path: "AI_DEVELOPMENT_GOVERNANCE.md",
      },
      {
        name: "Development Workflow",
        path: "docs/development/DEVELOPMENT_WORKFLOW.md",
      },
      { name: "Versioning Guide", path: "docs/development/VERSIONING.md" },
      {
        name: "Validation Process",
        path: "docs/development/VALIDATION_PROCESS.md",
      },
      {
        name: "Architecture Rules",
        path: "docs/development/ARCHITECTURE_RULES.md",
      },
      { name: "Architecture Manifest", path: "architecture.manifest.json" },
    ];

    return required.map((doc) => {
      const fullPath = join(this.rootDir, doc.path);
      const exists = existsSync(fullPath);
      let detail: string | undefined;

      if (exists) {
        const stat = statSync(fullPath);
        if (stat.size < 50) {
          detail = "File exists but appears empty or too small";
        }
      }

      return {
        name: doc.name,
        category: "document" as const,
        passed: exists && !detail,
        path: doc.path,
        detail: exists ? detail : "File not found",
      };
    });
  }

  // ─── Report Checks ────────────────────────────────────────────────────

  private checkReports(): GovernanceCheck[] {
    const checks: GovernanceCheck[] = [];

    // Check reports directory exists
    const reportsDir = join(this.rootDir, "reports");
    const reportsExist =
      existsSync(reportsDir) && statSync(reportsDir).isDirectory();
    checks.push({
      name: "Reports directory",
      category: "report",
      passed: reportsExist,
      path: "reports/",
      detail: reportsExist ? undefined : "reports/ directory not found",
    });

    // Check for at least one version report
    if (reportsExist) {
      const { readdirSync } = require("fs") as typeof import("fs");
      const reportFiles = readdirSync(reportsDir).filter(
        (f: string) => f.endsWith(".md") || f.endsWith(".json"),
      );
      checks.push({
        name: "Version reports exist",
        category: "report",
        passed: reportFiles.length > 0,
        path: "reports/",
        detail:
          reportFiles.length > 0
            ? `${reportFiles.length} report(s) found`
            : "No reports found",
      });
    }

    return checks;
  }

  // ─── Structure Checks ─────────────────────────────────────────────────

  private checkStructure(): GovernanceCheck[] {
    const requiredDirs = [
      { name: "Frontend root", path: "src" },
      { name: "Backend root", path: "server/src" },
      { name: "Shared types", path: "shared" },
      { name: "Scripts", path: "scripts" },
      { name: "Core module", path: "server/src/core" },
      { name: "Planning module", path: "server/src/planning" },
      { name: "Runtime module", path: "server/src/runtime" },
      { name: "API module", path: "server/src/api" },
      { name: "Agents module", path: "server/src/agents" },
    ];

    return requiredDirs.map((dir) => {
      const fullPath = join(this.rootDir, dir.path);
      const exists = existsSync(fullPath) && statSync(fullPath).isDirectory();
      return {
        name: dir.name,
        category: "structure" as const,
        passed: exists,
        path: dir.path,
        detail: exists ? undefined : "Directory not found",
      };
    });
  }

  // ─── Manifest Checks ──────────────────────────────────────────────────

  private checkManifest(): GovernanceCheck[] {
    const checks: GovernanceCheck[] = [];

    const manifestPath = join(this.rootDir, "repository_manifest.json");
    const exists = existsSync(manifestPath);
    checks.push({
      name: "Repository manifest",
      category: "manifest",
      passed: exists,
      path: "repository_manifest.json",
      detail: exists ? undefined : "repository_manifest.json not found",
    });

    if (exists) {
      try {
        const content = readFileSync(manifestPath, "utf-8");
        const manifest = JSON.parse(content);
        const hasVersion = typeof manifest.version === "string";
        checks.push({
          name: "Manifest has version field",
          category: "manifest",
          passed: hasVersion,
          path: "repository_manifest.json",
          detail: hasVersion
            ? `Version: ${manifest.version}`
            : "Missing version field",
        });
      } catch (err) {
        checks.push({
          name: "Manifest is valid JSON",
          category: "manifest",
          passed: false,
          path: "repository_manifest.json",
          detail: "Failed to parse JSON",
        });
      }
    }

    return checks;
  }
}
