/**
 * ImportBoundaryValidator.ts
 *
 * Domain-level TypeScript AST import firewall engine.
 * Validates all statically resolvable module specifications against the
 * architecture manifest rules:
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
import { createRequire } from "module";
import { join, relative, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

type TypeScriptCompiler = typeof import("typescript");
type CompilerNode = Parameters<TypeScriptCompiler["forEachChild"]>[0];

export type Layer =
  "core" | "domains" | "infrastructure" | "api" | "shared" | "unknown";

export type ImportSyntax =
  | "static-import"
  | "type-import"
  | "side-effect-import"
  | "re-export"
  | "type-re-export"
  | "dynamic-import"
  | "require-call"
  | "import-equals-require"
  | "import-type-query";

export interface ImportSpecification {
  specifier: string;
  syntax: ImportSyntax;
}

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

// TypeScript is a development dependency and is pruned from the production
// image. Load it only when source files actually need scanning; the production
// runtime image contains compiled output but no server/src tree.
const nodeRequire = createRequire(import.meta.url);
let typescriptCompiler: TypeScriptCompiler | undefined;

function getTypeScriptCompiler(): TypeScriptCompiler {
  typescriptCompiler ??= nodeRequire("typescript") as TypeScriptCompiler;
  return typescriptCompiler;
}

/**
 * Extract statically resolvable module specifications from TypeScript syntax.
 */
export function extractImportSpecifications(
  content: string,
  fileName = "source.ts",
): ImportSpecification[] {
  const ts = getTypeScriptCompiler();
  const sourceFile = ts.createSourceFile(
    fileName,
    content,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const imports: ImportSpecification[] = [];

  const add = (node: CompilerNode, syntax: ImportSyntax): void => {
    if (ts.isStringLiteralLike(node)) {
      imports.push({ specifier: node.text, syntax });
    }
  };

  const visit = (node: CompilerNode): void => {
    if (ts.isImportDeclaration(node)) {
      const namedImportsAreTypeOnly =
        node.importClause !== undefined &&
        node.importClause.name === undefined &&
        node.importClause.namedBindings !== undefined &&
        ts.isNamedImports(node.importClause.namedBindings) &&
        node.importClause.namedBindings.elements.length > 0 &&
        node.importClause.namedBindings.elements.every(
          (element) => element.isTypeOnly,
        );
      const syntax: ImportSyntax = !node.importClause
        ? "side-effect-import"
        : node.importClause.isTypeOnly || namedImportsAreTypeOnly
          ? "type-import"
          : "static-import";
      add(node.moduleSpecifier, syntax);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const namedExportsAreTypeOnly =
        node.exportClause !== undefined &&
        ts.isNamedExports(node.exportClause) &&
        node.exportClause.elements.length > 0 &&
        node.exportClause.elements.every((element) => element.isTypeOnly);
      add(
        node.moduleSpecifier,
        node.isTypeOnly || namedExportsAreTypeOnly
          ? "type-re-export"
          : "re-export",
      );
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression
    ) {
      add(node.moduleReference.expression, "import-equals-require");
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0]
    ) {
      add(node.arguments[0], "dynamic-import");
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require" &&
      node.arguments[0]
    ) {
      add(node.arguments[0], "require-call");
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument)
    ) {
      add(node.argument.literal, "import-type-query");
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return imports;
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
    const content = readFileSync(filePath, "utf-8");
    const relPath = relative(this.rootDir, filePath).replace(/\\/g, "/");
    const imports = extractImportSpecifications(content, filePath).map(
      ({ specifier }) => specifier,
    );
    return this.analyzeImports(relPath, imports).violations;
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
      const imports = extractImportSpecifications(content, file).map(
        ({ specifier }) => specifier,
      );
      totalImports += imports.length;
      const analysis = this.analyzeImports(relPath, imports);
      allViolations.push(...analysis.violations);
      allEdges.push(...analysis.edges);
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

  private analyzeImports(
    relPath: string,
    imports: string[],
  ): { violations: ImportViolation[]; edges: DependencyEdge[] } {
    const violations: ImportViolation[] = [];
    const edges: DependencyEdge[] = [];
    const sourceDomain = this.resolveDomain(relPath);

    for (const imp of imports) {
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

      const targetDomain = this.resolveImportDomain(relPath, imp);
      if (targetDomain === "unknown" || targetDomain === "external") continue;

      edges.push({
        from: sourceDomain,
        to: targetDomain,
        file: relPath,
        importPath: imp,
      });

      const check = this.isImportAllowed(sourceDomain, targetDomain);
      if (!check.allowed && check.violation) {
        violations.push({
          ...check.violation,
          file: relPath,
          importPath: imp,
        });
      }
    }

    return { violations, edges };
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
