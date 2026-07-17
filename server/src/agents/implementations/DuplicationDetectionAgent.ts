/**
 * DuplicationDetectionAgent — Pre-creation duplication detection.
 *
 * Extends BaseAgent (v1) following the existing agent pattern.
 * Searches existing codebase to find similar implementations
 * before new functionality is created.
 */

import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import type { AgentInput } from "../../types";
import {
  CodebaseKnowledge,
  type SearchResult,
} from "../../knowledge/CodebaseKnowledge";

export class DuplicationDetectionAgent extends BaseAgent {
  public readonly name = "DuplicationDetector";
  public readonly description =
    "Searches the codebase for existing implementations before new features are created";

  public readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      name: { type: "string" },
      description: { type: "string" },
      exports: { type: "array", items: { type: "string" } },
      category: { type: "string" },
    },
    required: ["name"],
  };

  public readonly outputSchema: Record<string, unknown> = {
    type: "object",
    properties: { duplication: { type: "object" } },
    required: ["duplication"],
  };

  private knowledge: CodebaseKnowledge | null = null;

  constructor(config?: Partial<AgentConfig>) {
    super(config);
  }

  /**
   * Inject a shared CodebaseKnowledge instance to avoid double-indexing.
   * Called by the controller route after indexing.
   */
  setKnowledge(knowledge: CodebaseKnowledge): void {
    this.knowledge = knowledge;
  }

  protected async process(input: AgentInput): Promise<Record<string, unknown>> {
    // Use injected instance or create/index locally as fallback
    if (!this.knowledge) {
      this.knowledge = new CodebaseKnowledge();
      this.knowledge.indexSourceTree();
    }

    const name = (input.name as string) ?? "";
    const description = (input.description as string) ?? "";
    const exports = (input.exports as string[]) ?? [];
    const category = input.category as string | undefined;

    // Check for duplicates by name
    const nameMatches = this.knowledge.checkDuplicate(name, exports);

    // Search by description
    const descMatches = description
      ? this.knowledge.search(description, category as any)
      : [];

    // Search by exports
    const exportMatches: SearchResult[] = [];
    for (const exp of exports.slice(0, 5)) {
      const results = this.knowledge.search(exp);
      exportMatches.push(...results);
    }

    // Deduplicate results
    const allMatches = this.deduplicateResults([
      ...nameMatches,
      ...descMatches,
      ...exportMatches,
    ]);

    const hasDuplicate = allMatches.some((m) => m.relevance >= 60);

    // Fix #6: Normalize confidence to max 100%
    const rawConfidence = allMatches.length > 0 ? allMatches[0].relevance : 0;
    const confidence = Math.min(100, rawConfidence);

    // LLM analysis if duplicates found and LLM available
    let recommendation: string;
    if (hasDuplicate && this.llm) {
      recommendation = await this.getLLMRecommendation(
        name,
        description,
        allMatches.slice(0, 5),
      );
    } else if (hasDuplicate) {
      recommendation = `DUPLICATE LIKELY: Found ${allMatches.length} similar implementation(s). Review before creating.`;
    } else {
      recommendation = "No significant duplicates found. Safe to create.";
    }

    return {
      duplication: {
        hasDuplicate,
        confidence,
        matches: allMatches.slice(0, 10).map((m) => ({
          path: m.file.path,
          name: m.file.name,
          category: m.file.category,
          relevance: Math.min(100, m.relevance),
          reason: m.matchReason,
          exports: m.file.exports.slice(0, 5),
        })),
        recommendation,
        stats: this.knowledge.getStats(),
      },
    };
  }

  private deduplicateResults(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    const unique: SearchResult[] = [];
    for (const result of results) {
      if (!seen.has(result.file.path)) {
        seen.add(result.file.path);
        unique.push(result);
      }
    }
    return unique.sort((a, b) => b.relevance - a.relevance);
  }

  private async getLLMRecommendation(
    name: string,
    description: string,
    matches: SearchResult[],
  ): Promise<string> {
    if (!this.llm) return "LLM unavailable for analysis";

    const matchSummary = matches
      .map(
        (m) =>
          `- ${m.file.path} (${m.file.category}, relevance: ${m.relevance}): ${m.matchReason}`,
      )
      .join("\n");

    const prompt =
      "You are a duplication detection system for a TypeScript project.\n" +
      `A developer wants to create: "${name}" — ${description}\n\n` +
      `These existing files were found as potential duplicates:\n${matchSummary}\n\n` +
      "Should the developer reuse an existing implementation or create a new one?\n" +
      "Respond with a brief recommendation (1-3 sentences).";

    try {
      const raw = await this.llm.generate(prompt, {
        temperature: 0.2,
        maxTokens: 200,
      });
      return raw.trim();
    } catch {
      return "LLM analysis failed. Manual review recommended.";
    }
  }
}
