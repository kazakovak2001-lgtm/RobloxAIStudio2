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

const repositoryRoot = path.resolve(__dirname, "../../..");
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

function discoverOperations(): string[] {
  const discovered = new Set<string>();
  const restPattern = /\b(?:app|router)\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;
  const socketPattern = /\bsocket\.on\(\s*["'`]([^"'`]+)["'`]/g;

  for (const file of listTypeScriptFiles(serverRoot)) {
    const source = relativeSource(file);
    const content = fs.readFileSync(file, "utf8");

    for (const match of content.matchAll(restPattern)) {
      discovered.add(`rest|${source}|${match[1].toUpperCase()} ${match[2]}`);
    }
    for (const match of content.matchAll(socketPattern)) {
      if (match[1] === "disconnect") continue;
      discovered.add(`socket|${source}|${match[1]}`);
    }
  }

  return [...discovered].sort();
}

function matrixKeys(matrix: AuthorizationMatrix): string[] {
  return matrix.operations
    .map((entry) => `${entry.transport}|${entry.source}|${entry.operation}`)
    .sort();
}

describe("SECURITY-2G-E authorization inventory", () => {
  const matrix = JSON.parse(
    fs.readFileSync(matrixPath, "utf8"),
  ) as AuthorizationMatrix;

  it("uses the exact control contract", () => {
    expect(matrix.version).toBe(1);
    expect(matrix.controlId).toBe("SECURITY-2G-E");
  });

  it("classifies every statically registered REST and Socket.IO operation", () => {
    const discovered = discoverOperations();
    const tracked = matrixKeys(matrix);
    const untracked = discovered.filter((operation) => !tracked.includes(operation));
    const stale = tracked.filter((operation) => !discovered.includes(operation));

    expect({ untracked, stale }).toEqual({ untracked: [], stale: [] });
  });

  it("requires explicit authorization semantics and evidence", () => {
    for (const operation of matrix.operations) {
      expect(operation.classification).not.toBe("");
      expect(operation.principal).not.toBe("");
      expect(operation.capability).not.toBe("");
      expect(operation.resourceScope).not.toBe("");
      expect(operation.positiveEvidence).not.toBe("missing");
      if (operation.classification !== "public") {
        expect(operation.negativeEvidence).not.toBe("missing");
      }
    }
  });
});
