/**
 * GenerationEngineFactory.ts
 *
 * Factory for creating pre-configured GenerationEngine instances.
 */

import {
  GenerationEngine,
  type GenerationEngineConfig,
} from "./GenerationEngine";
import { GeneratorRegistry } from "./GeneratorRegistry";

export class GenerationEngineFactory {
  /**
   * Create a generation engine with default configuration.
   */
  static createDefault(): GenerationEngine {
    const registry = new GeneratorRegistry();
    return new GenerationEngine(registry);
  }

  /**
   * Create a generation engine with custom configuration.
   */
  static create(
    config: Partial<GenerationEngineConfig>,
    registry?: GeneratorRegistry,
  ): GenerationEngine {
    return new GenerationEngine(registry ?? new GeneratorRegistry(), config);
  }

  /**
   * Create a generation engine with a pre-populated registry.
   */
  static createWithRegistry(
    registry: GeneratorRegistry,
    config?: Partial<GenerationEngineConfig>,
  ): GenerationEngine {
    return new GenerationEngine(registry, config);
  }
}
