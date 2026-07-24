/**
 * ProductionAuditService.ts — Audits platform readiness for production.
 */

import { existsSync } from "fs";
import { join } from "path";

export interface AuditCheck {
  name: string;
  passed: boolean;
  detail?: string;
}
export interface ProductionAuditReport {
  status: "READY" | "NOT_READY";
  checks: AuditCheck[];
  passed: number;
  failed: number;
  timestamp: number;
}

export class ProductionAuditService {
  private rootDir: string;
  constructor(rootDir?: string) {
    this.rootDir = rootDir ?? process.cwd();
  }

  audit(): ProductionAuditReport {
    const checks: AuditCheck[] = [];

    // Architecture
    checks.push(
      this.checkFile("AI_DEVELOPMENT_GOVERNANCE.md", "Governance document"),
    );
    checks.push(
      this.checkFile("architecture.manifest.json", "Architecture manifest"),
    );
    checks.push(
      this.checkFile("repository_manifest.json", "Repository manifest"),
    );
    checks.push(this.checkDir("server/src/core", "Core module"));
    checks.push(this.checkDir("server/src/planning", "Planning module"));
    checks.push(this.checkDir("server/src/runtime", "Runtime module"));
    checks.push(this.checkDir("server/src/jobs", "Job engine"));
    checks.push(
      this.checkDir("server/src/generation/engine", "Generation engine"),
    );
    checks.push(
      this.checkDir(
        "server/src/generation/coordinator",
        "Generation coordinator",
      ),
    );
    checks.push(this.checkDir("server/src/lua", "Lua engine"));
    checks.push(this.checkDir("server/src/assets", "Asset engine"));
    checks.push(this.checkDir("server/src/ui-gen", "UI engine"));
    checks.push(
      this.checkDir("server/src/agents/orchestrator", "Agent orchestrator"),
    );
    checks.push(this.checkDir("server/src/providers/ai", "Provider layer"));
    checks.push(this.checkDir("server/src/memory/knowledge", "Memory system"));
    checks.push(
      this.checkDir("server/src/studio/integration", "Studio integration"),
    );
    checks.push(
      this.checkDir("server/src/integration", "Platform integration"),
    );
    checks.push(this.checkDir("server/src/api", "API gateway"));
    checks.push(this.checkDir("src/shared", "Shared contracts"));
    checks.push(this.checkDir("reports", "Reports directory"));
    checks.push(this.checkDir("docs/development", "Development docs"));
    checks.push(
      this.checkFile(
        "scripts/validate-architecture.ts",
        "Architecture validator",
      ),
    );
    checks.push(
      this.checkFile("scripts/validate-boundaries.ts", "Boundary validator"),
    );

    const passed = checks.filter((c) => c.passed).length;
    const failed = checks.filter((c) => !c.passed).length;

    return {
      status: failed === 0 ? "READY" : "NOT_READY",
      checks,
      passed,
      failed,
      timestamp: Date.now(),
    };
  }

  private checkFile(path: string, name: string): AuditCheck {
    const exists = existsSync(join(this.rootDir, path));
    return { name, passed: exists, detail: exists ? path : `Missing: ${path}` };
  }

  private checkDir(path: string, name: string): AuditCheck {
    const exists = existsSync(join(this.rootDir, path));
    return { name, passed: exists, detail: exists ? path : `Missing: ${path}` };
  }
}
