import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

const root = process.cwd();
const tsconfigPath = join(root, "server/tsconfig.json");
const registryPath = join(
  root,
  "config/durability/compatibility-write-inventory.json",
);
const reportPath = join(
  root,
  "artifacts/durability/compatibility-write-report.json",
);

const storageDeclarationPaths = new Set([
  "server/src/platform/storage/StorageProvider.ts",
  "server/src/platform/storage/postgres/PostgresStorageProvider.ts",
]);
const ignoredConsumerRoots = ["server/src/platform/storage/"];
const allowedClassifications = new Set([
  "request-level-debt",
  "internal-lifecycle-debt",
  "bootstrap-compatibility",
  "multi-record-deferred",
]);

type CompatibilityOperation = "set" | "delete";
type CompatibilityClassification =
  | "request-level-debt"
  | "internal-lifecycle-debt"
  | "bootstrap-compatibility"
  | "multi-record-deferred";

interface CompatibilityWriteEntry {
  key: string;
  path: string;
  owner: string;
  operation: CompatibilityOperation;
  expectedCalls: number;
  classification: CompatibilityClassification;
  reason: string;
  migrationTarget: "DATA-201B" | "DATA-201C";
}

interface CompatibilityWriteRegistry {
  schemaVersion: number;
  purpose: string;
  classifications: string[];
  entries: CompatibilityWriteEntry[];
}

interface CompatibilityWriteUse {
  key: string;
  path: string;
  owner: string;
  operation: CompatibilityOperation;
  line: number;
  column: number;
}

interface CompatibilityWriteGroup {
  key: string;
  path: string;
  owner: string;
  operation: CompatibilityOperation;
  calls: number;
  locations: Array<{ line: number; column: number }>;
}

interface CompatibilityWriteReport {
  schemaVersion: 1;
  status: "PASS" | "FAIL";
  generatedAt: string;
  registryPath: string;
  counts: {
    discoveredCalls: number;
    discoveredGroups: number;
    registeredGroups: number;
    requestLevelDebt: number;
    internalLifecycleDebt: number;
    bootstrapCompatibility: number;
    multiRecordDeferred: number;
  };
  discoveredUses: CompatibilityWriteUse[];
  discoveredGroups: CompatibilityWriteGroup[];
  registeredEntries: CompatibilityWriteEntry[];
  errors: string[];
  warnings: string[];
}

function repositoryPath(absolutePath: string): string {
  return relative(root, absolutePath).replaceAll("\\", "/");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isCompatibilityOperation(
  value: string,
): value is CompatibilityOperation {
  return value === "set" || value === "delete";
}

function nodeName(node: ts.Node): string | undefined {
  if (
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  ) {
    return node.name.getText();
  }
  if (ts.isConstructorDeclaration(node)) return "constructor";
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
  if (ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
    const parent = node.parent;
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.text;
    }
    if (ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) {
      return parent.name.getText();
    }
  }
  return undefined;
}

function enclosingOwner(node: ts.Node): string {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    const name = nodeName(current);
    if (name) {
      let className = "";
      let parent = current.parent;
      while (parent) {
        if (ts.isClassDeclaration(parent) && parent.name) {
          className = `${parent.name.text}.`;
          break;
        }
        parent = parent.parent;
      }
      return `${className}${name}`;
    }
    current = current.parent;
  }
  return "<module>";
}

function isProductionConsumer(sourceFile: ts.SourceFile): boolean {
  const path = repositoryPath(sourceFile.fileName);
  return (
    path.startsWith("server/src/") &&
    !sourceFile.isDeclarationFile &&
    !path.includes("/__tests__/") &&
    !path.endsWith(".test.ts") &&
    !path.endsWith(".spec.ts") &&
    !path.includes("/_quarantine/") &&
    !ignoredConsumerRoots.some((prefix) => path.startsWith(prefix))
  );
}

