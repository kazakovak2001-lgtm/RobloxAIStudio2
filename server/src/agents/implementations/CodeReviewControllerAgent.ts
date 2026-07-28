/**
 * CodeReviewControllerAgent — Automated code review with Engineering Handbook rules.
 *
 * Extends BaseAgent (v1) following the existing agent pattern.
 * Analyzes code changes and generates review reports based on
 * project standards defined in the Engineering Handbook.
 */

import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import type { AgentInput } from "../../types";

/** Engineering Handbook rules (hardcoded subset for automated checking) */
const REVIEW_RULES = [
  {
    id: "R1",
    category: "imports",
    rule: "Use relative backend imports; the retired @/ frontend alias is forbidden",
  },
  {
    id: "R2",
    category: "imports",
    rule: "Use relative imports within same feature",
  },
  {
    id: "R3",
    category: "naming",
    rule: "PascalCase for components/types, camelCase for functions/variables",
  },
  {
    id: "R4",
    category: "structure",
    rule: "Local source belongs in server/src/ or studio-plugin/src/",
  },
  {
    id: "R5",
    category: "types",
    rule: "Use interface for objects, type for unions",
  },
  {
    id: "R6",
    category: "exports",
    rule: "Named exports for reusable modules, default for pages",
  },
  {
    id: "R7",
    category: "performance",
    rule: "React.memo for performance-sensitive components",
  },
  { id: "R8", category: "security", rule: "No hardcoded secrets or API keys" },
  {
    id: "R9",
    category: "duplication",
    rule: "Check for existing implementations before creating new",
  },
  { id: "R10", category: "docs", rule: "Public APIs must have JSDoc comments" },
];

export class CodeReviewControllerAgent extends BaseAgent {
  public readonly name = "CodeReviewController";
  public readonly description =
    "Analyzes code changes against Engineering Handbook rules and provides review feedback";

  public readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      code: { type: "string" },
      filePath: { type: "string" },
      diff: { type: "string" },
    },
    required: ["code"],
  };

  public readonly outputSchema: Record<string, unknown> = {
    type: "object",
    properties: { review: { type: "object" } },
    required: ["review"],
  };

  constructor(config?: Partial<AgentConfig>) {
    super(config);
  }

  protected async process(input: AgentInput): Promise<Record<string, unknown>> {
    const code = (input.code as string) ?? "";
    const filePath = (input.filePath as string) ?? "unknown";
    const diff = input.diff as string | undefined;

    // Static analysis (rule-based, no LLM needed)
    const staticFindings = this.runStaticChecks(code, filePath);

    // LLM-powered review (if available)
    const llmReview = await this.runLLMReview(code, filePath, diff);

    return {
      review: {
        filePath,
        staticFindings,
        llmReview,
        score: this.calculateScore(staticFindings),
        rulesChecked: REVIEW_RULES.length,
        timestamp: new Date().toISOString(),
      },
    };
  }

  private runStaticChecks(
    code: string,
    filePath: string,
  ): Array<{ rule: string; passed: boolean; detail?: string }> {
    const findings: Array<{ rule: string; passed: boolean; detail?: string }> =
      [];

    // R1: The @/ alias resolved into the removed root frontend.
    if (
      filePath.startsWith("server/src/") ||
      filePath.startsWith("studio-plugin/src/")
    ) {
      const hasRetiredAlias = /(?:from\s+|import\s*(?:\(\s*)?)["']@\//.test(
        code,
      );
      findings.push({
        rule: "R1",
        passed: !hasRetiredAlias,
        detail: hasRetiredAlias
          ? "Found retired @/ frontend alias — use a valid local relative import"
          : undefined,
      });
    }

    // R3: Naming (check exported functions)
    const exportedFunctions = code.matchAll(/export\s+function\s+([A-Z]\w+)/g);
    for (const match of exportedFunctions) {
      if (
        match[1][0] === match[1][0].toUpperCase() &&
        !filePath.includes("components")
      ) {
        findings.push({
          rule: "R3",
          passed: false,
          detail: `Function ${match[1]} uses PascalCase but is not a component`,
        });
      }
    }

    // R8: Security — no hardcoded secrets
    const secretPatterns = [
      /["']sk-[a-zA-Z0-9]{20,}["']/,
      /["']sk-ant-[a-zA-Z0-9]+["']/,
      /password\s*=\s*["'][^"']+["']/i,
      /api[_-]?key\s*[:=]\s*["'][^"']+["']/i,
    ];
    for (const pattern of secretPatterns) {
      if (pattern.test(code)) {
        findings.push({
          rule: "R8",
          passed: false,
          detail: "Potential hardcoded secret detected",
        });
        break;
      }
    }

    // R10: JSDoc on exports
    const exportCount = (
      code.match(/export\s+(function|class|const|interface)/g) ?? []
    ).length;
    const jsdocCount = (code.match(/\/\*\*[\s\S]*?\*\/\s*\nexport/g) ?? [])
      .length;
    if (exportCount > 0 && jsdocCount < exportCount * 0.5) {
      findings.push({
        rule: "R10",
        passed: false,
        detail: `${exportCount - jsdocCount} of ${exportCount} exports lack JSDoc`,
      });
    }

    return findings;
  }

  private async runLLMReview(
    code: string,
    filePath: string,
    diff?: string,
  ): Promise<{
    summary: string;
    issues: string[];
    suggestions: string[];
  } | null> {
    if (!this.llm) return null;

    const codeSnippet =
      code.length > 2000 ? code.slice(0, 2000) + "\n// ... truncated" : code;
    const context = diff ? `\nDiff:\n${diff.slice(0, 1000)}` : "";

    const prompt =
      "You are a senior TypeScript code reviewer for a Roblox AI Studio project.\n" +
      "Review this code for quality, correctness, and adherence to best practices.\n\n" +
      `File: ${filePath}\n${context}\n\nCode:\n\`\`\`typescript\n${codeSnippet}\n\`\`\`\n\n` +
      'Respond with JSON: { "review": { "summary": string, "issues": string[], "suggestions": string[] } }';

    try {
      const result = await this.generateWithRetry(
        prompt,
        ["review"],
        {
          review: {
            summary: "LLM review unavailable",
            issues: [],
            suggestions: [],
          },
        },
        { temperature: 0.3, maxTokens: 800 },
      );
      return (
        (result.review as {
          summary: string;
          issues: string[];
          suggestions: string[];
        }) ?? null
      );
    } catch {
      return null;
    }
  }

  private calculateScore(findings: Array<{ passed: boolean }>): number {
    if (findings.length === 0) return 100;
    const passed = findings.filter((f) => f.passed).length;
    return Math.round((passed / findings.length) * 100);
  }
}
