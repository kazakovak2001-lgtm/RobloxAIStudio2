import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

const root = process.cwd();
const registryPath = join(root, "config/runtime/runtime-ownership.json");
const reportPath = join(
  root,
  "artifacts/runtime/runtime-ownership-report.json",
);
const sourceRoot = join(root, "server/src");

const allowedClassifications = new Set([
  "canonical",
  "bounded-adapter",
  "preview",
  "deprecated",
  "removed",
]);
const allowedProductionUsePolicies = new Set([
  "allowed",
  "adapter-only",
  "preview-route",
  "preview-internal",
  "forbidden",
]);

interface RuntimeEntry {
  id: string;
  capability: string;
  path: string;
  classification:
    "canonical" | "bounded-adapter" | "preview" | "deprecated" | "removed";
  owner: string;
  productionUse:
    | "allowed"
    | "adapter-only"
    | "preview-route"
    | "preview-internal"
    | "forbidden";
  responsibility: string;
  replacement?: string;
  allowedImporters?: string[];
}

interface RuntimeOwnershipRegistry {
  schemaVersion: number;
  classifications: string[];
  productionUsePolicies: string[];
  canonicalByCapability: Record<string, string>;
  inventoryRules: Array<{ root: string; pattern: string }>;
  entries: RuntimeEntry[];
}

interface ImportUse {
  importer: string;
  targetId: string;
  targetPath: string;
  importPath: string;
  kind: "import" | "dynamic-import" | "require" | "re-export";
}

interface ValidationReport {
  schemaVersion: 1;
  status: "PASS" | "FAIL";
  generatedAt: string;
  registryPath: string;
  counts: {
    entries: number;
    canonical: number;
    boundedAdapters: number;
    preview: number;
    deprecated: number;
    removed: number;
    discoveredEntrypoints: number;
    productionFilesScanned: number;
    registeredImports: number;
    acknowledgedPreviewImports: number;
  };
  canonicalByCapability: Record<string, string>;
  discoveredEntrypoints: string[];
  importUses: ImportUse[];
  acknowledgedPreviewImports: ImportUse[];
  errors: string[];
  warnings: string[];
}

