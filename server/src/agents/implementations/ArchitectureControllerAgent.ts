/**
 * ArchitectureControllerAgent — Architecture validation with LLM reasoning.
 *
 * Extends BaseAgent (v1) following the existing agent pattern.
 * Uses existing ImportBoundaryValidator and GovernancePolicyEngine
 * to gather data, then applies LLM reasoning for actionable recommendations.
 */

import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import type { AgentInput } from "../../types";
import { ImportBoundaryValidator } from "../../core/architecture/ImportBoundaryValidator";

export class ArchitectureControllerAgent extends BaseAgent {
  public readonly name = "ArchitectureController";
  public readonly description =
    "Validates project architecture, detects violations, and provides LLM-powered fix recommendations";

  public readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      action: { type: "string", enum: ["scan", "explain", "recommend"] },
      file: { type: "string" },
    },
    required: ["action"],
  };

  public readonly outputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      architecture: { type: "object" },
    },
    required: ["architecture"],
  };

  private validator: ImportBoundaryValidator;

  constructor(config?: Partial<AgentConfig>) {
    super(config);
    this.validator = new ImportBoundaryValidator(process.cwd());
  }

  protected async process(input: AgentInput): Promise<Record<string, unknown>> {
    const action = (input.action as string) ?? "scan";

    switch (action) {
      case "scan":
        return this.runScan();
      case "explain":
        return this.explainViolations();
      case "recommend":
        return this.getRecommendations(input);
      default:
        return this.runScan();
    }
  }

  private runScan(): Record<string, unknown> {
    const result = this.validator.scanProject();

    return {
      architecture: {
        status: result.violations.length === 0 ? "healthy" : "violations_found",
        filesScanned: result.filesScanned,
        importsAnalyzed: result.importsAnalyzed,
        violations: result.violations.map((v) => ({
          file: v.file,
          import: v.importPath,
          from: v.sourceDomain,
          to: v.targetDomain,
          rule: v.rule,
          severity: v.severity,
          message: v.message,
        })),
        circularDependencies: result.circularDeps,
        edgeCount: result.edges.length,
      },
    };
  }

  private async explainViolations(): Promise<Record<string, unknown>> {
    const result = this.validator.scanProject();

    if (result.violations.length === 0) {
      return {
        architecture: {
          status: "healthy",
          explanation:
            "No architecture violations detected. All import boundaries are respected.",
          recommendations: [],
        },
      };
    }

    const violationSummary = result.violations
      .slice(0, 10)
      .map(
        (v) =>
          `[${v.severity}] ${v.file}: ${v.sourceDomain} → ${v.targetDomain} (${v.rule})`,
      )
      .join("\n");

    if (!this.llm) {
      return {
        architecture: {
          status: "violations_found",
          explanation: `Found ${result.violations.length} violation(s). LLM unavailable for detailed analysis.`,
          violations: result.violations.slice(0, 10),
          recommendations: [
            "Fix import boundaries manually based on architecture.manifest.json rules",
          ],
        },
      };
    }

    const prompt =
      "You are a software architect. Explain these architecture violations and suggest fixes.\n\n" +
      `Violations:\n${violationSummary}\n\n` +
      'Respond with JSON: { "architecture": { "status": "violations_found", "explanation": string, "recommendations": string[] } }';

    return this.generateWithRetry(
      prompt,
      ["architecture"],
      {
        architecture: {
          status: "violations_found",
          explanation: `${result.violations.length} violation(s) found`,
          recommendations: [
            "Review architecture.manifest.json for boundary rules",
          ],
        },
      },
      { temperature: 0.3, maxTokens: 800 },
    );
  }

  private async getRecommendations(
    input: AgentInput,
  ): Promise<Record<string, unknown>> {
    const file = input.file as string | undefined;
    const result = this.validator.scanProject();

    const context = file
      ? `Focus on file: ${file}\n`
      : `Project has ${result.filesScanned} files across ${result.edges.length} domain edges.\n`;

    if (!this.llm) {
      return {
        architecture: {
          recommendations: [
            "Run npm run validate:boundaries to check import rules",
            "Check architecture.manifest.json for domain boundaries",
            result.circularDeps.length > 0
              ? `Resolve ${result.circularDeps.length} circular dependencies`
              : "No circular dependencies detected",
          ],
        },
      };
    }

    const prompt =
      "You are a software architect for a Roblox AI Studio platform.\n" +
      `${context}` +
      `Circular deps: ${result.circularDeps.length}\n` +
      `Violations: ${result.violations.length}\n\n` +
      "Provide actionable architecture improvement recommendations.\n" +
      'Respond with JSON: { "architecture": { "recommendations": string[], "techDebt": string[], "priority": string } }';

    return this.generateWithRetry(
      prompt,
      ["architecture"],
      {
        architecture: {
          recommendations: ["No specific recommendations without LLM analysis"],
          techDebt: [],
          priority: "low",
        },
      },
      { temperature: 0.4, maxTokens: 600 },
    );
  }
}
