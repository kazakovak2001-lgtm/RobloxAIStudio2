import type { GameBlueprint } from "./GenerationBlueprint";
import type { GenerationManifest, GenerationReport } from "./GenerationTypes";

/**
 * GenerationRegistry
 *
 * In-memory store of generated blueprints, manifests, and reports.
 * Keyed by generationId. Used for status queries and report retrieval.
 */
export class GenerationRegistry {
  private blueprints = new Map<string, GameBlueprint>();
  private manifests = new Map<string, GenerationManifest>();
  private reports = new Map<string, GenerationReport>();

  storeBlueprint(blueprint: GameBlueprint): void {
    this.blueprints.set(blueprint.id, blueprint);
  }

  getBlueprint(id: string): GameBlueprint | null {
    return this.blueprints.get(id) ?? null;
  }

  storeManifest(manifest: GenerationManifest): void {
    this.manifests.set(manifest.generationId, manifest);
  }

  getManifest(id: string): GenerationManifest | null {
    return this.manifests.get(id) ?? null;
  }

  storeReport(report: GenerationReport): void {
    this.reports.set(report.generationId, report);
  }

  getReport(id: string): GenerationReport | null {
    return this.reports.get(id) ?? null;
  }

  get size(): number {
    return this.blueprints.size;
  }

  /** Return IDs of all stored generations. */
  listIds(): string[] {
    return Array.from(this.blueprints.keys());
  }
}

let _defaultRegistry: GenerationRegistry | null = null;

export function getDefaultGenerationRegistry(): GenerationRegistry {
  if (!_defaultRegistry) {
    _defaultRegistry = new GenerationRegistry();
  }
  return _defaultRegistry;
}
