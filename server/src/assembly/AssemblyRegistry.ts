import type { ProjectAssembly, AssemblyManifest } from "./AssemblyTypes";
import { AssemblyPersistenceStore } from "./AssemblyPersistenceStore";
import {
  AssemblyHistoryIndex,
  type HistoryEntry,
} from "./AssemblyHistoryIndex";
import type { VersionEntry } from "./AssemblyVersioning";

/**
 * AssemblyRegistry
 *
 * In-memory cache + persistence gateway.
 * Automatically persists assemblies to disk on store/update.
 * Loads from disk on cache miss.
 */
export class AssemblyRegistry {
  private cache = new Map<string, ProjectAssembly>();
  private manifests = new Map<string, AssemblyManifest>();
  private persistence: AssemblyPersistenceStore;
  private history: AssemblyHistoryIndex;

  constructor(storageRoot?: string) {
    this.persistence = new AssemblyPersistenceStore(storageRoot);
    this.history = new AssemblyHistoryIndex(storageRoot);
  }

  /**
   * Store assembly in cache and persist to disk.
   * Returns the version entry created.
   */
  store(assembly: ProjectAssembly): VersionEntry {
    this.cache.set(assembly.id, assembly);
    if (assembly.manifest) {
      this.manifests.set(assembly.id, assembly.manifest);
    }

    // Persist
    const versionEntry = this.persistence.save(assembly);

    // Update history index
    this.history.append({
      assemblyId: assembly.id,
      generationId: assembly.generationId,
      version: versionEntry.version,
      status: assembly.status,
      timestamp: new Date().toISOString(),
      validationScore: assembly.validation?.score,
    });

    return versionEntry;
  }

  /**
   * Get assembly by ID. Checks cache first, then disk.
   */
  get(id: string): ProjectAssembly | null {
    // Cache hit
    const cached = this.cache.get(id);
    if (cached) return cached;

    // Disk fallback
    const entry = this.persistence.loadLatest(id);
    if (entry) {
      this.cache.set(id, entry.snapshot);
      return entry.snapshot;
    }

    return null;
  }

  /**
   * Get a specific version of an assembly.
   */
  getVersion(id: string, version: string): ProjectAssembly | null {
    const entry = this.persistence.loadVersion(id, version);
    return entry?.snapshot ?? null;
  }

  /**
   * Get manifest by assembly ID.
   */
  getManifest(id: string): AssemblyManifest | null {
    return this.manifests.get(id) ?? null;
  }

  /**
   * List all version strings for an assembly.
   */
  listVersions(id: string): string[] {
    return this.persistence.listVersions(id);
  }

  /**
   * Check if an assembly exists (cache or disk).
   */
  has(id: string): boolean {
    return this.cache.has(id) || this.persistence.exists(id);
  }

  /**
   * List all known assembly IDs (from disk index).
   */
  listIds(): string[] {
    return this.persistence.listAll();
  }

  /**
   * Get the global history index for queries.
   */
  getHistory(): AssemblyHistoryIndex {
    return this.history;
  }

  /**
   * Find the latest successful build for an assembly.
   */
  latestSuccessful(id: string): HistoryEntry | null {
    return this.history.latestSuccessful(id);
  }

  get size(): number {
    return Math.max(this.cache.size, this.persistence.listAll().length);
  }
}

let _default: AssemblyRegistry | null = null;
export function getDefaultAssemblyRegistry(): AssemblyRegistry {
  if (!_default) _default = new AssemblyRegistry();
  return _default;
}
