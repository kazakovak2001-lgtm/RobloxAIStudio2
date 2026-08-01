import fs from "node:fs";
import path from "node:path";

interface MatrixOperation {
  transport: "rest" | "socket";
  source: string;
  operation: string;
  classification: string;
  principal: string;
  capability: string;
  resourceScope: string;
  positiveEvidence: string;
  negativeEvidence: string;
}

interface AuthorizationMatrix {
  version: number;
  controlId: string;
  operations: MatrixOperation[];
}

const repositoryRoot = process.cwd();
const serverRoot = path.join(repositoryRoot, "server/src");
const matrixPath = path.join(
  repositoryRoot,
  "config/security/authorization-matrix.json",
);

function listTypeScriptFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") return [];
      return listTypeScriptFiles(absolutePath);
    }
    return entry.isFile() && entry.name.endsWith(".ts") ? [absolutePath] : [];
  });
}

function relativeSource(absolutePath: string): string {
  return path.relative(repositoryRoot, absolutePath).replaceAll(path.sep, "/");
}

function operationKey(operation: Pick<MatrixOperation, "transport" | "source" | "operation">): string {
  return `${operation.transport}|${operation.source}|${operation.operation}`;
}

function discoverOperations(): Array<Pick<MatrixOperation, "transport" | "source" | "operation">> {
  const discovered = new Map<
    string,
    Pick<MatrixOperation, "transport" | "source" | "operation">
  >();
  const restPattern =
    /\b(?:app|router)\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;
  const socketPattern = /\bsocket\.on\(\s*["'`]([^"'`]+)["'`]/g;

  for (const file of listTypeScriptFiles(serverRoot)) {
    const source = relativeSource(file);
    const content = fs.readFileSync(file, "utf8");

    for (const match of content.matchAll(restPattern)) {
      const operation = {
        transport: "rest" as const,
        source,
        operation: `${match[1].toUpperCase()} ${match[2]}`,
      };
      discovered.set(operationKey(operation), operation);
    }

    for (const match of content.matchAll(socketPattern)) {
      if (match[1] === "disconnect") continue;
      const operation = {
        transport: "socket" as const,
        source,
        operation: match[1],
      };
      discovered.set(operationKey(operation), operation);
    }
  }

  return [...discovered.values()].sort((left, right) =>
    operationKey(left).localeCompare(operationKey(right)),
  );
}

const current = JSON.parse(
  fs.readFileSync(matrixPath, "utf8"),
) as AuthorizationMatrix;
const currentByKey = new Map(
  current.operations.map((operation) => [operationKey(operation), operation]),
);

const operations = discoverOperations().map((operation): MatrixOperation => {
  const existing = currentByKey.get(operationKey(operation));
  if (existing) return existing;

  return {
    ...operation,
    classification: "unclassified",
    principal: "unresolved",
    capability: "unresolved",
    resourceScope: "unresolved",
    positiveEvidence: "missing",
    negativeEvidence: "missing",
  };
});

const next: AuthorizationMatrix = {
  version: 1,
  controlId: "SECURITY-2G-E",
  operations,
};

fs.writeFileSync(matrixPath, `${JSON.stringify(next, null, 2)}\n`);
console.log(`Authorization matrix now tracks ${operations.length} operations.`);
