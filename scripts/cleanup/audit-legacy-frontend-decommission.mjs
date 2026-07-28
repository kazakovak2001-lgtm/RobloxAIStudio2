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
const stageId = "CLEANUP-1C";
const inventoryPath = path.resolve(
  root,
  process.env.LEGACY_FRONTEND_AUDIT_INVENTORY ??
    "config/cleanup/legacy-frontend-decommission.inventory.json",
);
const outputDirectory = path.resolve(
  root,
  process.env.LEGACY_FRONTEND_AUDIT_OUTPUT ?? "artifacts/cleanup-1c",
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
  3,
  "Unsupported cleanup inventory schema",
);
assert.equal(inventory.roadmapId, stageId);
assert.equal(inventory.status, "physical-removal-implemented");
assert.equal(
  inventory.currentStageDeletionAuthorized,
  true,
  "CLEANUP-1C must be the explicitly deletion-authorized wave",
);
assert.equal(inventory.nextStage, "CLEANUP-1D");

const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const gitBuffer = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "buffer" });

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
const trackedFileSet = new Set(trackedFiles);
const baseline = inventory.baseline.minimumAncestorCommit;
const rawNameStatus = git(
  "diff",
  "--name-status",
  "--no-renames",
  `${baseline}...HEAD`,
);
const changeEntries = rawNameStatus
  ? rawNameStatus.split("\n").map((line) => {
      const [status, file, unexpectedPath] = line.split("\t");
      assert.ok(
        status && file && !unexpectedPath,
        `Invalid git diff row: ${line}`,
      );
      return { file, status };
    })
  : [];
const changeByFile = new Map(
  changeEntries.map((entry) => [entry.file, entry.status]),
);
assert.equal(
  changeByFile.size,
  changeEntries.length,
  "CLEANUP-1C diff contains duplicate path entries",
);

const sourcePrefix = `${inventory.legacyFrontend.sourceRoot}/`;
const historicalLegacyFiles = [
  ...inventory.legacyFrontend.expectedTrackedFiles,
].sort();
assert.equal(
  historicalLegacyFiles.length,
  168,
  "The CLEANUP-1A source inventory must remain exactly 168 files",
);
assert.ok(
  historicalLegacyFiles.every((file) => file.startsWith(sourcePrefix)),
  "Legacy source inventory contains a path outside the removed root",
);

const requiredDeletedFiles = [
  ...new Set([
    ...historicalLegacyFiles,
    ...inventory.legacyFrontend.configurationFiles,
    ...inventory.legacyFrontend.generatedResidue,
    ...inventory.legacyFrontend.archivalDeploymentFiles,
  ]),
].sort();
assert.equal(
  requiredDeletedFiles.length,
  176,
  "CLEANUP-1C must delete the exact 176-path authorized inventory",
);

const requiredModifiedFiles = [
  ...inventory.stageChangePolicy.requiredModifiedFiles,
].sort();
const requiredAddedFiles = [
  ...inventory.stageChangePolicy.requiredAddedFiles,
].sort();
const expectedChanges = new Map([
  ...requiredDeletedFiles.map((file) => [file, "D"]),
  ...requiredModifiedFiles.map((file) => [file, "M"]),
  ...requiredAddedFiles.map((file) => [file, "A"]),
]);
assert.equal(
  expectedChanges.size,
  requiredDeletedFiles.length +
    requiredModifiedFiles.length +
    requiredAddedFiles.length,
  "CLEANUP-1C change policy contains overlapping paths",
);
assert.deepEqual(
  [...changeByFile.keys()].sort(),
  [...expectedChanges.keys()].sort(),
  "CLEANUP-1C changed paths differ from the exact authorized removal scope",
);
for (const [file, expectedStatus] of expectedChanges) {
  assert.equal(
    changeByFile.get(file),
    expectedStatus,
    `CLEANUP-1C expected ${expectedStatus} status for ${file}`,
  );
}

for (const file of inventory.stageChangePolicy.protectedUnchangedFiles) {
  assert.ok(
    existsSync(path.join(root, file)),
    `Protected file is missing: ${file}`,
  );
  assert.ok(
    !changeByFile.has(file),
    `Protected file changed during CLEANUP-1C: ${file}`,
  );
}