function repositoryPath(absolutePath: string): string {
  return relative(root, absolutePath).replaceAll("\\", "/");
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

function extractSpecifiers(sourceFile: ts.SourceFile): Array<{
  importPath: string;
  kind: ImportUse["kind"];
}> {
  const specifications: Array<{
    importPath: string;
    kind: ImportUse["kind"];
  }> = [];

  const literalText = (node: ts.Expression | undefined): string | undefined =>
    node &&
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      ? node.text
      : undefined;

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

function resolveImportTarget(
  sourceFile: string,
  importPath: string,
): string | undefined {
  if (!importPath.startsWith(".")) return undefined;

  const unresolved = resolve(dirname(sourceFile), importPath);
  const candidates = [
    unresolved,
    `${unresolved}.ts`,
    `${unresolved}.tsx`,
    join(unresolved, "index.ts"),
    join(unresolved, "index.tsx"),
  ];

  return candidates.find((candidate) => {
    try {
      return existsSync(candidate) && statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function main(): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!existsSync(registryPath)) {
    throw new Error(`Runtime ownership registry not found: ${registryPath}`);
  }

  const registry = JSON.parse(
    readFileSync(registryPath, "utf8"),
  ) as RuntimeOwnershipRegistry;

  if (registry.schemaVersion !== 1) {
    errors.push(
      `Unsupported registry schemaVersion: ${registry.schemaVersion}`,
    );
  }
  if (!Array.isArray(registry.entries) || registry.entries.length === 0) {
    errors.push("Runtime ownership registry must contain at least one entry.");
  }
  if (!Array.isArray(registry.inventoryRules)) {
    errors.push("Runtime ownership registry must define inventoryRules.");
  }

  const entries = Array.isArray(registry.entries) ? registry.entries : [];
  const entryById = new Map<string, RuntimeEntry>();
  const entryByPath = new Map<string, RuntimeEntry>();

  for (const entry of entries) {
    if (!isNonEmptyString(entry.id)) {
      errors.push("Runtime entry has an empty id.");
      continue;
    }
    if (entryById.has(entry.id)) {
      errors.push(`Duplicate runtime entry id: ${entry.id}`);
    }
    entryById.set(entry.id, entry);

    if (!isNonEmptyString(entry.path)) {
      errors.push(`Runtime entry ${entry.id} has an empty path.`);
      continue;
    }
    if (entryByPath.has(entry.path)) {
      errors.push(`Duplicate runtime entry path: ${entry.path}`);
    }
    entryByPath.set(entry.path, entry);

    if (!allowedClassifications.has(entry.classification)) {
      errors.push(
        `Runtime entry ${entry.id} has unknown classification: ${entry.classification}`,
      );
    }
    if (!allowedProductionUsePolicies.has(entry.productionUse)) {
      errors.push(
        `Runtime entry ${entry.id} has unknown productionUse policy: ${entry.productionUse}`,
      );
    }
    if (!isNonEmptyString(entry.capability)) {
      errors.push(`Runtime entry ${entry.id} has an empty capability.`);
    }
    if (!isNonEmptyString(entry.owner)) {
      errors.push(`Runtime entry ${entry.id} has an empty owner.`);
    }
    if (!isNonEmptyString(entry.responsibility)) {
      errors.push(`Runtime entry ${entry.id} has an empty responsibility.`);
    }

    const absolutePath = join(root, entry.path);
    if (entry.classification === "removed") {
      if (existsSync(absolutePath)) {
        errors.push(
          `Removed runtime entry ${entry.id} still exists at ${entry.path}.`,
        );
      }
    } else if (!existsSync(absolutePath)) {
      errors.push(`Runtime entry ${entry.id} is missing: ${entry.path}`);
    }

    if (
      (entry.classification === "preview" ||
        entry.classification === "deprecated") &&
      !isNonEmptyString(entry.replacement)
    ) {
      warnings.push(
        `Runtime entry ${entry.id} has no replacement path recorded.`,
      );
    }

    if (entry.replacement && entry.replacement === entry.id) {
      errors.push(`Runtime entry ${entry.id} cannot replace itself.`);
    }
  }

  for (const entry of entries) {
    if (entry.replacement && !entryById.has(entry.replacement)) {
      errors.push(
        `Runtime entry ${entry.id} references unknown replacement ${entry.replacement}.`,
      );
    }
  }

  for (const [capability, canonicalId] of Object.entries(
    registry.canonicalByCapability ?? {},
  )) {
    const canonical = entryById.get(canonicalId);
    if (!canonical) {
      errors.push(
        `Canonical capability ${capability} references unknown entry ${canonicalId}.`,
      );
      continue;
    }
    if (canonical.classification !== "canonical") {
      errors.push(
        `Canonical capability ${capability} points to non-canonical entry ${canonicalId}.`,
      );
    }
    if (canonical.capability !== capability) {
      errors.push(
        `Canonical capability ${capability} points to ${canonicalId} with capability ${canonical.capability}.`,
      );
    }

    const canonicalEntries = entries.filter(
      (entry) =>
        entry.capability === capability && entry.classification === "canonical",
    );
    if (canonicalEntries.length !== 1) {
      errors.push(
        `Capability ${capability} must have exactly one canonical entry; found ${canonicalEntries.length}.`,
      );
    }
  }

  const discoveredEntrypoints = new Set<string>();
  for (const rule of registry.inventoryRules ?? []) {
    if (!isNonEmptyString(rule.root) || !isNonEmptyString(rule.pattern)) {
      errors.push("Runtime inventory rule must define a root and pattern.");
      continue;
    }

    let pattern: RegExp;
    try {
      pattern = new RegExp(rule.pattern, "i");
    } catch {
      errors.push(`Invalid runtime inventory pattern: ${rule.pattern}`);
      continue;
    }

    const absoluteRoot = join(root, rule.root);
    if (!existsSync(absoluteRoot)) {
      errors.push(`Runtime inventory root does not exist: ${rule.root}`);
      continue;
    }

    for (const absoluteFile of collectTypeScriptFiles(absoluteRoot)) {
      const path = repositoryPath(absoluteFile);
      if (pattern.test(path)) discoveredEntrypoints.add(path);
    }
  }

  for (const path of [...discoveredEntrypoints].sort()) {
    if (!entryByPath.has(path)) {
      errors.push(`Unregistered runtime entrypoint discovered: ${path}`);
    }
  }

  const importUses: ImportUse[] = [];
  const acknowledgedPreviewImports: ImportUse[] = [];
  const productionFiles = collectTypeScriptFiles(sourceRoot);

  for (const absoluteFile of productionFiles) {
    const importer = repositoryPath(absoluteFile);
    const sourceText = readFileSync(absoluteFile, "utf8");
    const sourceFile = ts.createSourceFile(
      importer,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      absoluteFile.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    for (const specification of extractSpecifiers(sourceFile)) {
      const target = resolveImportTarget(
        absoluteFile,
        specification.importPath,
      );
      if (!target) continue;

      const targetPath = repositoryPath(target);
      const entry = entryByPath.get(targetPath);
      if (!entry) continue;

      const use: ImportUse = {
        importer,
        targetId: entry.id,
        targetPath,
        importPath: specification.importPath,
        kind: specification.kind,
      };
      importUses.push(use);

      const allowedImporters = new Set(entry.allowedImporters ?? []);
      const isAllowedImporter = allowedImporters.has(importer);

      if (
        (entry.classification === "deprecated" ||
          entry.classification === "removed") &&
        !isAllowedImporter
      ) {
        errors.push(
          `${entry.classification} runtime ${entry.id} is imported by ${importer}. Use ${entry.replacement ?? "the recorded replacement"}.`,
        );
      } else if (entry.classification === "preview") {
        if (!isAllowedImporter) {
          errors.push(
            `Preview runtime ${entry.id} is imported by unapproved production file ${importer}.`,
          );
        } else {
          acknowledgedPreviewImports.push(use);
        }
      }
    }
  }

  const countClassification = (
    classification: RuntimeEntry["classification"],
  ): number =>
    entries.filter((entry) => entry.classification === classification).length;

  const report: ValidationReport = {
    schemaVersion: 1,
    status: errors.length === 0 ? "PASS" : "FAIL",
    generatedAt: new Date().toISOString(),
    registryPath: repositoryPath(registryPath),
    counts: {
      entries: entries.length,
      canonical: countClassification("canonical"),
      boundedAdapters: countClassification("bounded-adapter"),
      preview: countClassification("preview"),
      deprecated: countClassification("deprecated"),
      removed: countClassification("removed"),
      discoveredEntrypoints: discoveredEntrypoints.size,
      productionFilesScanned: productionFiles.length,
      registeredImports: importUses.length,
      acknowledgedPreviewImports: acknowledgedPreviewImports.length,
    },
    canonicalByCapability: registry.canonicalByCapability ?? {},
    discoveredEntrypoints: [...discoveredEntrypoints].sort(),
    importUses,
    acknowledgedPreviewImports,
    errors,
    warnings,
  };

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("Runtime ownership validation");
  console.log(`  status: ${report.status}`);
  console.log(`  entries: ${report.counts.entries}`);
  console.log(`  canonical: ${report.counts.canonical}`);
  console.log(`  bounded adapters: ${report.counts.boundedAdapters}`);
  console.log(`  preview: ${report.counts.preview}`);
  console.log(`  deprecated: ${report.counts.deprecated}`);
  console.log(
    `  discovered entrypoints: ${report.counts.discoveredEntrypoints}`,
  );
  console.log(
    `  production files scanned: ${report.counts.productionFilesScanned}`,
  );
  console.log(`  registered imports: ${report.counts.registeredImports}`);
  console.log(
    `  acknowledged preview imports: ${report.counts.acknowledgedPreviewImports}`,
  );
  console.log(`  report: ${repositoryPath(reportPath)}`);

  for (const warning of warnings) console.warn(`  warning: ${warning}`);
  for (const error of errors) console.error(`  error: ${error}`);

  if (errors.length > 0) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
}
