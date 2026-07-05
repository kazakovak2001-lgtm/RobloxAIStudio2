import { existsSync, writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { mkdirSync } from "fs";

/**
 * Entry in the global history index.
 */
export interface HistoryEntry {
  assemblyId: string;
  generationId: string;
  version: string;
  status: string;
  timestamp: string;
  validationScore?: number;
}

/**
 * AssemblyHistoryIndex
 *
 * Global index of all assemblies. Supports fast lookup by ID, generationId, status.
 * Stored at: {storageRoot}/index.json
 */
export class AssemblyHistoryIndex {
  private indexPath: string;
  private entries: HistoryEntry[] = [];

  constructor(storageRoot?: string) {
    const root = storageRoot ?? join(process.cwd(), "storage");
    this.indexPath = join(root, "index.json");
    this.load();
  }

  /**
   * Append a new entry to the index.
   */
  append(entry: HistoryEntry): void {
    this.entries.push(entry);
    this.flush();
  }

  /**
   * Find entries by assemblyId.
   */
  findByAssemblyId(assemblyId: string): HistoryEntry[] {
    return this.entries.filter((e) => e.assemblyId === assemblyId);
  }

  /**
   * Find entries by generationId.
   */
  findByGenerationId(generationId: string): HistoryEntry[] {
    return this.entries.filter((e) => e.generationId === generationId);
  }

  /**
   * Find entries by status.
   */
  findByStatus(status: string): HistoryEntry[] {
    return this.entries.filter((e) => e.status === status);
  }

  /**
   * Get the latest successful build for a given assemblyId.
   */
  latestSuccessful(assemblyId: string): HistoryEntry | null {
    const matches = this.entries
      .filter((e) => e.assemblyId === assemblyId && e.status === "complete")
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return matches[0] ?? null;
  }

  /**
   * Get all entries.
   */
  all(): ReadonlyArray<HistoryEntry> {
    return this.entries;
  }

  get size(): number {
    return this.entries.length;
  }

  private load(): void {
    if (existsSync(this.indexPath)) {
      try {
        const raw = readFileSync(this.indexPath, "utf-8");
        this.entries = JSON.parse(raw) as HistoryEntry[];
      } catch {
        this.entries = [];
      }
    }
  }

  private flush(): void {
    const dir = dirname(this.indexPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(
      this.indexPath,
      JSON.stringify(this.entries, null, 2),
      "utf-8",
    );
  }
}
