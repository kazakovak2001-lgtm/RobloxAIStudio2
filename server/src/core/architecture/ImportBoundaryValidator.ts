/**
 * ImportBoundaryValidator.ts
 *
 * Domain-level import firewall engine.
 * Validates all imports against the architecture manifest rules:
 *   - Layer isolation (core / domains / infrastructure / api / shared)
 *   - Forbidden cross-domain edges
 *   - Hard bans (deprecated modules)
 *   - Circular dependency detection
 *
 * Used by:
 *   - CI gate (scripts/validate-boundaries.ts)
 *   - Runtime dev-mode warning (RuntimeBoundaryGuard)
 *   - Static analysis scanner (scripts/scan-imports.ts)
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join, relative, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

export type Layer =
  "core" | "domains" | "infrastructure" | "api" | "shared" | "unknown";

export interface DomainDefinition {
  path: string;
  layer: Layer;
}

export interface ForbiddenEdge {
  from: string[] | "*";
  to: string[];
  rule: string;
  message: string;
}

export interface HardBan {
  pattern: string;
  allowedIn: string[];
  rule: string;
  message: string;
}

export interface ImportViolation {
  file: string;
  importPath: string;
  sourceDomain: string;
  targetDomain: string;
  rule: string;
  severity: "critical" | "warning";
  message: string;
}

export interface DependencyEdge {
  from: string;
  to: string;
  file: string;
  importPath: string;
}

export interface ScanResult {
  violations: ImportViolation[];
  edges: DependencyEdge[];
  circularDeps: string[][];
  filesScanned: number;
  importsAnalyzed: number;
}

// ─── Manifest Schema ────────────────────────────────────────────────────────

interface ArchitectureManifest {
  domains: Record<string, { path: string; layer: string }>;
  forbiddenEdges: Array<{
    from: string[] | "*";
    to: string[];
    rule: string;
    message: string;
  }>;
  hardBans: Array<{
    pattern: string;
    allowedIn: string[];
    rule: string;
    message: string;
  }>;
}

// ─── Validator ──────────────────────────────────────────────────────────────

export class ImportBoundaryValidator {
  private domains: Map<string, DomainDefinition> = new Map();
  private forbiddenEdges: ForbiddenEdge[] = [];
  private hardBans: HardBan[] = [];
  private rootDir: string;

  constructor(rootDir: string, manifestPath?: string) {
    this.rootDir = rootDir;
    this.loadManifest(
      manifestPath ?? join(rootDir, "architecture.manifest.json"),
    );
  }

  private loadManifest(manifestPath: string): void {
    if (!existsSync(manifestPath)) {
      throw new Error(`Architecture manifest not found: ${manifestPath}`);
    }

    const raw = readFileSync(manifestPath, "utf-8");
    const manifest: ArchitectureManifest = JSON.parse(raw);

    // Load domain definitions
    for (const [name, def] of Object.entries(manifest.domains)) {
      this.domains.set(name, { path: def.path, layer: def.layer as Layer });
    }

    // Load forbidden edges
    this.forbiddenEdges = manifest.forbiddenEdges;

    // Load hard bans
    this.hardBans = manifest.hardBans;
  }

  /**
   * Resolve which domain a file belongs to.
   */
  resolveDomain(filePath: string): string {
    const normalized = filePath.replace(/\\/g, "/");
    const rel = normalized.startsWith("server/src/")
      ? normalized
      : relative(this.rootDir, normalized).replace(/\\/g, "/");

    // Match against known domains (longest path first)
    let bestMatch = "";
    let bestDomain = "unknown";

    for (const [name, def] of this.domains) {
      const domainPath = def.path.replace(/\\/g, "/");
      if (rel.startsWith(domainPath + "/") || rel === domainPath) {
        if (domainPath.length > bestMatch.length) {
          bestMatch = domainPath;
          bestDomain = name;
        }
      }
    }

    return bestDomain;
  }

  /**
   * Resolve the layer of a domain.
   */
  resolveLayer(domain: string): Layer {
    return this.domains.get(domain)?.layer ?? "unknown";
  }

  /**
   * Check if an import from sourceDomain to targetDomain is allowed.
   */
  isImportAllowed(
    sourceDomain: string,
    targetDomain: string,
  ): { allowed: boolean; violation?: ImportViolation } {
    // Same domain = always allowed
    if (sourceDomain === targetDomain) return { allowed: true };

    // Check hard bans
    for (const ban of this.hardBans) {
      if (
        targetDomain === "execution" &&
        ban.pattern.includes("aiPipelineIntegrator")
      ) {
        // This is checked per-file in scanFile, not per-domain
        continue;
      }
    }

    // Check forbidden edges
    for (const edge of this.forbiddenEdges) {
      const fromMatches = edge.from === "*" || edge.from.includes(sourceDomain);
      const toMatches = edge.to.includes(targetDomain);

      if (fromMatches && toMatches) {
        return {
          allowed: false,
          violation: {
            file: "",
            importPath: "",
            sourceDomain,
            targetDomain,
            rule: edge.rule,
            severity: "critical",
            message: edge.message,
          },
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Scan a single file for import violations.
   */
  scanFile(filePath: string): ImportViolation[] {
    const violations: ImportViolation[] = [];
    const content = readFileSync(filePath, "utf-8");
    const imports = this.extractImports(content);
    const relPath = relative(this.rootDir, filePath).replace(/\\/g, "/");
    const sourceDomain = this.resolveDomain(relPath);

    for (const imp of imports) {
      // Check hard bans
      for (const ban of this.hardBans) {
        if (imp.includes(ban.pattern)) {
          const isAllowed = ban.allowedIn.some((allowed) =>
            relPath.includes(allowed),
          );
          if (!isAllowed) {
            violations.push({
              file: relPath,
              importPath: imp,
              sourceDomain,
              targetDomain: "deprecated",
              rule: ban.rule,
              severity: "critical",
              message: ban.message,
            });
          }
        }
      }

      // Resolve target domain from import path
      const targetDomain = this.resolveImportDomain(relPath, imp);
      if (targetDomain === "unknown" || targetDomain === "external") continue;

      // Check forbidden edges
      const check = this.isImportAllowed(sourceDomain, targetDomain);
      if (!check.allowed && check.violation) {
        violations.push({
          ...check.violation,
          file: relPath,
          importPath: imp,
        });
      }
    }

    return violations;
  }

  /**
   * Full project scan — returns complete dependency graph + violations.
   */
  scanProject(): ScanResult {
    const serverSrc = join(this.rootDir, "server", "src");
    if (!existsSync(serverSrc)) {
      return {
        violations: [],
        edges: [],
        circularDeps: [],
        filesScanned: 0,
        importsAnalyzed: 0,
      };
    }

    const files = this.collectTsFiles(serverSrc);
    const allViolations: ImportViolation[] = [];
    const allEdges: DependencyEdge[] = [];
    let totalImports = 0;

    for (const file of files) {
      // Skip quarantine
      const relPath = relative(this.rootDir, file).replace(/\\/g, "/");
      if (relPath.includes("_quarantine")) continue;

      const content = readFileSync(file, "utf-8");
      const imports = this.extractImports(content);
      totalImports += imports.length;

      const sourceDomain = this.resolveDomain(relPath);

      for (const imp of imports) {
        // Hard ban check
        for (const ban of this.hardBans) {
          if (imp.includes(ban.pattern)) {
            const isAllowed = ban.allowedIn.some((allowed) =>
              relPath.includes(allowed),
            );
            if (!isAllowed) {
              allViolations.push({
                file: relPath,
                importPath: imp,
                sourceDomain,
                targetDomain: "deprecated",
                rule: ban.rule,
                severity: "critical",
                message: ban.message,
              });
            }
          }
        }

        const targetDomain = this.resolveImportDomain(relPath, imp);
        if (targetDomain === "unknown" || targetDomain === "external") continue;

        // Record edge
        allEdges.push({
          from: sourceDomain,
          to: targetDomain,
          file: relPath,
          importPath: imp,
        });

        // Check forbidden
        const check = this.isImportAllowed(sourceDomain, targetDomain);
        if (!check.allowed && check.violation) {
          allViolations.push({
            ...check.violation,
            file: relPath,
            importPath: imp,
          });
        }
      }

      // Also run per-file violation scan for completeness
      const fileViolations = this.scanFile(file);
      for (const v of fileViolations) {
        if (
          !allViolations.some(
            (av) =>
              av.file === v.file &&
              av.importPath === v.importPath &&
              av.rule === v.rule,
          )
        ) {
          allViolations.push(v);
        }
      }
    }

    // Detect circular dependencies
    const circularDeps = this.detectCircularDeps(allEdges);

    return {
      violations: allViolations,
      edges: allEdges,
      circularDeps,
      filesScanned: files.length,
      importsAnalyzed: totalImports,
    };
  }

  /**
   * Detect circular dependencies from edge list.
   * Returns arrays of domain cycles.
   */
  private detectCircularDeps(edges: DependencyEdge[]): string[][] {
    // Build adjacency list (domain-level)
    const graph = new Map<string, Set<string>>();
    for (const edge of edges) {
      if (edge.from === edge.to) continue;
      if (!graph.has(edge.from)) graph.set(edge.from, new Set());
      graph.get(edge.from)!.add(edge.to);
    }

    const cycles: string[][] = [];
    const visited = new Set<string>();
    const stack = new Set<string>();

    const dfs = (node: string, path: string[]): void => {
      if (stack.has(node)) {
        // Found a cycle
        const cycleStart = path.indexOf(node);
        if (cycleStart !== -1) {
          const cycle = path.slice(cycleStart).concat(node);
          // Deduplicate cycles (normalize by smallest element first)
          const normalized = this.normalizeCycle(cycle);
          if (
            !cycles.some(
              (c) => JSON.stringify(c) === JSON.stringify(normalized),
            )
          ) {
            cycles.push(normalized);
          }
        }
        return;
      }
      if (visited.has(node)) return;

      visited.add(node);
      stack.add(node);

      const neighbors = graph.get(node) ?? new Set();
      for (const neighbor of neighbors) {
        dfs(neighbor, [...path, node]);
      }

      stack.delete(node);
    };

    for (const node of graph.keys()) {
      visited.clear();
      stack.clear();
      dfs(node, []);
    }

    return cycles;
  }

  private normalizeCycle(cycle: string[]): string[] {
    if (cycle.length <= 1) return cycle;
    // Remove the repeated last element
    const clean = cycle.slice(0, -1);
    // Rotate so smallest element is first
    const minIdx = clean.indexOf(clean.slice().sort()[0]);
    return [...clean.slice(minIdx), ...clean.slice(0, minIdx), clean[minIdx]];
  }

  /**
   * Resolve the target domain of an import statement.
   */
  private resolveImportDomain(sourceFile: string, importPath: string): string {
    // External/node module
    if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
      return "external";
    }

    // Resolve relative import to absolute path
    const sourceDir = dirname(join(this.rootDir, sourceFile));
    const resolved = join(sourceDir, importPath).replace(/\\/g, "/");
    const relResolved = relative(this.rootDir, resolved).replace(/\\/g, "/");

    return this.resolveDomain(relResolved);
  }

  /**
   * Extract import paths from TypeScript source.
   */
  private extractImports(content: string): string[] {
    const imports: string[] = [];

    // Match: import ... from "path"
    const staticImports = content.matchAll(
      /import\s+(?:type\s+)?(?:\{[^}]*\}|[^;{]*)\s+from\s+["']([^"']+)["']/g,
    );
    for (const match of staticImports) {
      imports.push(match[1]);
    }

    // Match: import("path")
    const dynamicImports = content.matchAll(
      /import\s*\(\s*["']([^"']+)["']\s*\)/g,
    );
    for (const match of dynamicImports) {
      imports.push(match[1]);
    }

    // Match: require("path")
    const requires = content.matchAll(/require\s*\(\s*["']([^"']+)["']\s*\)/g);
    for (const match of requires) {
      imports.push(match[1]);
    }

    return imports;
  }

  /**
   * Collect all .ts files recursively.
   */
  private collectTsFiles(dir: string): string[] {
    if (!existsSync(dir)) return [];
    const files: string[] = [];
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (
        entry.isDirectory() &&
        entry.name !== "node_modules" &&
        entry.name !== "_quarantine"
      ) {
        files.push(...this.collectTsFiles(full));
      } else if (
        entry.isFile() &&
        (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
        !entry.name.endsWith(".test.ts")
      ) {
        files.push(full);
      }
    }
    return files;
  }

  /**
   * Generate a summary report (JSON-serializable).
   */
  generateReport(result: ScanResult): object {
    // Aggregate edges by domain pair
    const edgeCounts = new Map<string, number>();
    for (const edge of result.edges) {
      if (edge.from === edge.to) continue;
      const key = `${edge.from} → ${edge.to}`;
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }

    return {
      summary: {
        filesScanned: result.filesScanned,
        importsAnalyzed: result.importsAnalyzed,
        violations: result.violations.length,
        circularDependencies: result.circularDeps.length,
        uniqueDomainEdges: edgeCounts.size,
        status:
          result.violations.length === 0 && result.circularDeps.length === 0
            ? "PASS"
            : "FAIL",
      },
      violations: result.violations.map((v) => ({
        file: v.file,
        import: v.importPath,
        from: v.sourceDomain,
        to: v.targetDomain,
        rule: v.rule,
        severity: v.severity,
        message: v.message,
      })),
      circularDependencies: result.circularDeps,
      dependencyGraph: Object.fromEntries(edgeCounts),
    };
  }
}