const removedFileEvidence = requiredDeletedFiles.map((file) => {
  const absolutePath = path.join(root, file);
  assert.ok(!existsSync(absolutePath), `Removed path still exists: ${file}`);
  assert.ok(!trackedFileSet.has(file), `Removed path remains tracked: ${file}`);

  const baselineContent = gitBuffer("show", `${baseline}:${file}`);
  const classification = historicalLegacyFiles.includes(file)
    ? "legacy-source"
    : inventory.legacyFrontend.configurationFiles.includes(file)
      ? "legacy-configuration"
      : inventory.legacyFrontend.archivalDeploymentFiles.includes(file)
        ? "archival-deployment"
        : "generated-residue";

  return {
    path: file,
    classification,
    baselineSizeBytes: baselineContent.byteLength,
    baselineSha256: createHash("sha256").update(baselineContent).digest("hex"),
  };
});

assert.ok(
  !existsSync(path.join(root, inventory.legacyFrontend.sourceRoot)),
  `Removed legacy root exists: ${inventory.legacyFrontend.sourceRoot}/`,
);
for (const entrypoint of inventory.legacyFrontend.entrypoints) {
  assert.ok(
    requiredDeletedFiles.includes(entrypoint),
    `Legacy entrypoint was not in the removal inventory: ${entrypoint}`,
  );
}

for (const entry of inventory.legacyFrontend.separateInfrastructureFiles) {
  const absolutePath = path.join(root, entry.path);
  assert.ok(
    existsSync(absolutePath) && statSync(absolutePath).isFile(),
    `Missing separate infrastructure file: ${entry.path}`,
  );
  const content = readFileSync(absolutePath, "utf8");
  assert.doesNotMatch(
    content,
    /\b(?:src\/|vite|index\.html|frontend)\b/i,
    `${entry.path} is not independent from the removed frontend`,
  );
}
for (const file of inventory.legacyFrontend.staleInventoryFiles) {
  assert.ok(
    existsSync(path.join(root, file)),
    `Stale inventory reserved for CLEANUP-1D is missing: ${file}`,
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
const baselinePackageJson = JSON.parse(git("show", `${baseline}:package.json`));
const removedRuntimePackages = [
  ...inventory.packageDisposition.removedRuntimeDirectPackages,
].sort();
const removedDevelopmentPackages = [
  ...inventory.packageDisposition.removedDevelopmentDirectPackages,
].sort();
const allRemovedDirectPackages = [
  ...removedRuntimePackages,
  ...removedDevelopmentPackages,
].sort();
assert.equal(
  allRemovedDirectPackages.length,
  12,
  "CLEANUP-1C must prune exactly 12 direct package declarations",
);
assert.equal(
  new Set(allRemovedDirectPackages).size,
  allRemovedDirectPackages.length,
  "Removed direct package inventory contains duplicates",
);

const expectedDependencies = { ...baselinePackageJson.dependencies };
for (const packageName of removedRuntimePackages) {
  assert.ok(
    Object.hasOwn(expectedDependencies, packageName),
    `Runtime removal was not declared at the baseline: ${packageName}`,
  );
  delete expectedDependencies[packageName];
}
const expectedDevDependencies = { ...baselinePackageJson.devDependencies };
for (const packageName of removedDevelopmentPackages) {
  assert.ok(
    Object.hasOwn(expectedDevDependencies, packageName),
    `Development removal was not declared at the baseline: ${packageName}`,
  );
  delete expectedDevDependencies[packageName];
}
assert.deepEqual(
  packageJson.dependencies,
  expectedDependencies,
  "Runtime dependencies differ from the baseline minus authorized removals",
);
assert.deepEqual(
  packageJson.devDependencies,
  expectedDevDependencies,
  "Development dependencies differ from the baseline minus authorized removals",
);
for (const packageName of allRemovedDirectPackages) {
  assert.ok(
    !Object.hasOwn(packageJson.dependencies ?? {}, packageName) &&
      !Object.hasOwn(packageJson.devDependencies ?? {}, packageName),
    `Removed package remains directly declared: ${packageName}`,
  );
}

for (const [name, expectedCommand] of Object.entries(
  inventory.toolingContract.packageScripts,
)) {
  assert.equal(
    packageJson.scripts?.[name],
    expectedCommand,
    `Backend tooling script ${name} differs from the CLEANUP-1C contract`,
  );
}
assert.deepEqual(
  packageJson.scripts,
  baselinePackageJson.scripts,
  "CLEANUP-1C must not change package commands",
);

const packageLock = JSON.parse(
  readFileSync(path.join(root, "package-lock.json"), "utf8"),
);
const lockRoot = packageLock.packages?.[""];
assert.ok(lockRoot, "package-lock.json is missing its root package record");
assert.deepEqual(
  lockRoot.dependencies ?? {},
  packageJson.dependencies ?? {},
  "package-lock root runtime declarations differ from package.json",
);
assert.deepEqual(
  lockRoot.devDependencies ?? {},
  packageJson.devDependencies ?? {},
  "package-lock root development declarations differ from package.json",
);

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
    `Backend Vitest config references removed frontend tooling: ${marker}`,
  );
}

