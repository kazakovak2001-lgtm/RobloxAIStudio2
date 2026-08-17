import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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
  resourceBinding: string;
  crossTenantEvidence: string;
}

interface MatrixBroadcast {
  event: string;
  source: string;
  targeting: string;
  tenancyEvidence: string;
}

interface AuthorizationMatrix {
  version: number;
  controlId: string;
  operations: MatrixOperation[];
  broadcasts: MatrixBroadcast[];
}

const RESOURCE_BINDINGS = new Set([
  "path-scoped",
  "indirect-verified",
  "body-supplied-object",
  "indirect-unreviewed",
  "not-resource-scoped",
]);

const BROADCAST_TARGETING = new Set([
  "project-room",
  "project-room-with-global-fallback",
  "global-bypassing-available-scope",
  "global-no-project-context",
  "global-unreviewed",
]);

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
  const restPattern =
    /\b(?:app|router)\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;
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
    const untracked = discovered.filter(
      (operation) => !tracked.includes(operation),
    );
    const stale = tracked.filter(
      (operation) => !discovered.includes(operation),
    );

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

  // AUDIT object-binding sweep. `resourceScope` says where an identifier comes
  // from; these two fields say whether the gap between the authorized identifier
  // and the acted-on object is closed, and whether a foreign request is proven
  // to be refused. An operation may honestly be unreviewed, but it may not be
  // silently missing a verdict.
  it("records an object binding verdict and cross-tenant evidence per operation", () => {
    for (const operation of matrix.operations) {
      expect(
        RESOURCE_BINDINGS.has(operation.resourceBinding),
        `${operation.transport} ${operation.operation} has binding ${operation.resourceBinding}`,
      ).toBe(true);
      expect(operation.crossTenantEvidence).not.toBe("");
    }
  });

  it("tracks every global broadcast with a targeting verdict", () => {
    const pattern =
      /\bio\.emit\(\s*(?:["'`]([^"'`]+)["'`]|([A-Za-z_$][\w$]*))/g;
    const discovered = new Set<string>();
    for (const file of listTypeScriptFiles(serverRoot)) {
      const source = relativeSource(file);
      for (const match of fs.readFileSync(file, "utf8").matchAll(pattern)) {
        discovered.add(`${source}|${match[1] ?? `dynamic:${match[2]}`}`);
      }
    }

    const tracked = new Set(
      matrix.broadcasts.map((entry) => `${entry.source}|${entry.event}`),
    );
    expect({
      untracked: [...discovered].filter((key) => !tracked.has(key)).sort(),
      stale: [...tracked].filter((key) => !discovered.has(key)).sort(),
    }).toEqual({ untracked: [], stale: [] });

    for (const broadcast of matrix.broadcasts) {
      expect(
        BROADCAST_TARGETING.has(broadcast.targeting),
        `${broadcast.event} has targeting ${broadcast.targeting}`,
      ).toBe(true);
      expect(broadcast.tenancyEvidence).not.toBe("");
    }
  });
});
