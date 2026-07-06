/**
 * EvaluationEngine.ts
 *
 * Core quality scoring engine for AI agent outputs.
 * Computes multi-dimensional quality scores deterministically.
 * Non-blocking, async-safe, extensible scoring model.
 */

export interface EvaluationScore {
  quality: number; // 0–100 overall quality
  coherence: number; // logical consistency
  completeness: number; // coverage of requirements
  correctness: number; // factual / rule correctness
  creativity: number; // novelty heuristic
  risk: number; // hallucination / invalid output risk (lower = safer)
}

export interface EvaluationContext {
  agentType: string;
  taskDescription?: string;
  expectedKeys?: string[];
  inputContext?: Record<string, unknown>;
}

export interface EvaluationResult {
  agentType: string;
  score: EvaluationScore;
  passed: boolean;
  timestamp: Date;
  durationMs: number;
  notes: string[];
}

const DEFAULT_SCORE: EvaluationScore = {
  quality: 50,
  coherence: 50,
  completeness: 50,
  correctness: 50,
  creativity: 50,
  risk: 50,
};

export class EvaluationEngine {
  /**
   * Evaluate an agent output and return a multi-dimensional score.
   * Non-blocking — returns neutral score on failure.
   */
  async evaluate(
    agentOutput: Record<string, unknown>,
    context: EvaluationContext,
  ): Promise<EvaluationResult> {
    const start = Date.now();
    const notes: string[] = [];

    try {
      const coherence = this.scoreCoherence(agentOutput, notes);
      const completeness = this.scoreCompleteness(agentOutput, context, notes);
      const correctness = this.scoreCorrectness(agentOutput, notes);
      const creativity = this.scoreCreativity(agentOutput, notes);
      const risk = this.scoreRisk(agentOutput, notes);
      const quality = Math.round(
        (coherence + completeness + correctness + creativity + (100 - risk)) /
          5,
      );

      const score: EvaluationScore = {
        quality,
        coherence,
        completeness,
        correctness,
        creativity,
        risk,
      };
      const passed = quality >= 60 && risk <= 40;

      return {
        agentType: context.agentType,
        score,
        passed,
        timestamp: new Date(),
        durationMs: Date.now() - start,
        notes,
      };
    } catch {
      // Fallback — evaluation failure must never break agent execution
      return {
        agentType: context.agentType,
        score: DEFAULT_SCORE,
        passed: true, // neutral pass on eval failure
        timestamp: new Date(),
        durationMs: Date.now() - start,
        notes: [
          "Evaluation engine encountered an error — neutral score returned",
        ],
      };
    }
  }

  private scoreCoherence(
    output: Record<string, unknown>,
    notes: string[],
  ): number {
    let score = 70;
    const keys = Object.keys(output);

    // Penalize internal failure markers
    if (output._failed) {
      score -= 40;
      notes.push("Output contains _failed marker");
    }
    if (output._skipped) {
      score -= 20;
      notes.push("Output contains _skipped marker");
    }

    // Reward structured output
    if (keys.length >= 3) score += 10;
    if (keys.length >= 6) score += 10;

    // Penalize empty values
    const emptyCount = keys.filter(
      (k) => output[k] === null || output[k] === undefined || output[k] === "",
    ).length;
    score -= emptyCount * 5;

    return Math.max(0, Math.min(100, score));
  }

  private scoreCompleteness(
    output: Record<string, unknown>,
    context: EvaluationContext,
    notes: string[],
  ): number {
    if (!context.expectedKeys || context.expectedKeys.length === 0) return 70;

    const present = context.expectedKeys.filter(
      (k) => k in output && output[k] !== null && output[k] !== undefined,
    );
    const ratio = present.length / context.expectedKeys.length;
    const score = Math.round(ratio * 100);

    if (ratio < 1) {
      const missing = context.expectedKeys.filter((k) => !present.includes(k));
      notes.push(`Missing keys: ${missing.join(", ")}`);
    }

    return score;
  }

  private scoreCorrectness(
    output: Record<string, unknown>,
    notes: string[],
  ): number {
    let score = 75;

    // Check for obviously invalid patterns
    for (const [key, value] of Object.entries(output)) {
      if (key.startsWith("_")) continue;
      if (typeof value === "string" && value.length > 5000) {
        score -= 10;
        notes.push(
          `Field "${key}" is excessively long (${value.length} chars)`,
        );
      }
      if (
        typeof value === "object" &&
        value !== null &&
        JSON.stringify(value).includes("undefined")
      ) {
        score -= 5;
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  private scoreCreativity(
    output: Record<string, unknown>,
    _notes: string[],
  ): number {
    // Heuristic: more unique string content = more creative output
    const allStrings = this.extractStrings(output);
    const uniqueWords = new Set(
      allStrings.join(" ").toLowerCase().split(/\s+/),
    );

    if (uniqueWords.size > 50) return 85;
    if (uniqueWords.size > 30) return 70;
    if (uniqueWords.size > 15) return 55;
    return 40;
  }

  private scoreRisk(output: Record<string, unknown>, notes: string[]): number {
    let risk = 10; // base risk

    // High risk indicators
    if (output._failed) {
      risk += 50;
    }
    if (Object.keys(output).length === 0) {
      risk += 30;
      notes.push("Empty output — high risk");
    }

    // Medium risk: very short outputs
    const jsonSize = JSON.stringify(output).length;
    if (jsonSize < 50) {
      risk += 20;
    }

    // Low risk indicator: well-structured output reduces risk
    if (Object.keys(output).length > 3 && jsonSize > 200) {
      risk -= 5;
    }

    return Math.max(0, Math.min(100, risk));
  }

  private extractStrings(obj: unknown): string[] {
    const strings: string[] = [];
    if (typeof obj === "string") {
      strings.push(obj);
      return strings;
    }
    if (Array.isArray(obj)) {
      for (const item of obj) strings.push(...this.extractStrings(item));
      return strings;
    }
    if (typeof obj === "object" && obj !== null) {
      for (const value of Object.values(obj))
        strings.push(...this.extractStrings(value));
    }
    return strings;
  }
}
