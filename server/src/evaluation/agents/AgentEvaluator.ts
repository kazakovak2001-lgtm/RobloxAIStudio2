/**
 * AgentEvaluator.ts
 *
 * Wraps agent execution with automatic quality evaluation.
 * Non-blocking — evaluation failure never breaks agent output.
 * Returns both the original output and evaluation score.
 */

import {
  EvaluationEngine,
  type EvaluationContext,
  type EvaluationResult,
} from "../core/EvaluationEngine";

export interface EvaluatedOutput {
  output: Record<string, unknown>;
  evaluation: EvaluationResult;
}

export class AgentEvaluator {
  private engine = new EvaluationEngine();
  private history: EvaluationResult[] = [];

  /**
   * Evaluate an agent's output after execution.
   * Original output is never modified.
   */
  async evaluate(
    agentType: string,
    output: Record<string, unknown>,
    context?: Partial<EvaluationContext>,
  ): Promise<EvaluatedOutput> {
    const evalContext: EvaluationContext = {
      agentType,
      ...context,
    };

    const evaluation = await this.engine.evaluate(output, evalContext);
    this.history.push(evaluation);

    console.log(
      `[EVAL] Agent: ${agentType} | Quality: ${evaluation.score.quality} | ` +
        `Coherence: ${evaluation.score.coherence} | Completeness: ${evaluation.score.completeness} | ` +
        `Risk: ${evaluation.score.risk} | Passed: ${evaluation.passed}`,
    );

    return { output, evaluation };
  }

  /**
   * Get evaluation history for analytics.
   */
  getHistory(): ReadonlyArray<EvaluationResult> {
    return this.history;
  }

  /**
   * Get history filtered by agent type.
   */
  getHistoryByAgent(agentType: string): EvaluationResult[] {
    return this.history.filter((e) => e.agentType === agentType);
  }

  /**
   * Get average score for an agent type.
   */
  getAverageScore(agentType: string): number {
    const results = this.getHistoryByAgent(agentType);
    if (results.length === 0) return 0;
    return Math.round(
      results.reduce((sum, r) => sum + r.score.quality, 0) / results.length,
    );
  }

  /**
   * Clear history (for test isolation).
   */
  clearHistory(): void {
    this.history = [];
  }
}
