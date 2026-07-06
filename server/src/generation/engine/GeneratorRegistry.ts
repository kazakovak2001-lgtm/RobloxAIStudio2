/**
 * GeneratorRegistry.ts
 *
 * Central registry for all specialized generators.
 * Supports registration, lookup, and listing.
 */

import type { BaseGenerator, GeneratorMetadata } from "./BaseGenerator";

export class GeneratorRegistry {
  private generators: Map<string, BaseGenerator> = new Map();

  /**
   * Register a generator.
   */
  register(generator: BaseGenerator): void {
    if (this.generators.has(generator.metadata.id)) {
      throw new Error(`Generator already registered: ${generator.metadata.id}`);
    }
    this.generators.set(generator.metadata.id, generator);
  }

  /**
   * Get a generator by ID.
   */
  get(id: string): BaseGenerator | undefined {
    return this.generators.get(id);
  }

  /**
   * Check if a generator is registered.
   */
  has(id: string): boolean {
    return this.generators.has(id);
  }

  /**
   * Get all registered generator IDs.
   */
  listIds(): string[] {
    return [...this.generators.keys()];
  }

  /**
   * Get all metadata.
   */
  listMetadata(): GeneratorMetadata[] {
    return [...this.generators.values()].map((g) => g.metadata);
  }

  /**
   * Get all generators in registration order.
   */
  getAll(): BaseGenerator[] {
    return [...this.generators.values()];
  }

  /**
   * Get count.
   */
  get size(): number {
    return this.generators.size;
  }

  /**
   * Clear all registrations.
   */
  clear(): void {
    this.generators.clear();
  }
}
