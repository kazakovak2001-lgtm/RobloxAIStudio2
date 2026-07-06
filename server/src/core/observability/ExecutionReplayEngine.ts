/**
 * ExecutionReplayEngine.ts
 *
 * Replays a previously recorded execution trace step-by-step.
 * Supports:
 *   - Deterministic replay (re-run same inputs)
 *   - Comparison replay (A/B execution diffing)
 *   - Step-by-step inspection
 *
 * Relies on TraceStore for stored execution data.
 */

import type { ExecutionTrace, ReplayStep, ReplayResult } from "./types";
import { TraceStore } from "./TraceStore";

export class ExecutionReplayEngine {
  private store: TraceStore;

  constructor(store?: TraceStore) {
    this.store = store ?? TraceStore.instance();
  }

  /**
   * Replay an execution deterministically.
   * Uses the stored inputs and re-invokes the agentExecutor for each step.
   * Returns comparison between original and replayed outputs.
   */
  async replay(
    executionId: string,
    agentExecutor: (
      agentType: string,
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>,
  ): Promise<ReplayResult | null> {
    const trace = this.store.getTrace(executionId);
    if (!trace) return null;

    const replayStart = Date.now();
    const steps: ReplayStep[] = [];
    const divergences: ReplayResult["divergences"] = [];

    // Get the ordered node execution events
    const nodeStarts = trace.events.filter(
      (e) => e.eventType === "node.started",
    );
    const nodeCompletions = trace.events.filter(
      (e) => e.eventType === "node.completed",
    );

    let stepIndex = 0;
    for (const startEvent of nodeStarts) {
      const completionEvent = nodeCompletions.find(
        (e) => e.nodeId === startEvent.nodeId,
      );
      if (!completionEvent) continue;

      const nodeStart = Date.now();
      let replayedOutput: unknown;

      try {
        replayedOutput = await agentExecutor(
          startEvent.agentId,
          (startEvent.input as Record<string, unknown>) ?? {},
        );
      } catch (err) {
        replayedOutput = {
          _error: err instanceof Error ? err.message : String(err),
        };
      }

      const replayDuration = Date.now() - nodeStart;

      steps.push({
        index: stepIndex++,
        nodeId: startEvent.nodeId,
        agent: startEvent.agentId,
        input: startEvent.input,
        output: replayedOutput,
        durationMs: replayDuration,
        evaluationScore: completionEvent.evaluationScore,
      });

      // Compare outputs
      const originalOutput = completionEvent.output;
      const diffs = this.compareOutputs(
        startEvent.nodeId,
        originalOutput,
        replayedOutput,
      );
      divergences.push(...diffs);
    }

    return {
      executionId,
      originalDurationMs: trace.totalDurationMs ?? 0,
      replayDurationMs: Date.now() - replayStart,
      steps,
      divergences,
    };
  }

  /**
   * Get a step-by-step replay data without re-execution.
   * Useful for inspection/visualization without running agents.
   */
  getReplayData(executionId: string): ReplayStep[] | null {
    const trace = this.store.getTrace(executionId);
    if (!trace) return null;

    const nodeStarts = trace.events.filter(
      (e) => e.eventType === "node.started",
    );
    const nodeCompletions = trace.events.filter(
      (e) => e.eventType === "node.completed",
    );

    const steps: ReplayStep[] = [];
    let index = 0;

    for (const startEvent of nodeStarts) {
      const completionEvent = nodeCompletions.find(
        (e) => e.nodeId === startEvent.nodeId,
      );
      steps.push({
        index: index++,
        nodeId: startEvent.nodeId,
        agent: startEvent.agentId,
        input: startEvent.input,
        output: completionEvent?.output ?? null,
        durationMs: completionEvent?.durationMs ?? 0,
        evaluationScore: completionEvent?.evaluationScore,
      });
    }

    return steps;
  }

  /**
   * Compare two executions (A/B testing).
   */
  compareExecutions(
    executionIdA: string,
    executionIdB: string,
  ): {
    comparison: "identical" | "divergent";
    differences: Array<{
      nodeId: string;
      field: string;
      valueA: unknown;
      valueB: unknown;
    }>;
  } | null {
    const traceA = this.store.getTrace(executionIdA);
    const traceB = this.store.getTrace(executionIdB);
    if (!traceA || !traceB) return null;

    const completionsA = traceA.events.filter(
      (e) => e.eventType === "node.completed",
    );
    const completionsB = traceB.events.filter(
      (e) => e.eventType === "node.completed",
    );

    const differences: Array<{
      nodeId: string;
      field: string;
      valueA: unknown;
      valueB: unknown;
    }> = [];

    for (const compA of completionsA) {
      const compB = completionsB.find((e) => e.nodeId === compA.nodeId);
      if (!compB) {
        differences.push({
          nodeId: compA.nodeId,
          field: "existence",
          valueA: "present",
          valueB: "missing",
        });
        continue;
      }

      if (compA.evaluationScore !== compB.evaluationScore) {
        differences.push({
          nodeId: compA.nodeId,
          field: "evaluationScore",
          valueA: compA.evaluationScore,
          valueB: compB.evaluationScore,
        });
      }

      if (compA.durationMs !== compB.durationMs) {
        differences.push({
          nodeId: compA.nodeId,
          field: "durationMs",
          valueA: compA.durationMs,
          valueB: compB.durationMs,
        });
      }
    }

    return {
      comparison: differences.length === 0 ? "identical" : "divergent",
      differences,
    };
  }

  /**
   * Export a trace for external replay/debugging.
   */
  exportForReplay(
    executionId: string,
  ): { trace: ExecutionTrace; steps: ReplayStep[] } | null {
    const trace = this.store.getTrace(executionId);
    if (!trace) return null;

    const steps = this.getReplayData(executionId);
    if (!steps) return null;

    return { trace, steps };
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private compareOutputs(
    nodeId: string,
    original: unknown,
    replayed: unknown,
  ): ReplayResult["divergences"] {
    const divergences: ReplayResult["divergences"] = [];

    if (typeof original !== typeof replayed) {
      divergences.push({
        nodeId,
        field: "type",
        original: typeof original,
        replayed: typeof replayed,
      });
      return divergences;
    }

    if (original === null || replayed === null) {
      if (original !== replayed) {
        divergences.push({ nodeId, field: "nullity", original, replayed });
      }
      return divergences;
    }

    if (typeof original === "object" && typeof replayed === "object") {
      const origKeys = Object.keys(original as object);
      const replayKeys = Object.keys(replayed as object);

      // Check for missing/extra keys
      for (const key of origKeys) {
        if (!replayKeys.includes(key)) {
          divergences.push({
            nodeId,
            field: `missing_key:${key}`,
            original: key,
            replayed: undefined,
          });
        }
      }
      for (const key of replayKeys) {
        if (!origKeys.includes(key)) {
          divergences.push({
            nodeId,
            field: `extra_key:${key}`,
            original: undefined,
            replayed: key,
          });
        }
      }
    }

    return divergences;
  }
}
