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

const root = process.cwd();
const inventoryPath = path.resolve(
  root,
  process.env.LEGACY_FRONTEND_AUDIT_INVENTORY ??
    "config/cleanup/legacy-frontend-decommission.inventory.json",
);
const outputDirectory = path.resolve(
  root,
  process.env.LEGACY_FRONTEND_AUDIT_OUTPUT ?? "artifacts/cleanup-1a",
);

mkdirSync(outputDirectory, { recursive: true });
process.on("uncaughtException", (error) => {
  const failure = {
    status: "failed",
    roadmapId: "CLEANUP-1A",
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
  1,
  "Unsupported cleanup inventory schema",
);
assert.equal(inventory.roadmapId, "CLEANUP-1A");
assert.equal(inventory.status, "audit-only");
assert.equal(
  inventory.currentStageDeletionAuthorized,
  false,
  "CLEANUP-1A must not authorize deletion",
);

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
  "Tracked root src inventory changed; repeat CLEANUP-1A classification",
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
for (const [name, expectedCommand] of Object.entries(
  inventory.currentBlockers.packageScripts,
)) {
  assert.equal(
    packageJson.scripts?.[name],
    expectedCommand,
    `Current blocker script ${name} changed without cleanup inventory update`,
  );
}

const rootTsconfig = JSON.parse(
  readFileSync(path.join(root, "tsconfig.json"), "utf8"),
);
assert.deepEqual(
  rootTsconfig.include,
  inventory.currentBlockers.rootTsconfig.include,
  "Root TypeScript include changed without cleanup inventory update",
);
for (const [alias, targets] of Object.entries(
  inventory.currentBlockers.rootTsconfig.pathAlias,
)) {
  assert.deepEqual(
    rootTsconfig.compilerOptions?.paths?.[alias],
    targets,
    `Root TypeScript alias ${alias} changed without cleanup inventory update`,
  );
}

const architectureValidator = readFileSync(
  path.join(root, "scripts/validate-architecture.ts"),
  "utf8",
);
for (const marker of inventory.currentBlockers.architectureValidatorMarkers) {
  assert.ok(
    architectureValidator.includes(marker),
    `Architecture blocker marker disappeared: ${marker}`,
  );
}

const combinedDockerfile = readFileSync(path.join(root, "Dockerfile"), "utf8");
for (const marker of inventory.currentBlockers.combinedDockerfileMarkers) {
  assert.ok(
    combinedDockerfile.includes(marker),
    `Combined Dockerfile blocker marker disappeared: ${marker}`,
  );
}

const ciWorkflow = readFileSync(
  path.join(root, ".github/workflows/ci.yml"),
  "utf8",
);
for (const marker of inventory.currentBlockers.ciMarkers) {
  assert.ok(
    ciWorkflow.includes(marker),
    `CI blocker marker disappeared: ${marker}`,
  );
}
assert.ok(
  ciWorkflow.includes("name: Legacy Frontend Decommission Audit"),
  "CLEANUP-1A audit job is not registered in CI",
);
assert.ok(
  ciWorkflow.includes("audit-legacy-frontend-decommission.mjs"),
  "CLEANUP-1A audit invocation is missing from CI",
);

const releaseInventoryPath = path.join(root, inventory.sourceReleaseInventory);
const releaseInventory = JSON.parse(readFileSync(releaseInventoryPath, "utf8"));
assert.equal(releaseInventory.roadmapId, "CUTOVER-1D");
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
const consumerExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);

function packageConsumersOutsideLegacyRoot(packageName) {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const importPattern = new RegExp(
    `(?:from\\s+|import\\s*\\(|require\\s*\\(|^\\s*import\\s+)["']${escaped}(?:/[^"']*)?["']`,
    "m",
  );

  return trackedFiles.filter((file) => {
    if (file.startsWith(sourcePrefix)) return false;
    if (!consumerExtensions.has(path.extname(file))) return false;
    const absolutePath = path.join(root, file);
    if (!existsSync(absolutePath)) return false;
    return importPattern.test(readFileSync(absolutePath, "utf8"));
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
  blockers: {
    packageScripts: Object.keys(inventory.currentBlockers.packageScripts),
    rootTypeScriptScope: inventory.currentBlockers.rootTsconfig,
    architectureValidatorMarkers:
      inventory.currentBlockers.architectureValidatorMarkers,
    combinedDockerfileMarkers:
      inventory.currentBlockers.combinedDockerfileMarkers,
    ciMarkers: inventory.currentBlockers.ciMarkers,
  },
  packageConsumerEvidence,
  activeReleaseIsolation: {
    sourceInventory: inventory.sourceReleaseInventory,
    filesVerified: releaseInventory.activeRelease.files,
    legacyReferenceViolations: 0,
  },
  removalWaves: inventory.removalWaves,
  currentStageDeletionAuthorized: inventory.currentStageDeletionAuthorized,
};

writeFileSync(
  path.join(outputDirectory, "legacy-frontend-audit-result.json"),
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(JSON.stringify(result, null, 2));
