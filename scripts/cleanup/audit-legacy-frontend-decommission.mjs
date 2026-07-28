import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const stageId = "CLEANUP-1B";
const inventoryPath = path.resolve(
  root,
  process.env.LEGACY_FRONTEND_AUDIT_INVENTORY ??
    "config/cleanup/legacy-frontend-decommission.inventory.json",
);
const outputDirectory = path.resolve(
  root,
  process.env.LEGACY_FRONTEND_AUDIT_OUTPUT ?? "artifacts/cleanup-1b",
);

mkdirSync(outputDirectory, { recursive: true });
process.on("uncaughtException", (error) => {
  const failure = {
    status: "failed",
    roadmapId: stageId,
    generatedAt: new Date().toISOString(),
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
  writeFileSync(
    path.join(outputDirectory, "legacy-frontend-audit-failure.json"),
    `${JSON.stringify(failure, null, 2)}\n`,
  );
  console.error(error);
  process.exit(1);
});

const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
assert.equal(
  inventory.schemaVersion,
  2,
  "Unsupported cleanup inventory schema",
);
assert.equal(inventory.roadmapId, stageId);
assert.equal(inventory.status, "tooling-decoupled");
assert.equal(
  inventory.currentStageDeletionAuthorized,
  false,
  "CLEANUP-1B must not authorize deletion",
);
assert.equal(inventory.nextStage, "CLEANUP-1C");

const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

execFileSync(
  "git",
  [
    "merge-base",
    "--is-ancestor",
    inventory.baseline.minimumAncestorCommit,
    "HEAD",
  ],
  { cwd: root, stdio: "pipe" },
);

const head = git("rev-parse", "HEAD");
const trackedFiles = git("ls-files")
  .split("\n")
  .map((file) => file.trim())
  .filter(Boolean)
  .sort();
const changedSinceBaseline = git(
  "diff",
  "--name-only",
  `${inventory.baseline.minimumAncestorCommit}...HEAD`,
)
  .split("\n")
  .map((file) => file.trim())
  .filter(Boolean)
  .sort();

const allowedStageChanges = new Set(
  inventory.stageChangePolicy.allowedChangedFiles,
);
const unexpectedStageChanges = changedSinceBaseline.filter(
  (file) => !allowedStageChanges.has(file),
);
assert.deepEqual(
  unexpectedStageChanges,
  [],
  `CLEANUP-1B changed files outside its tooling/documentation scope: ${unexpectedStageChanges.join(
    ", ",
  )}`,
);

const sourcePrefix = `${inventory.legacyFrontend.sourceRoot}/`;
const actualLegacyFiles = trackedFiles
  .filter((file) => file.startsWith(sourcePrefix))
  .sort();
const expectedLegacyFiles = [
  ...inventory.legacyFrontend.expectedTrackedFiles,
].sort();

assert.deepEqual(
  actualLegacyFiles,
  expectedLegacyFiles,
  "Tracked root src inventory changed; CLEANUP-1B must preserve all CLEANUP-1A source files",
);

const protectedUnchangedFiles = new Set([
  ...inventory.legacyFrontend.expectedTrackedFiles,
  ...inventory.legacyFrontend.configurationFiles,
  ...inventory.legacyFrontend.archivalDeploymentFiles,
  ...inventory.legacyFrontend.separateInfrastructureFiles.map(
    (entry) => entry.path,
  ),
  ...inventory.legacyFrontend.staleInventoryFiles,
  ...inventory.stageChangePolicy.additionalProtectedFiles,
]);
const protectedPathChanges = changedSinceBaseline.filter(
  (file) => file.startsWith(sourcePrefix) || protectedUnchangedFiles.has(file),
);
assert.deepEqual(
  protectedPathChanges,
  [],
  `CLEANUP-1B protected legacy/runtime files changed: ${protectedPathChanges.join(
    ", ",
  )}`,
);

const legacyFileEvidence = expectedLegacyFiles.map((file) => {
  const absolutePath = path.join(root, file);
  assert.ok(existsSync(absolutePath), `Missing legacy source file: ${file}`);
  assert.ok(
    statSync(absolutePath).isFile(),
    `Legacy path is not a file: ${file}`,
  );
  const content = readFileSync(absolutePath);
  return {
    path: file,
    sizeBytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
});

for (const file of [
  ...inventory.legacyFrontend.entrypoints,
  ...inventory.legacyFrontend.configurationFiles,
  ...inventory.legacyFrontend.generatedResidue,
  ...inventory.legacyFrontend.archivalDeploymentFiles,
  ...inventory.legacyFrontend.staleInventoryFiles,
]) {
  const absolutePath = path.join(root, file);
  assert.ok(
    existsSync(absolutePath),
    `Missing classified legacy path: ${file}`,
  );
  assert.ok(
    statSync(absolutePath).isFile(),
    `Classified path is not a file: ${file}`,
  );
}

for (const entry of inventory.legacyFrontend.separateInfrastructureFiles) {
  const absolutePath = path.join(root, entry.path);
  assert.ok(
    existsSync(absolutePath),
    `Missing separate infrastructure file: ${entry.path}`,
  );
  const content = readFileSync(absolutePath, "utf8");
  assert.doesNotMatch(
    content,
    /\b(?:src\/|vite|index\.html|frontend)\b/i,
    `${entry.path} is not independent from the legacy frontend`,
  );
}

for (const entry of inventory.legacyFrontend.knownMissingPaths) {
  assert.ok(
    !existsSync(path.join(root, entry.path)),
    `Known-missing path unexpectedly exists: ${entry.path}`,
  );
}

const packageJson = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8"),
);
const baselinePackageJson = JSON.parse(
  git("show", `${inventory.baseline.minimumAncestorCommit}:package.json`),
);
assert.deepEqual(
  packageJson.dependencies,
  baselinePackageJson.dependencies,
  "CLEANUP-1B must not change runtime dependency declarations",
);
assert.deepEqual(
  packageJson.devDependencies,
  baselinePackageJson.devDependencies,
  "CLEANUP-1B must not change development dependency declarations",
);

for (const [name, expectedCommand] of Object.entries(
  inventory.toolingContract.packageScripts,
)) {
  assert.equal(
    packageJson.scripts?.[name],
    expectedCommand,
    `Backend tooling script ${name} differs from the CLEANUP-1B contract`,
  );
}

const rootTsconfig = JSON.parse(
  readFileSync(path.join(root, "tsconfig.json"), "utf8"),
);
assert.deepEqual(
  rootTsconfig.include,
  inventory.toolingContract.rootTsconfig.include,
  "Preserved root TypeScript include changed",
);
for (const [alias, targets] of Object.entries(
  inventory.toolingContract.rootTsconfig.pathAlias,
)) {
  assert.deepEqual(
    rootTsconfig.compilerOptions?.paths?.[alias],
    targets,
    `Preserved root TypeScript alias ${alias} changed`,
  );
}

const vitestConfigPath = inventory.toolingContract.vitestBackendConfig.path;
const vitestConfig = readFileSync(path.join(root, vitestConfigPath), "utf8");
for (const includePattern of inventory.toolingContract.vitestBackendConfig
  .include) {
  assert.ok(
    vitestConfig.includes(includePattern),
    `Backend Vitest include is missing: ${includePattern}`,
  );
}
for (const marker of inventory.toolingContract.vitestBackendConfig
  .forbiddenMarkers) {
  assert.ok(
    !vitestConfig.includes(marker),
    `Backend Vitest config still references legacy tooling: ${marker}`,
  );
}

const architectureValidator = readFileSync(
  path.join(root, "scripts/validate-architecture.ts"),
  "utf8",
);
for (const marker of inventory.toolingContract
  .architectureValidatorRequiredMarkers) {
  assert.ok(
    architectureValidator.includes(marker),
    `Canonical architecture marker is missing: ${marker}`,
  );
}
for (const marker of inventory.toolingContract
  .architectureValidatorForbiddenMarkers) {
  assert.ok(
    !architectureValidator.includes(marker),
    `Dual-root architecture marker remains active: ${marker}`,
  );
}

const combinedDockerfile = readFileSync(path.join(root, "Dockerfile"), "utf8");
for (const marker of inventory.toolingContract.combinedDockerfileMarkers) {
  assert.ok(
    combinedDockerfile.includes(marker),
    `Archival combined Dockerfile marker disappeared: ${marker}`,
  );
}

const ciWorkflow = readFileSync(
  path.join(root, ".github/workflows/ci.yml"),
  "utf8",
);
for (const marker of inventory.toolingContract.ciRequiredMarkers) {
  assert.ok(ciWorkflow.includes(marker), `CI marker is missing: ${marker}`);
}
for (const marker of inventory.toolingContract.ciForbiddenMarkers) {
  assert.ok(
    !ciWorkflow.includes(marker),
    `CI still contains legacy tooling marker: ${marker}`,
  );
}
assert.ok(
  ciWorkflow.includes("audit-legacy-frontend-decommission.mjs"),
  "The protected cleanup verifier invocation is missing from CI",
);
const gateJobMatch = ciWorkflow.match(
  /\n  gate:\n([\s\S]*?)(?=\n  [A-Za-z0-9_-]+:\n|$)/,
);
assert.ok(gateJobMatch, "Unable to locate the Merge Gate job");
const gateNeedsMatch = gateJobMatch[1].match(
  /\n    needs:\n([\s\S]*?)\n    steps:/,
);
assert.ok(gateNeedsMatch, "Unable to locate the Merge Gate needs block");
assert.match(
  gateNeedsMatch[1],
  /(?:^|[\s,\[])legacy-frontend-audit(?:[\s,\]]|$)/,
  "Merge Gate does not depend on legacy-frontend-audit",
);

const releaseInventoryPath = path.join(root, inventory.sourceReleaseInventory);
const releaseInventory = JSON.parse(readFileSync(releaseInventoryPath, "utf8"));
assert.equal(releaseInventory.roadmapId, "CUTOVER-1D");
assert.deepEqual(
  inventory.canonicalFrontend,
  releaseInventory.frontendRelease,
  "Canonical Frontend identity differs from the CUTOVER release inventory",
);
for (const releasePath of releaseInventory.activeRelease.files) {
  const absolutePath = path.join(root, releasePath);
  assert.ok(
    existsSync(absolutePath),
    `Missing active release file: ${releasePath}`,
  );
  const content = readFileSync(absolutePath, "utf8");
  for (const pattern of releaseInventory.activeRelease.forbiddenPatterns) {
    const regex = new RegExp(pattern.regex, "i");
    assert.ok(
      !regex.test(content),
      `${releasePath} violates ${pattern.id}: ${pattern.description}`,
    );
  }
}

const allowedLegacyToolConsumers = new Set(
  inventory.packageDisposition.allowedLegacyToolConsumers,
);
const consumerExtensions = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

function scriptKindForFile(file) {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (file.endsWith(".ts") || file.endsWith(".mts") || file.endsWith(".cts")) {
    return ts.ScriptKind.TS;
  }
  return ts.ScriptKind.JS;
}

function moduleSpecifiersInFile(file, content) {
  const sourceFile = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForFile(file),
  );
  const moduleSpecifiers = new Set();

  const recordSpecifier = (node) => {
    if (node && ts.isStringLiteralLike(node)) {
      moduleSpecifiers.add(node.text);
    }
  };

  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    ) {
      recordSpecifier(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      recordSpecifier(node.moduleReference.expression);
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    ) {
      recordSpecifier(node.arguments[0]);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return [...moduleSpecifiers];
}

function packageConsumersOutsideLegacyRoot(packageName) {
  return trackedFiles.filter((file) => {
    if (file.startsWith(sourcePrefix)) return false;
    if (!consumerExtensions.has(path.extname(file))) return false;
    const absolutePath = path.join(root, file);
    if (!existsSync(absolutePath)) return false;

    const moduleSpecifiers = moduleSpecifiersInFile(
      file,
      readFileSync(absolutePath, "utf8"),
    );
    return moduleSpecifiers.some(
      (specifier) =>
        specifier === packageName || specifier.startsWith(`${packageName}/`),
    );
  });
}

function assertPackageDeclared(packageName) {
  assert.ok(
    packageJson.dependencies?.[packageName] ??
      packageJson.devDependencies?.[packageName],
    `Classified package is not declared: ${packageName}`,
  );
}

const packageConsumerEvidence = {};

for (const entry of inventory.packageDisposition.retainOperational) {
  assertPackageDeclared(entry.name);
  const consumers = packageConsumersOutsideLegacyRoot(entry.name).sort();
  const expected = [...entry.expectedConsumersOutsideLegacyRoot].sort();
  assert.deepEqual(
    consumers,
    expected,
    `Operational package ${entry.name} consumers changed`,
  );
  packageConsumerEvidence[entry.name] = {
    classification: "retain-operational",
    consumersOutsideLegacyRoot: consumers,
    reason: entry.reason,
  };
}

for (const packageName of inventory.packageDisposition.legacyOnlyCandidates) {
  assertPackageDeclared(packageName);
  const consumers = packageConsumersOutsideLegacyRoot(packageName);
  assert.deepEqual(
    consumers,
    [],
    `Legacy-only package ${packageName} has a consumer outside root src`,
  );
  packageConsumerEvidence[packageName] = {
    classification: "legacy-only-candidate",
    consumersOutsideLegacyRoot: consumers,
  };
}

for (const packageName of inventory.packageDisposition
  .legacyToolingCandidates) {
  assertPackageDeclared(packageName);
  const consumers = packageConsumersOutsideLegacyRoot(packageName).sort();
  const unexpectedConsumers = consumers.filter(
    (file) => !allowedLegacyToolConsumers.has(file),
  );
  assert.deepEqual(
    unexpectedConsumers,
    [],
    `Legacy tooling package ${packageName} has an unexpected non-legacy consumer`,
  );
  packageConsumerEvidence[packageName] = {
    classification: "legacy-tooling-candidate",
    consumersOutsideLegacyRoot: consumers,
  };
}

assert.deepEqual(
  inventory.removalWaves.map((wave) => wave.id),
  ["CLEANUP-1B", "CLEANUP-1C", "CLEANUP-1D"],
  "Cleanup waves must remain ordered",
);
assert.equal(inventory.removalWaves[0].deletionAuthorized, false);
assert.equal(inventory.removalWaves[1].deletionAuthorized, true);
assert.equal(inventory.removalWaves[2].deletionAuthorized, false);

const result = {
  status: "passed",
  roadmapId: inventory.roadmapId,
  generatedAt: new Date().toISOString(),
  auditedHead: head,
  baseline: inventory.baseline,
  canonicalFrontend: inventory.canonicalFrontend,
  stageChangePolicy: {
    changedSinceBaseline,
    allowedChangedFiles: [...allowedStageChanges].sort(),
    unexpectedStageChanges,
    protectedFileCount: protectedUnchangedFiles.size,
    protectedPathChanges,
  },
  legacyFrontend: {
    sourceRoot: inventory.legacyFrontend.sourceRoot,
    trackedFileCount: actualLegacyFiles.length,
    trackedFiles: legacyFileEvidence,
    entrypoints: inventory.legacyFrontend.entrypoints,
    configurationFiles: inventory.legacyFrontend.configurationFiles,
    generatedResidue: inventory.legacyFrontend.generatedResidue,
    archivalDeploymentFiles: inventory.legacyFrontend.archivalDeploymentFiles,
    separateInfrastructureFiles:
      inventory.legacyFrontend.separateInfrastructureFiles,
    knownMissingPaths: inventory.legacyFrontend.knownMissingPaths,
  },
  tooling: {
    packageScripts: inventory.toolingContract.packageScripts,
    dependencyDeclarationsChanged: false,
    rootTypeScriptScope: inventory.toolingContract.rootTsconfig.classification,
    backendVitestConfig: inventory.toolingContract.vitestBackendConfig,
    architectureModel: "BACKEND + STANDALONE FRONTEND",
    mergeGateDependencyVerified: "legacy-frontend-audit",
  },
  packageConsumerEvidence,
  activeReleaseIsolation: {
    sourceInventory: inventory.sourceReleaseInventory,
    filesVerified: releaseInventory.activeRelease.files,
    legacyReferenceViolations: 0,
  },
  removalWaves: inventory.removalWaves,
  currentStageDeletionAuthorized: inventory.currentStageDeletionAuthorized,
  nextStage: inventory.nextStage,
};

writeFileSync(
  path.join(outputDirectory, "legacy-frontend-audit-result.json"),
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(JSON.stringify(result, null, 2));
