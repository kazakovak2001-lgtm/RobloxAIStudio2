/**
 * CodebaseKnowledge.ts — Codebase architecture indexing extension.
 *
 * Extends the existing KnowledgeEngine with source file indexing,
 * architecture metadata, component/service relationship tracking,
 * and dependency graph queries.
 * Does NOT replace KnowledgeEngine — complementary subsystem.
 */

import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

export type FileCategory =
  | "component"
  | "service"
  | "route"
  | "hook"
  | "agent"
  | "type"
  | "util"
  | "config"
  | "test"
  | "other";

export interface SourceFileEntry {
  path: string;
  category: FileCategory;
  name: string;
  exports: string[];
  dependencies: string[];
  description: string;
  sizeBytes: number;
  lastIndexed: number;
}

export interface SearchResult {
  file: SourceFileEntry;
  relevance: number;
  matchReason: string;
}

/** A resolved edge in the dependency graph */
export interface DependencyRelation {
  from: string; // source file path
  to: string; // target file path
  importPath: string; // raw import string
  type: "import" | "re-export";
}

/** Impact analysis result for a file */
export interface ImpactResult {
  file: string;
  directDependents: string[];
  transitiveDependents: string[];
  directDependencies: string[];
  impactScore: number;
}

// ─── Implementation ─────────────────────────────────────────────────────────

export class CodebaseKnowledge {
  private files: Map<string, SourceFileEntry> = new Map();
  private rootDir: string;
  /** Dependency graph: file → files it imports */
  private dependsOn: Map<string, Set<string>> = new Map();
  /** Reverse dependency graph: file → files that import it */
  private dependedBy: Map<string, Set<string>> = new Map();

  constructor(rootDir?: string) {
    this.rootDir = rootDir ?? process.cwd();
  }

  /**
   * Index the source tree, extracting metadata from each file.
   * Also builds the resolved dependency graph.
   */
  indexSourceTree(): void {
    const frontendDir = join(this.rootDir, "src");
    const backendDir = join(this.rootDir, "server", "src");

    if (existsSync(frontendDir)) {
      this.indexDirectory(frontendDir, "src");
    }
    if (existsSync(backendDir)) {
      this.indexDirectory(backendDir, "server/src");
    }

    // Build dependency graph after all files are indexed
    this.buildDependencyGraph();
  }

