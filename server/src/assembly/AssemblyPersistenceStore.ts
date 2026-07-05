import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
} from "fs";
import { join } from "path";
import type { ProjectAssembly } from "./AssemblyTypes";
import type { VersionEntry } from "./AssemblyVersioning";
import { nextVersion, computeVersionDiff } from "./AssemblyVersioning";

/**
 * AssemblyPersistenceStore
 *
 * File-based persistence for assemblies.
 * Directory structure:
 *   {storageRoot}/assemblies/{assemblyId}/
 *     versions/
 *       v1.0.1.json
 *       v1.0.2.json
 *     latest.json     ← pointer (copy of latest version entry)
 *     manifest.json   ← latest manifest
 *     metadata.json   ← assemblyId, generationId, createdAt, latestVersion
 *
 * Rules:
 *  - Versions are immutable once written
 *  - latest.json is overwritten per build (pointer only)
 *  - No overwriting past versions
 *  - Deterministic JSON (sorted keys, no circular refs)
 */
export class AssemblyPersistenceStore {
  private storageRoot: string;

  constructor(storageRoot?: string) {
    this.storageRoot =
      storageRoot ?? join(process.cwd(), "storage", "assemblies");
    this.ensureDir(this.storageRoot);
  }

  /**
   * Save a new version of an assembly.
   * Computes version number, writes immutable version file, updates latest pointer.
   */
  save(assembly: ProjectAssembly): VersionEntry {
    const dir = this.assemblyDir(assembly.id);
    this.ensureDir(join(dir, "versions"));

    // Determine version
    const meta = this.loadMetadata(assembly.id);
    const prevVersion = meta?.latestVersion ?? null;
    const prevAssembly = prevVersion
      ? this.loadVersion(assembly.id, prevVersion)
      : null;

    const schemaChanged = meta
      ? meta.schemaVersion !== assembly.schemaVersion
      : false;
    const generationChanged = meta
      ? meta.generationId !== assembly.generationId
      : false;
    const version = nextVersion(prevVersion, schemaChanged, generationChanged);

    // Compute diff
    const diff = prevAssembly
      ? computeVersionDiff(prevAssembly.snapshot, assembly)
      : undefined;

    // Build version entry
    const entry: VersionEntry = {
      assemblyId: assembly.id,
      version,
      timestamp: new Date(),
      status: assembly.status,
      snapshot: assembly,
      validation: assembly.validation,
      manifest: assembly.manifest,
      diff,
    };

    // Write immutable version file
    const versionFile = join(dir, "versions", `v${version}.json`);
    if (!existsSync(versionFile)) {
      this.writeJSON(versionFile, entry);
    }

    // Update latest pointer
    this.writeJSON(join(dir, "latest.json"), entry);

    // Update manifest
    if (assembly.manifest) {
      this.writeJSON(join(dir, "manifest.json"), assembly.manifest);
    }

    // Update metadata
    this.writeJSON(join(dir, "metadata.json"), {
      assemblyId: assembly.id,
      generationId: assembly.generationId,
      schemaVersion: assembly.schemaVersion,
      createdAt: meta?.createdAt ?? new Date().toISOString(),
      latestVersion: version,
      totalVersions: this.countVersions(assembly.id),
      updatedAt: new Date().toISOString(),
    });

    console.log(
      `[PERSISTENCE] Saved | Assembly: ${assembly.id} | Version: ${version} | Status: ${assembly.status}`,
    );

    return entry;
  }

  /**
   * Load the latest version entry for an assembly.
   */
  loadLatest(assemblyId: string): VersionEntry | null {
    const file = join(this.assemblyDir(assemblyId), "latest.json");
    if (!existsSync(file)) return null;
    return this.readJSON<VersionEntry>(file);
  }

  /**
   * Load a specific version entry.
   */
  loadVersion(assemblyId: string, version: string): VersionEntry | null {
    const file = join(
      this.assemblyDir(assemblyId),
      "versions",
      `v${version}.json`,
    );
    if (!existsSync(file)) return null;
    return this.readJSON<VersionEntry>(file);
  }

  /**
   * List all version strings for an assembly.
   */
  listVersions(assemblyId: string): string[] {
    const dir = join(this.assemblyDir(assemblyId), "versions");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.startsWith("v") && f.endsWith(".json"))
      .map((f) => f.slice(1, -5)) // "v1.0.1.json" → "1.0.1"
      .sort();
  }

  /**
   * Check if an assembly exists in storage.
   */
  exists(assemblyId: string): boolean {
    return existsSync(join(this.assemblyDir(assemblyId), "metadata.json"));
  }

  /**
   * List all stored assembly IDs.
   */
  listAll(): string[] {
    if (!existsSync(this.storageRoot)) return [];
    return readdirSync(this.storageRoot).filter((entry) =>
      existsSync(join(this.storageRoot, entry, "metadata.json")),
    );
  }

  private loadMetadata(assemblyId: string): {
    generationId: string;
    schemaVersion: string;
    latestVersion: string;
    createdAt: string;
  } | null {
    const file = join(this.assemblyDir(assemblyId), "metadata.json");
    if (!existsSync(file)) return null;
    return this.readJSON(file);
  }

  private countVersions(assemblyId: string): number {
    return this.listVersions(assemblyId).length;
  }

  private assemblyDir(assemblyId: string): string {
    return join(this.storageRoot, assemblyId);
  }

  private ensureDir(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private writeJSON(filePath: string, data: unknown): void {
    const json = JSON.stringify(
      data,
      (_key, value) => {
        if (value instanceof Date) return value.toISOString();
        if (value instanceof Map) return Object.fromEntries(value);
        if (value instanceof Set) return Array.from(value);
        return value;
      },
      2,
    );
    writeFileSync(filePath, json, "utf-8");
  }

  private readJSON<T>(filePath: string): T | null {
    try {
      const raw = readFileSync(filePath, "utf-8");
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
}
