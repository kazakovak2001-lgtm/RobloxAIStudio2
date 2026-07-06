/**
 * GenerationEngineContext.ts
 *
 * Execution context for the generation engine.
 * Holds state that persists across all generator invocations.
 */

import type { GenerationModel } from "./GenerationModel";

export interface EngineContext {
  sessionId: string;
  blueprint: Record<string, unknown>;
  model: GenerationModel;
  generatorResults: Record<
    string,
    { success: boolean; durationMs: number; error?: string }
  >;
  timings: {
    initMs: number;
    generatorsMs: number;
    validationMs: number;
    totalMs: number;
  };
  cacheHits: number;
  cacheMisses: number;
}

export function createEngineContext(
  sessionId: string,
  blueprint: Record<string, unknown>,
  model: GenerationModel,
): EngineContext {
  return {
    sessionId,
    blueprint,
    model,
    generatorResults: {},
    timings: { initMs: 0, generatorsMs: 0, validationMs: 0, totalMs: 0 },
    cacheHits: 0,
    cacheMisses: 0,
  };
}