  private indexDirectory(dir: string, prefix: string): void {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "__tests__")
          continue;
        this.indexDirectory(fullPath, `${prefix}/${entry.name}`);
      } else if (entry.isFile() && this.isSourceFile(entry.name)) {
        const relPath = `${prefix}/${entry.name}`;
        const fileEntry = this.extractFileMetadata(fullPath, relPath);
        this.files.set(relPath, fileEntry);
      }
    }
  }

  private isSourceFile(name: string): boolean {
    const ext = extname(name);
    return [".ts", ".tsx"].includes(ext) && !name.endsWith(".test.ts");
  }

  private extractFileMetadata(
    fullPath: string,
    relPath: string,
  ): SourceFileEntry {
    const content = readFileSync(fullPath, "utf-8");
    const stat = statSync(fullPath);
    const name =
      relPath
        .split("/")
        .pop()
        ?.replace(/\.(ts|tsx)$/, "") ?? relPath;

    return {
      path: relPath,
      category: this.categorizeFile(relPath, content),
      name,
      exports: this.extractExports(content),
      dependencies: this.extractImports(content),
      description: this.extractDescription(content),
      sizeBytes: stat.size,
      lastIndexed: Date.now(),
    };
  }

  private categorizeFile(path: string, content: string): FileCategory {
    if (path.includes("/routes/")) return "route";
    if (path.includes("/agents/implementations/")) return "agent";
    if (path.includes("/hooks/") || path.includes("use")) return "hook";
    if (path.includes("/services/") || path.endsWith("Api.ts"))
      return "service";
    if (path.includes("/types") || path.endsWith("Types.ts")) return "type";
    if (
      path.includes("/components/") ||
      (content.includes("export function") && content.includes("return ("))
    )
      return "component";
    if (path.includes("/utils/") || path.includes("/common/")) return "util";
    if (path.endsWith(".test.ts")) return "test";
    if (path.includes("config") || path.includes("Config")) return "config";
    return "other";
  }

  private extractExports(content: string): string[] {
    const exports: string[] = [];
    const matches = content.matchAll(
      /export\s+(?:default\s+)?(?:class|function|const|interface|type|enum)\s+(\w+)/g,
    );
    for (const m of matches) {
      exports.push(m[1]);
    }
    return exports;
  }

  private extractImports(content: string): string[] {
    const imports: string[] = [];
    const matches = content.matchAll(/from\s+["']([^"']+)["']/g);
    for (const m of matches) {
      imports.push(m[1]);
    }
    return imports;
  }

  private extractDescription(content: string): string {
    // Extract first JSDoc or line comment block
    const jsdoc = content.match(/\/\*\*\s*\n\s*\*\s*(.+?)(?:\n|\*\/)/);
    if (jsdoc) return jsdoc[1].trim();
    const lineComment = content.match(/^\/\/\s*(.+)$/m);
    if (lineComment) return lineComment[1].trim();
    return "";
  }

  // ─── Query API ──────────────────────────────────────────────────────────────

  /**
   * Search for files matching a functionality description.
   */
  search(query: string, category?: FileCategory): SearchResult[] {
    const normalizedQuery = query.toLowerCase();
    const results: SearchResult[] = [];

    for (const file of this.files.values()) {
      if (category && file.category !== category) continue;

      let relevance = 0;
      let matchReason = "";

      // Name match
      if (file.name.toLowerCase().includes(normalizedQuery)) {
        relevance += 50;
        matchReason = "name match";
      }
      // Export match
      for (const exp of file.exports) {
        if (exp.toLowerCase().includes(normalizedQuery)) {
          relevance += 40;
          matchReason = matchReason || `export: ${exp}`;
        }
      }
      // Description match
      if (file.description.toLowerCase().includes(normalizedQuery)) {
        relevance += 30;
        matchReason = matchReason || "description match";
      }
      // Path match
      if (file.path.toLowerCase().includes(normalizedQuery)) {
        relevance += 20;
        matchReason = matchReason || "path match";
      }

      if (relevance > 0) {
        results.push({ file, relevance, matchReason });
      }
    }

    return results.sort((a, b) => b.relevance - a.relevance).slice(0, 20);
  }

  /**
   * Find files similar to a given file (by shared dependencies).
   */
  findSimilar(filePath: string): SearchResult[] {
    const target = this.files.get(filePath);
    if (!target) return [];

    const results: SearchResult[] = [];
    for (const file of this.files.values()) {
      if (file.path === filePath) continue;
      const sharedDeps = target.dependencies.filter((d) =>
        file.dependencies.includes(d),
      );
      if (sharedDeps.length > 2) {
        results.push({
          file,
          relevance: sharedDeps.length * 10,
          matchReason: `${sharedDeps.length} shared dependencies`,
        });
      }
    }
    return results.sort((a, b) => b.relevance - a.relevance).slice(0, 10);
  }

  /**
   * Get all files in a specific category.
   */
  getByCategory(category: FileCategory): SourceFileEntry[] {
    return [...this.files.values()].filter((f) => f.category === category);
  }

  /**
   * Get codebase statistics.
   */
  getStats(): { total: number; byCategory: Record<string, number> } {
    const byCategory: Record<string, number> = {};
    for (const file of this.files.values()) {
      byCategory[file.category] = (byCategory[file.category] ?? 0) + 1;
    }
    return { total: this.files.size, byCategory };
  }

  /**
   * Check if a file with similar name/exports already exists.
   */
  checkDuplicate(name: string, exports: string[]): SearchResult[] {
    const results: SearchResult[] = [];
    const normalizedName = name.toLowerCase();

    for (const file of this.files.values()) {
      let relevance = 0;
      let matchReason = "";

      if (file.name.toLowerCase() === normalizedName) {
        relevance += 80;
        matchReason = "exact name match";
      } else if (file.name.toLowerCase().includes(normalizedName)) {
        relevance += 40;
        matchReason = "partial name match";
      }

      for (const exp of exports) {
        if (file.exports.some((e) => e.toLowerCase() === exp.toLowerCase())) {
          relevance += 60;
          matchReason = matchReason || `export overlap: ${exp}`;
        }
      }

      if (relevance > 30) {
        results.push({ file, relevance, matchReason });
      }
    }

    return results.sort((a, b) => b.relevance - a.relevance).slice(0, 5);
  }

  /**
   * Get the full indexed file map (for serialization/caching).
   */
  getAllFiles(): SourceFileEntry[] {
    return [...this.files.values()];
  }

  // ─── Architecture Graph ───────────────────────────────────────────────────

  /**
   * Build the resolved dependency graph from indexed file imports.
   * Resolves relative imports to actual file paths in the index.
   */
  private buildDependencyGraph(): void {
    this.dependsOn.clear();
    this.dependedBy.clear();

    for (const file of this.files.values()) {
      const deps = new Set<string>();

      for (const imp of file.dependencies) {
        const resolved = this.resolveImport(file.path, imp);
        if (resolved && this.files.has(resolved)) {
          deps.add(resolved);
          // Build reverse graph
          if (!this.dependedBy.has(resolved)) {
            this.dependedBy.set(resolved, new Set());
          }
          this.dependedBy.get(resolved)!.add(file.path);
        }
      }

      this.dependsOn.set(file.path, deps);
    }
  }

  /**
   * Resolve an import path to an indexed file path.
   */
  private resolveImport(fromFile: string, importPath: string): string | null {
    // Skip external/node_modules imports
    if (!importPath.startsWith(".") && !importPath.startsWith("@/")) {
      return null;
    }

    // Handle @/ alias
    if (importPath.startsWith("@/")) {
      const resolved = "src/" + importPath.slice(2);
      return this.findFileMatch(resolved);
    }

    // Resolve relative import
    const fromDir = fromFile.substring(0, fromFile.lastIndexOf("/"));
    const segments = importPath.split("/");
    let current = fromDir;

    for (const seg of segments) {
      if (seg === "..") {
        current = current.substring(0, current.lastIndexOf("/"));
      } else if (seg !== ".") {
        current = current + "/" + seg;
      }
    }

    return this.findFileMatch(current);
  }

  /**
   * Find the actual indexed file for a resolved path (handles extension resolution).
   */
  private findFileMatch(basePath: string): string | null {
    // Direct match
    if (this.files.has(basePath)) return basePath;
    // Try extensions
    for (const ext of [".ts", ".tsx"]) {
      if (this.files.has(basePath + ext)) return basePath + ext;
    }
    // Try index file
    for (const ext of [".ts", ".tsx"]) {
      const indexPath = basePath + "/index" + ext;
      if (this.files.has(indexPath)) return indexPath;
    }
    return null;
  }

  // ─── Graph Query API ──────────────────────────────────────────────────────

  /**
   * "What depends on this file?" — Find all files that import a given file.
   */
  getDependents(filePath: string): string[] {
    return [...(this.dependedBy.get(filePath) ?? [])];
  }

  /**
   * "What does this file depend on?" — Find all files imported by a given file.
   */
  getDependencies(filePath: string): string[] {
    return [...(this.dependsOn.get(filePath) ?? [])];
  }

  /**
   * "What will this change affect?" — Transitive impact analysis.
   * Returns all files that directly or transitively depend on the given file.
   */
  getImpact(filePath: string, maxDepth = 5): ImpactResult {
    const directDependents = this.getDependents(filePath);
    const transitiveDependents = new Set<string>();
    const visited = new Set<string>();

    const traverse = (current: string, depth: number) => {
      if (depth > maxDepth || visited.has(current)) return;
      visited.add(current);
      const deps = this.dependedBy.get(current);
      if (!deps) return;
      for (const dep of deps) {
        if (dep !== filePath) {
          transitiveDependents.add(dep);
          traverse(dep, depth + 1);
        }
      }
    };

    traverse(filePath, 0);

    return {
      file: filePath,
      directDependents,
      transitiveDependents: [...transitiveDependents],
      directDependencies: this.getDependencies(filePath),
      impactScore: Math.min(
        100,
        directDependents.length * 10 + transitiveDependents.size * 2,
      ),
    };
  }

  /**
   * "Where should this feature be added?" — Find the best location
   * for a new file based on its intended dependencies and category.
   */
  suggestLocation(
    intendedDependencies: string[],
    category: FileCategory,
  ): { directory: string; reason: string }[] {
    // Find directories that contain files of the same category
    const categoryFiles = this.getByCategory(category);
    const directories = new Map<string, number>();

    for (const file of categoryFiles) {
      const dir = file.path.substring(0, file.path.lastIndexOf("/"));
      directories.set(dir, (directories.get(dir) ?? 0) + 1);
    }

    // Score directories by how many of the intended dependencies are nearby
    const scored: { directory: string; score: number; reason: string }[] = [];

    for (const [dir, count] of directories) {
      let score = count; // Base score: files of same type in this dir
      let reason = `${count} ${category} files here`;

      // Bonus if intended dependencies are in the same or parent directory
      for (const dep of intendedDependencies) {
        const resolved = this.findFileMatch(dep);
        if (resolved && resolved.startsWith(dir)) {
          score += 20;
          reason = `${reason}, dependency ${dep} is nearby`;
        }
      }

      scored.push({ directory: dir, score, reason });
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ directory, reason }) => ({ directory, reason }));
  }

  /**
   * Get graph statistics.
   */
  getGraphStats(): {
    totalEdges: number;
    avgDependencies: number;
    mostDepended: Array<{ file: string; count: number }>;
    mostDependencies: Array<{ file: string; count: number }>;
  } {
    let totalEdges = 0;
    for (const deps of this.dependsOn.values()) {
      totalEdges += deps.size;
    }

    const avgDependencies =
      this.dependsOn.size > 0
        ? Math.round(totalEdges / this.dependsOn.size)
        : 0;

    // Most depended upon (highest incoming edges)
    const dependedEntries = [...this.dependedBy.entries()]
      .map(([file, deps]) => ({ file, count: deps.size }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Most dependencies (highest outgoing edges)
    const dependsEntries = [...this.dependsOn.entries()]
      .map(([file, deps]) => ({ file, count: deps.size }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalEdges,
      avgDependencies,
      mostDepended: dependedEntries,
      mostDependencies: dependsEntries,
    };
  }

  /**
   * Get all resolved dependency edges for visualization.
   */
  getAllEdges(): DependencyRelation[] {
    const edges: DependencyRelation[] = [];
    for (const [fromFile, deps] of this.dependsOn) {
      for (const toFile of deps) {
        const file = this.files.get(fromFile);
        const importPath = file?.dependencies.find((d) => {
          const resolved = this.resolveImport(fromFile, d);
          return resolved === toFile;
        });
        edges.push({
          from: fromFile,
          to: toFile,
          importPath: importPath ?? toFile,
          type: "import",
        });
      }
    }
    return edges;
  }
}