function declarationMatchesStorageMethod(
  declaration: ts.Declaration,
  operation: CompatibilityOperation,
): boolean {
  const path = repositoryPath(declaration.getSourceFile().fileName);
  if (!storageDeclarationPaths.has(path)) return false;

  if (
    ts.isMethodSignature(declaration) ||
    ts.isMethodDeclaration(declaration)
  ) {
    return declaration.name.getText() === operation;
  }
  return false;
}

function isStorageCompatibilityCall(
  checker: ts.TypeChecker,
  expression: ts.PropertyAccessExpression,
  operation: CompatibilityOperation,
): boolean {
  const symbol = checker.getSymbolAtLocation(expression.name);
  if (!symbol) return false;
  return (symbol.getDeclarations() ?? []).some((declaration) =>
    declarationMatchesStorageMethod(declaration, operation),
  );
}

function loadProgram(): ts.Program {
  const configResult = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configResult.error) {
    throw new Error(
      ts.flattenDiagnosticMessageText(configResult.error.messageText, "\n"),
    );
  }
  const parsed = ts.parseJsonConfigFileContent(
    configResult.config,
    ts.sys,
    dirname(tsconfigPath),
    undefined,
    tsconfigPath,
  );
  if (parsed.errors.length > 0) {
    throw new Error(
      parsed.errors
        .map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        )
        .join("\n"),
    );
  }
  return ts.createProgram(parsed.fileNames, parsed.options);
}

