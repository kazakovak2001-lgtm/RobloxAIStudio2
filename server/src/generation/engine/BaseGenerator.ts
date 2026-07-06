/**
 * BaseGenerator.ts
 *
 * Abstract base class and interface for all specialized generators.
 * Generators transform blueprint data into GenerationModel fragments.
 */

import type { GenerationModel } from "./GenerationModel";

export interface GeneratorInput {
  blueprint: Record<string, unknown>;
  model: GenerationModel;
  context: Record<string, unknown>;
}

export interface GeneratorOutput {
  generatorId: string;
  success: boolean;
  modifications: string[];
  durationMs: number;
  error?: string;
}

export interface GeneratorMetadata {
  id: string;
  name: string;
  version: string;
  dependencies: string[];
  produces: string[];
}

export abstract class BaseGenerator {
  abstract readonly metadata: GeneratorMetadata;

  /**
   * Execute the generator, mutating the model in place.
   */
  abstract generate(input: GeneratorInput): Promise<GeneratorOutput>;

  /**
   * Validate that this generator can run given the current model state.
   */
  canRun(model: GenerationModel): { ready: boolean; missing: string[] } {
    const missing: string[] = [];
    for (const dep of this.metadata.dependencies) {
      const hasDep =
        model.scripts.some((s) => s.generatedBy === dep) ||
        model.modules.some((m) => m.generatedBy === dep) ||
        model.ui.some((u) => u.generatedBy === dep) ||
        model.services.some((s) => s.name === dep);
      if (!hasDep) missing.push(dep);
    }
    return { ready: missing.length === 0, missing };
  }
}
