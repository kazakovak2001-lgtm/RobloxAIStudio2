/**
 * DecisionMemory.ts — Architectural decision tracking and retrieval.
 *
 * Stores and queries architectural decisions from:
 * - Existing docs/00-project-control/DECISION_LOG.md (parsed on init)
 * - Runtime decisions made by the AI controller
 * - AI_DEVELOPMENT_GOVERNANCE.md rules (parsed as standing decisions)
 *
 * Does NOT duplicate documentation. Parses existing files as the source of truth.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ArchitecturalDecision {
  id: string;
  title: string;
  date: string;
  decision: string;
  reason: string;
  affectedModules: string[];
  alternatives?: string[];
  consequences?: string[];
  status: "active" | "superseded" | "deprecated";
  source: "decision-log" | "governance" | "runtime";
}

export interface GovernanceRule {
  id: string;
  rule: string;
  category: "architecture" | "development" | "security" | "process";
  mandatory: boolean;
}

export interface DecisionSearchResult {
  decision: ArchitecturalDecision;
  relevance: number;
  matchReason: string;
}

// ─── Implementation ─────────────────────────────────────────────────────────

export class DecisionMemory {
  private decisions: Map<string, ArchitecturalDecision> = new Map();
  private rules: GovernanceRule[] = [];
  private rootDir: string;

  constructor(rootDir?: string) {
    this.rootDir = rootDir ?? process.cwd();
  }

  /**
   * Initialize by parsing existing documentation.
   */
  initialize(): void {
    this.parseDecisionLog();
    this.parseGovernanceRules();
  }

  // ─── Parsers ──────────────────────────────────────────────────────────────

  private parseDecisionLog(): void {
    const logPath = join(
      this.rootDir,
      "docs",
      "00-project-control",
      "DECISION_LOG.md",
    );
    if (!existsSync(logPath)) return;

    const content = readFileSync(logPath, "utf-8");
    // Fix #5: Split on ## YYYY-MM-DD headers instead of --- separators
    // to correctly capture all decision entries.
    const entries = content
      .split(/\n(?=## \d{4}-\d{2}-\d{2})/)
      .filter((s) => s.trim().length > 0);

    for (const entry of entries) {
      const titleMatch = entry.match(/##\s+(\d{4}-\d{2}-\d{2})\s+[—–-]\s+(.+)/);
      if (!titleMatch) continue;

      const date = titleMatch[1];
      const title = titleMatch[2].trim();
      const id = `dl-${date}-${title.replace(/\W+/g, "-").toLowerCase().slice(0, 30)}`;

      const decisionMatch = entry.match(/\*\*Decision\*\*:\s*(.+?)(?:\n|$)/);
      const reasonMatch = entry.match(/\*\*Reason\*\*:\s*(.+?)(?:\n\*\*|$)/s);
      const filesMatch = entry.match(
        /\*\*Files (?:modified|created)\*\*:\s*(.+?)(?:\n\*\*|$)/s,
      );

      const affectedModules: string[] = [];
      if (filesMatch) {
        const files = filesMatch[1]
          .split(/[,;]/)
          .map((f) => f.trim().replace(/`/g, ""));
        affectedModules.push(...files.filter((f) => f.length > 0));
      }

      this.decisions.set(id, {
        id,
        title,
        date,
        decision: decisionMatch?.[1]?.trim() ?? title,
        reason: reasonMatch?.[1]?.trim().split("\n")[0] ?? "",
        affectedModules,
        status: "active",
        source: "decision-log",
      });
    }
  }

  private parseGovernanceRules(): void {
    const govPath = join(this.rootDir, "AI_DEVELOPMENT_GOVERNANCE.md");
    if (!existsSync(govPath)) return;

    const content = readFileSync(govPath, "utf-8");

    // Extract numbered architecture rules
    const archSection = content.match(
      /## 2\. Architecture Rules([\s\S]*?)(?=\n## )/,
    );
    if (archSection) {
      const rules = archSection[1].matchAll(
        /(\d+)\.\s+\*\*(.+?)\.\*\*\s*(.+)/g,
      );
      for (const match of rules) {
        this.rules.push({
          id: `gov-arch-${match[1]}`,
          rule: `${match[2]}. ${match[3]}`,
          category: "architecture",
          mandatory: true,
        });

        // Also store as a standing decision
        this.decisions.set(`gov-arch-${match[1]}`, {
          id: `gov-arch-${match[1]}`,
          title: match[2],
          date: "2026-07-01",
          decision: match[3].trim(),
          reason: "AI Development Governance — mandatory rule",
          affectedModules: ["all"],
          status: "active",
          source: "governance",
        });
      }
    }

    // Extract development rules table
    const devSection = content.match(
      /## 3\. Development Rules([\s\S]*?)(?=\n## )/,
    );
    if (devSection) {
      const rows = devSection[1].matchAll(/\|\s*(.+?)\s*\|\s*(.+?)\s*\|/g);
      let ruleIdx = 0;
      for (const match of rows) {
        if (match[1].includes("---") || match[1].includes("Rule")) continue;
        ruleIdx++;
        this.rules.push({
          id: `gov-dev-${ruleIdx}`,
          rule: `${match[1].trim()}: ${match[2].trim()}`,
          category: "development",
          mandatory: true,
        });
      }
    }
  }

  // ─── Runtime Decision Recording ──────────────────────────────────────────

  /**
   * Record a new architectural decision at runtime.
   */
  record(decision: Omit<ArchitecturalDecision, "id" | "source">): string {
    const id = `rt-${Date.now()}-${decision.title.replace(/\W+/g, "-").toLowerCase().slice(0, 20)}`;
    this.decisions.set(id, { ...decision, id, source: "runtime" });
    return id;
  }

  // ─── Query API ────────────────────────────────────────────────────────────

  /**
   * Search decisions by keyword/topic.
   */
  search(query: string): DecisionSearchResult[] {
    const normalized = query.toLowerCase();
    const results: DecisionSearchResult[] = [];

    for (const decision of this.decisions.values()) {
      let relevance = 0;
      let matchReason = "";

      if (decision.title.toLowerCase().includes(normalized)) {
        relevance += 50;
        matchReason = "title match";
      }
      if (decision.decision.toLowerCase().includes(normalized)) {
        relevance += 40;
        matchReason = matchReason || "decision text match";
      }
      if (decision.reason.toLowerCase().includes(normalized)) {
        relevance += 30;
        matchReason = matchReason || "reason match";
      }
      for (const mod of decision.affectedModules) {
        if (mod.toLowerCase().includes(normalized)) {
          relevance += 35;
          matchReason = matchReason || `affected module: ${mod}`;
          break;
        }
      }

      if (relevance > 0) {
        results.push({ decision, relevance, matchReason });
      }
    }

    return results.sort((a, b) => b.relevance - a.relevance).slice(0, 10);
  }

  /**
   * Find decisions related to a specific module/file.
   */
  getDecisionsForModule(modulePath: string): ArchitecturalDecision[] {
    const normalized = modulePath.toLowerCase();
    return [...this.decisions.values()].filter((d) =>
      d.affectedModules.some(
        (m) =>
          m.toLowerCase().includes(normalized) ||
          normalized.includes(m.toLowerCase()),
      ),
    );
  }

  /**
   * Check if a governance rule applies to a given action.
   */
  checkGovernanceRules(action: string): GovernanceRule[] {
    const normalized = action.toLowerCase();
    return this.rules.filter(
      (r) =>
        r.rule.toLowerCase().includes(normalized) ||
        normalized.includes(r.category),
    );
  }

  /**
   * "Has this type of decision already been made?"
   * Returns relevant prior decisions for a proposed change.
   */
  findPriorDecisions(intent: string): {
    priorDecisions: DecisionSearchResult[];
    applicableRules: GovernanceRule[];
    recommendation: string;
  } {
    const priorDecisions = this.search(intent);
    const applicableRules = this.checkGovernanceRules(intent);

    let recommendation: string;
    if (priorDecisions.length > 0 && priorDecisions[0].relevance >= 40) {
      const top = priorDecisions[0].decision;
      recommendation =
        `Prior decision exists: "${top.title}" (${top.date}). ` +
        `Decision was: ${top.decision.slice(0, 100)}...`;
    } else if (applicableRules.length > 0) {
      recommendation =
        `No direct prior decision, but ${applicableRules.length} governance rule(s) apply: ` +
        applicableRules
          .slice(0, 2)
          .map((r) => r.rule.slice(0, 60))
          .join("; ");
    } else {
      recommendation =
        "No prior decisions or rules found for this topic. Proceed with documentation.";
    }

    return { priorDecisions, applicableRules, recommendation };
  }

  // ─── Statistics ───────────────────────────────────────────────────────────

  getStats(): {
    totalDecisions: number;
    totalRules: number;
    bySource: Record<string, number>;
  } {
    const bySource: Record<string, number> = {};
    for (const d of this.decisions.values()) {
      bySource[d.source] = (bySource[d.source] ?? 0) + 1;
    }
    return {
      totalDecisions: this.decisions.size,
      totalRules: this.rules.length,
      bySource,
    };
  }

  getAllDecisions(): ArchitecturalDecision[] {
    return [...this.decisions.values()];
  }

  getRules(): GovernanceRule[] {
    return [...this.rules];
  }
}