function discoverCompatibilityWrites(
  program: ts.Program,
): CompatibilityWriteUse[] {
  const checker = program.getTypeChecker();
  const uses: CompatibilityWriteUse[] = [];

  for (const sourceFile of program.getSourceFiles()) {
    if (!isProductionConsumer(sourceFile)) continue;
    const path = repositoryPath(sourceFile.fileName);

    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression)
      ) {
        const operation = node.expression.name.text;
        if (
          isCompatibilityOperation(operation) &&
          isStorageCompatibilityCall(checker, node.expression, operation)
        ) {
          const owner = enclosingOwner(node);
          const position = sourceFile.getLineAndCharacterOfPosition(
            node.getStart(sourceFile),
          );
          uses.push({
            key: `${path}#${owner}#${operation}`,
            path,
            owner,
            operation,
            line: position.line + 1,
            column: position.character + 1,
          });
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return uses.sort((left, right) =>
    left.key === right.key
      ? left.line - right.line || left.column - right.column
      : left.key.localeCompare(right.key),
  );
}

function groupUses(uses: CompatibilityWriteUse[]): CompatibilityWriteGroup[] {
  const groups = new Map<string, CompatibilityWriteGroup>();
  for (const use of uses) {
    const current = groups.get(use.key);
    if (current) {
      current.calls += 1;
      current.locations.push({ line: use.line, column: use.column });
    } else {
      groups.set(use.key, {
        key: use.key,
        path: use.path,
        owner: use.owner,
        operation: use.operation,
        calls: 1,
        locations: [{ line: use.line, column: use.column }],
      });
    }
  }
  return [...groups.values()].sort((left, right) =>
    left.key.localeCompare(right.key),
  );
}

function main(): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!existsSync(registryPath)) {
    throw new Error(`Compatibility write inventory not found: ${registryPath}`);
  }

  const registry = JSON.parse(
    readFileSync(registryPath, "utf8"),
  ) as CompatibilityWriteRegistry;
  if (registry.schemaVersion !== 1) {
    errors.push(
      `Unsupported compatibility write schemaVersion: ${registry.schemaVersion}`,
    );
  }
  if (!isNonEmptyString(registry.purpose)) {
    errors.push("Compatibility write inventory must define its purpose.");
  }
  if (!Array.isArray(registry.entries)) {
    errors.push("Compatibility write inventory must define entries.");
  }

  const entries = Array.isArray(registry.entries) ? registry.entries : [];
  const entryByKey = new Map<string, CompatibilityWriteEntry>();
  for (const entry of entries) {
    if (!isNonEmptyString(entry.key)) {
      errors.push("Compatibility write entry has an empty key.");
      continue;
    }
    if (entryByKey.has(entry.key)) {
      errors.push(`Duplicate compatibility write entry: ${entry.key}`);
    }
    entryByKey.set(entry.key, entry);

    const expectedKey = `${entry.path}#${entry.owner}#${entry.operation}`;
    if (entry.key !== expectedKey) {
      errors.push(
        `Compatibility write entry key mismatch: ${entry.key}; expected ${expectedKey}.`,
      );
    }
    if (!allowedClassifications.has(entry.classification)) {
      errors.push(
        `Compatibility write entry ${entry.key} has unknown classification ${entry.classification}.`,
      );
    }
    if (!Number.isInteger(entry.expectedCalls) || entry.expectedCalls < 1) {
      errors.push(
        `Compatibility write entry ${entry.key} must declare expectedCalls >= 1.`,
      );
    }
    if (!isNonEmptyString(entry.reason)) {
      errors.push(
        `Compatibility write entry ${entry.key} must document a reason.`,
      );
    }
    if (
      entry.migrationTarget !== "DATA-201B" &&
      entry.migrationTarget !== "DATA-201C"
    ) {
      errors.push(
        `Compatibility write entry ${entry.key} has invalid migrationTarget ${String(entry.migrationTarget)}.`,
      );
    }
    if (
      entry.classification === "multi-record-deferred" &&
      entry.migrationTarget !== "DATA-201C"
    ) {
      errors.push(
        `Multi-record compatibility write ${entry.key} must target DATA-201C.`,
      );
    }
    if (
      entry.classification !== "multi-record-deferred" &&
      entry.migrationTarget !== "DATA-201B"
    ) {
      errors.push(
        `Compatibility write ${entry.key} must target DATA-201B unless it is multi-record-deferred.`,
      );
    }
  }

  const uses = discoverCompatibilityWrites(loadProgram());
  const groups = groupUses(uses);
  const groupByKey = new Map(groups.map((group) => [group.key, group]));

  for (const group of groups) {
    const entry = entryByKey.get(group.key);
    if (!entry) {
      const location = group.locations[0];
      errors.push(
        `Unregistered StorageProvider compatibility write: ${group.key} (${group.path}:${location.line}:${location.column}; ${group.calls} call${group.calls === 1 ? "" : "s"}).`,
      );
      continue;
    }
    if (entry.expectedCalls !== group.calls) {
      errors.push(
        `Compatibility write count changed for ${group.key}: expected ${entry.expectedCalls}, discovered ${group.calls}.`,
      );
    }
  }

  for (const entry of entries) {
    if (!groupByKey.has(entry.key)) {
      errors.push(`Stale compatibility write entry: ${entry.key}.`);
    }
  }

  const report: CompatibilityWriteReport = {
    schemaVersion: 1,
    status: errors.length === 0 ? "PASS" : "FAIL",
    generatedAt: new Date().toISOString(),
    registryPath: repositoryPath(registryPath),
    counts: {
      discoveredCalls: uses.length,
      discoveredGroups: groups.length,
      registeredGroups: entries.length,
      requestLevelDebt: entries.filter(
        (entry) => entry.classification === "request-level-debt",
      ).length,
      internalLifecycleDebt: entries.filter(
        (entry) => entry.classification === "internal-lifecycle-debt",
      ).length,
      bootstrapCompatibility: entries.filter(
        (entry) => entry.classification === "bootstrap-compatibility",
      ).length,
      multiRecordDeferred: entries.filter(
        (entry) => entry.classification === "multi-record-deferred",
      ).length,
    },
    discoveredUses: uses,
    discoveredGroups: groups,
    registeredEntries: [...entries].sort((left, right) =>
      left.key.localeCompare(right.key),
    ),
    errors,
    warnings,
  };

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Compatibility write inventory: ${report.status}`);
  console.log(
    `Discovered ${report.counts.discoveredCalls} calls in ${report.counts.discoveredGroups} consumer groups; ${report.counts.registeredGroups} registered.`,
  );
  for (const warning of warnings) console.warn(`WARN: ${warning}`);
  for (const error of errors) console.error(`ERROR: ${error}`);

  if (errors.length > 0) process.exitCode = 1;
}

main();
