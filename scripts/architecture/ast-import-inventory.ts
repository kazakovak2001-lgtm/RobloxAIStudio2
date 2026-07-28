import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

export interface AstDependencyEdge {
  from: string;
  to: string;
  file: string;
  importPath: string;
  kind: "import" | "dynamic-import" | "require" | "re-export";
}

export interface AstImportInventory {
  filesScanned: number;
  specificationsAnalyzed: number;
  reExportsAnalyzed: number;
  unresolvedInternalImports: Array<{ file: string; importPath: string }>;
  edges: AstDependencyEdge[];
}

interface DomainResolver {
  resolveDomain(filePath: string): string;
}

function collectTypeScriptFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];

  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    if (
      entry.isDirectory() &&
      entry.name !== "node_modules" &&
      entry.name !== "_quarantine" &&
      entry.name !== "__tests__"
    ) {
      files.push(...collectTypeScriptFiles(absolutePath));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".spec.ts")
    ) {
      files.push(absolutePath);
    }
  }

  return files.sort();
}

function literalText(node: ts.Expression | undefined): string | undefined {
  return node &&
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : undefined;
}

function extractSpecifiers(sourceFile: ts.SourceFile): Array<{
  importPath: string;
  kind: AstDependencyEdge["kind"];
}> {
  const specifications: Array<{
    importPath: string;
    kind: AstDependencyEdge["kind"];
  }> = [];

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const importPath = literalText(node.moduleSpecifier);
      if (importPath) specifications.push({ importPath, kind: "import" });
    } else if (ts.isExportDeclaration(node)) {
      const importPath = literalText(node.moduleSpecifier);
      if (importPath) specifications.push({ importPath, kind: "re-export" });
    } else if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const importPath = literalText(node.arguments[0]);
      if (importPath && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        specifications.push({ importPath, kind: "dynamic-import" });
      } else if (
        importPath &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "require"
      ) {
        specifications.push({ importPath, kind: "require" });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return specifications;
}

function resolveInternalTarget(
  rootDir: string,
  sourceFile: string,
  importPath: string,
): string | undefined {
  if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
    return undefined;
  }

  const resolved = resolve(dirname(sourceFile), importPath);
  return relative(rootDir, resolved).replaceAll("\\", "/");
}

export function buildAstImportInventory(
  rootDir: string,
  resolver: DomainResolver,
): AstImportInventory {
  const sourceRoot = join(rootDir, "server", "src");
  const files = collectTypeScriptFiles(sourceRoot);
  const edges: AstDependencyEdge[] = [];
  const unresolvedInternalImports: Array<{
    file: string;
    importPath: string;
  }> = [];
  let specificationsAnalyzed = 0;
  let reExportsAnalyzed = 0;

  for (const absoluteFile of files) {
    const repositoryPath = relative(rootDir, absoluteFile).replaceAll(
      "\\",
      "/",
    );
    const sourceText = readFileSync(absoluteFile, "utf8");
    const sourceFile = ts.createSourceFile(
      repositoryPath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      absoluteFile.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const sourceDomain = resolver.resolveDomain(repositoryPath);

    for (const specification of extractSpecifiers(sourceFile)) {
      specificationsAnalyzed += 1;
      if (specification.kind === "re-export") reExportsAnalyzed += 1;

      const targetPath = resolveInternalTarget(
        rootDir,
        absoluteFile,
        specification.importPath,
      );
      if (!targetPath) continue;

      const targetDomain = resolver.resolveDomain(targetPath);
      if (sourceDomain === "unknown" || targetDomain === "unknown") {
        unresolvedInternalImports.push({
          file: repositoryPath,
          importPath: specification.importPath,
        });
        continue;
      }

      edges.push({
        from: sourceDomain,
        to: targetDomain,
        file: repositoryPath,
        importPath: specification.importPath,
        kind: specification.kind,
      });
    }
  }

  return {
    filesScanned: files.length,
    specificationsAnalyzed,
    reExportsAnalyzed,
    unresolvedInternalImports,
    edges,
  };
}