const productionAudit = readFileSync(
  path.join(root, inventory.toolingContract.productionAudit.path),
  "utf8",
);
for (const marker of inventory.toolingContract.productionAudit
  .requiredMarkers) {
  assert.ok(
    productionAudit.includes(marker),
    `Production audit marker is missing: ${marker}`,
  );
}
for (const marker of inventory.toolingContract.productionAudit
  .forbiddenMarkers) {
  assert.ok(
    !productionAudit.includes(marker),
    `Production audit references a removed frontend path: ${marker}`,
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
    `Architecture removal marker is missing: ${marker}`,
  );
}
for (const marker of inventory.toolingContract
  .architectureValidatorForbiddenMarkers) {
  assert.ok(
    !architectureValidator.includes(marker),
    `Retired architecture marker remains active: ${marker}`,
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
    `CI contains a retired cleanup marker: ${marker}`,
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

function packageConsumers(packageName) {
  return trackedFiles.filter((file) => {
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

const packageConsumerEvidence = {};
for (const entry of inventory.packageDisposition.retainOperational) {
  assert.equal(
    packageJson.dependencies?.[entry.name] ??
      packageJson.devDependencies?.[entry.name],
    baselinePackageJson.dependencies?.[entry.name] ??
      baselinePackageJson.devDependencies?.[entry.name],
    `Operational package declaration changed: ${entry.name}`,
  );
  const consumers = packageConsumers(entry.name).sort();
  const expected = [...entry.expectedConsumersOutsideLegacyRoot].sort();
  assert.deepEqual(
    consumers,
    expected,
    `Operational package ${entry.name} consumers changed`,
  );
  packageConsumerEvidence[entry.name] = {
    classification: "retain-operational",
    consumers,
    reason: entry.reason,
  };
}
for (const packageName of allRemovedDirectPackages) {
  const consumers = packageConsumers(packageName);
  assert.deepEqual(
    consumers,
    [],
    `Removed direct package ${packageName} still has a repository consumer`,
  );
  packageConsumerEvidence[packageName] = {
    classification: "removed-direct-dependency",
    consumers,
  };
}

assert.deepEqual(
  inventory.removalWaves.map((wave) => wave.id),
  ["CLEANUP-1B", "CLEANUP-1C", "CLEANUP-1D"],
  "Cleanup waves must remain ordered",
);
assert.equal(inventory.removalWaves[0].status, "complete");
assert.equal(inventory.removalWaves[1].status, "implemented");
assert.equal(inventory.removalWaves[1].deletionAuthorized, true);
assert.equal(inventory.removalWaves[2].status, "next-after-cleanup-1c-merge");

const result = {
  status: "passed",
  roadmapId: inventory.roadmapId,
  generatedAt: new Date().toISOString(),
  auditedHead: head,
  baseline: inventory.baseline,
  canonicalFrontend: inventory.canonicalFrontend,
  stageChangePolicy: {
    changedFileCount: changeEntries.length,
    changes: changeEntries,
    requiredModifiedFiles,
    requiredAddedFiles,
    protectedUnchangedFiles:
      inventory.stageChangePolicy.protectedUnchangedFiles,
  },
  legacyFrontend: {
    sourceRoot: inventory.legacyFrontend.sourceRoot,
    sourceRootStatus: "removed",
    removedFileCount: removedFileEvidence.length,
    removedSourceFileCount: historicalLegacyFiles.length,
    removedFiles: removedFileEvidence,
    entrypoints: inventory.legacyFrontend.entrypoints,
    separateInfrastructureFiles:
      inventory.legacyFrontend.separateInfrastructureFiles,
    staleInventoryFiles: inventory.legacyFrontend.staleInventoryFiles,
  },
  tooling: {
    packageScripts: inventory.toolingContract.packageScripts,
    backendVitestConfig: inventory.toolingContract.vitestBackendConfig,
    architectureModel: "BACKEND + STANDALONE FRONTEND",
    removedRootReintroductionGuard: "active",
    mergeGateDependencyVerified: "legacy-frontend-audit",
  },
  dependencies: {
    removedDirectPackageCount: allRemovedDirectPackages.length,
    removedRuntimePackages,
    removedDevelopmentPackages,
    packageLockRootSynchronized: true,
    transitivePackagesPermitted: true,
    packageConsumerEvidence,
  },
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
