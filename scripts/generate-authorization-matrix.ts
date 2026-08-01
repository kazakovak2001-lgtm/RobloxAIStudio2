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

function operationKey(
  operation: Pick<MatrixOperation, "transport" | "source" | "operation">,
): string {
  return `${operation.transport}|${operation.source}|${operation.operation}`;
}

function discoverOperations(): Array<
  Pick<MatrixOperation, "transport" | "source" | "operation">
> {
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

function classified(
  classification: string,
  principal: string,
  capability: string,
  resourceScope: string,
  positiveEvidence: string,
  negativeEvidence: string,
): Omit<MatrixOperation, "transport" | "source" | "operation"> {
  return {
    classification,
    principal,
    capability,
    resourceScope,
    positiveEvidence,
    negativeEvidence,
  };
}

const publicEvidence =
  "server/src/__tests__/security2gE.authorization-domains.test.ts";
const userSelfEvidence = publicEvidence;
const projectEvidence = "server/src/routes/__tests__/projects.runtime.test.ts";

const overrides = new Map<
  string,
  Omit<MatrixOperation, "transport" | "source" | "operation">
>([
  [
    "rest|server/src/index.ts|GET /health",
    classified(
      "public",
      "anonymous",
      "system.health.read",
      "system",
      publicEvidence,
      "not-applicable-public",
    ),
  ],
  [
    "rest|server/src/index.ts|GET /",
    classified(
      "public",
      "anonymous",
      "system.root.read",
      "system",
      publicEvidence,
      "not-applicable-public",
    ),
  ],
  [
    "rest|server/src/routes/system.ts|GET /status",
    classified(
      "public",
      "anonymous",
      "system.status.read",
      "system",
      publicEvidence,
      "not-applicable-public",
    ),
  ],
  [
    "rest|server/src/routes/system.ts|GET /agents",
    classified(
      "public",
      "anonymous",
      "system.agents.read",
      "system",
      publicEvidence,
      "not-applicable-public",
    ),
  ],
  ...[
    "POST /auth/register",
    "POST /auth/login",
    "POST /auth/logout",
    "POST /auth/refresh",
    "POST /auth/forgot-password",
  ].map(
    (operation) =>
      [
        `rest|server/src/routes/platform.ts|${operation}`,
        classified(
          "public",
          "anonymous",
          `auth.${operation.split("/").at(-1)!.replace("-", ".")}`,
          "authentication",
          publicEvidence,
          "not-applicable-public",
        ),
      ] as const,
  ),
  [
    "rest|server/src/routes/platform.ts|GET /auth/me",
    classified(
      "authenticated",
      "user-session",
      "user.self.read",
      "current-user",
      userSelfEvidence,
      userSelfEvidence,
    ),
  ],
  ...[
    ["GET /users/:id", "user.self.read"],
    ["PATCH /users/:id", "user.self.update"],
    ["GET /users/:id/preferences", "user.preferences.read"],
    ["PUT /users/:id/preferences", "user.preferences.update"],
    ["GET /users/:id/limits", "user.limits.read"],
  ].map(
    ([operation, capability]) =>
      [
        `rest|server/src/routes/platform.ts|${operation}`,
        classified(
          "user-self",
          "user-session",
          capability,
          "path-user",
          userSelfEvidence,
          userSelfEvidence,
        ),
      ] as const,
  ),
  ...[
    ["GET /versions/:projectId", "project.versions.read"],
    ["POST /versions/:projectId", "project.versions.create"],
  ].map(
    ([operation, capability]) =>
      [
        `rest|server/src/routes/platform.ts|${operation}`,
        classified(
          "project-owner",
          "user-session",
          capability,
          "path-project",
          projectEvidence,
          projectEvidence,
        ),
      ] as const,
  ),
]);

const current = JSON.parse(
  fs.readFileSync(matrixPath, "utf8"),
) as AuthorizationMatrix;
const currentByKey = new Map(
  current.operations.map((operation) => [operationKey(operation), operation]),
);

const operations = discoverOperations().map((operation): MatrixOperation => {
  const override = overrides.get(operationKey(operation));
  if (override) return { ...operation, ...override };

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
