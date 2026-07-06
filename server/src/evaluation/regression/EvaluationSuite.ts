/**
 * EvaluationSuite.ts
 *
 * Regression testing framework for AI agents.
 * Runs predefined prompts, evaluates outputs, detects quality degradation.
 */

import { AgentEvaluator } from "../agents/AgentEvaluator";
import type { EvaluationResult } from "../core/EvaluationEngine";

export interface TestCase {
  id: string;
  agentType: string;
  input: Record<string, unknown>;
  expectedKeys: string[];
  minQuality: number;
  description: string;
}

export interface SuiteResult {
  suiteId: string;
  totalCases: number;
  passed: number;
  failed: number;
  degraded: number;
  results: Array<
    TestCase & {
      evaluation: EvaluationResult;
      verdict: "pass" | "fail" | "degraded";
    }
  >;
  averageQuality: number;
  executedAt: Date;
  durationMs: number;
}

export class EvaluationSuite {
  private evaluator = new AgentEvaluator();
  private baselineScores = new Map<string, number>();

  /**
   * Run a regression suite against an agent executor.
   */
  async run(
    testCases: TestCase[],
    executor: (
      agentType: string,
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>,
  ): Promise<SuiteResult> {
    const start = Date.now();
    const results: SuiteResult["results"] = [];
    let passed = 0;
    let failed = 0;
    let degraded = 0;

    for (const testCase of testCases) {
      try {
        const output = await executor(testCase.agentType, testCase.input);
        const { evaluation } = await this.evaluator.evaluate(
          testCase.agentType,
          output,
          {
            expectedKeys: testCase.expectedKeys,
            taskDescription: testCase.description,
          },
        );

        // Determine verdict
        let verdict: "pass" | "fail" | "degraded" = "pass";
        if (evaluation.score.quality < testCase.minQuality) {
          verdict = "fail";
          failed++;
        } else {
          // Check for degradation against baseline
          const baseline = this.baselineScores.get(testCase.id);
          if (baseline && evaluation.score.quality < baseline - 10) {
            verdict = "degraded";
            degraded++;
          } else {
            passed++;
          }
          // Update baseline
          this.baselineScores.set(testCase.id, evaluation.score.quality);
        }

        results.push({ ...testCase, evaluation, verdict });
      } catch (err) {
        failed++;
        results.push({
          ...testCase,
          evaluation: {
            agentType: testCase.agentType,
            score: {
              quality: 0,
              coherence: 0,
              completeness: 0,
              correctness: 0,
              creativity: 0,
              risk: 100,
            },
            passed: false,
            timestamp: new Date(),
            durationMs: 0,
            notes: [
              `Execution error: ${err instanceof Error ? err.message : String(err)}`,
            ],
          },
          verdict: "fail",
        });
      }
    }

    const totalQuality = results.reduce(
      (sum, r) => sum + r.evaluation.score.quality,
      0,
    );
    const averageQuality =
      results.length > 0 ? Math.round(totalQuality / results.length) : 0;

    console.log(
      `[EVAL-SUITE] Complete | Cases: ${testCases.length} | Passed: ${passed} | Failed: ${failed} | Degraded: ${degraded} | Avg: ${averageQuality}`,
    );

    return {
      suiteId: `suite-${Date.now()}`,
      totalCases: testCases.length,
      passed,
      failed,
      degraded,
      results,
      averageQuality,
      executedAt: new Date(),
      durationMs: Date.now() - start,
    };
  }

  /**
   * Set a baseline score for regression comparison.
   */
  setBaseline(testCaseId: string, score: number): void {
    this.baselineScores.set(testCaseId, score);
  }

  getBaselines(): ReadonlyMap<string, number> {
    return this.baselineScores;
  }
}
