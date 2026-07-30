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
const stageId = "CLEANUP-1D";
const inventoryPath = path.resolve(
  root,
  process.env.LEGACY_FRONTEND_AUDIT_INVENTORY ??
    "config/cleanup/legacy-frontend-decommission.inventory.json",
);
const outputDirectory = path.resolve(
  root,
  process.env.LEGACY_FRONTEND_AUDIT_OUTPUT ??
    "artifacts/post-removal-invariants",
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
    path.join(outputDirectory, "post-removal-invariant-audit-failure.json"),
    `${JSON.stringify(failure, null, 2)}\n`,
  );
  console.error(error);
  process.exit(1);
});

const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
assert.equal(
  inventory.schemaVersion,
  5,
  "Unsupported cleanup inventory schema",
);
assert.equal(inventory.roadmapId, stageId);
assert.equal(inventory.status, "post-removal-steady-state");
assert.equal(
  inventory.cleanupSequenceStatus,
  "complete",
  "The cleanup sequence must remain closed",
);

const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const gitBuffer = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "buffer" });

execFileSync(
  "git",
  ["merge-base", "--is-ancestor", inventory.baseline.steadyStateCommit, "HEAD"],
  { cwd: root, stdio: "pipe" },
);

const head = git("rev-parse", "HEAD");
const trackedFiles = git("ls-files")
  .split("\n")
  .map((file) => file.trim())
  .filter(Boolean)
  .sort();
const trackedFileSet = new Set(trackedFiles);
const implementationBaseline = inventory.baseline.minimumAncestorCommit;
const implementationHead = inventory.baseline.steadyStateCommit;
const rawNameStatus = git(
  "diff",
  "--name-status",
  "--no-renames",
  `${implementationBaseline}...${implementationHead}`,
);
const implementationChangeEntries = rawNameStatus
  ? rawNameStatus.split("\n").map((line) => {
      const [status, file, unexpectedPath] = line.split("\t");
      assert.ok(
        status && file && !unexpectedPath,
        `Invalid git diff row: ${line}`,
      );
      return { file, status };
    })
  : [];
const implementationChangeByFile = new Map(
  implementationChangeEntries.map((entry) => [entry.file, entry.status]),
);
assert.equal(
  implementationChangeByFile.size,
  implementationChangeEntries.length,
  "Historical CLEANUP-1D diff contains duplicate path entries",
);
assert.deepEqual(
  implementationChangeEntries.filter((entry) => entry.status.startsWith("D")),
  [],
  "Historical CLEANUP-1D implementation must not delete files",
);

const requiredModifiedFiles = [
  ...inventory.historicalImplementationChangePolicy.requiredModifiedFiles,
].sort();
const requiredAddedFiles = [
  ...inventory.historicalImplementationChangePolicy.requiredAddedFiles,
].sort();
assert.deepEqual(
  inventory.historicalImplementationChangePolicy.requiredDeletedFiles,
  [],
  "Historical CLEANUP-1D change policy must authorize zero deletions",
);
const expectedChanges = new Map([
  ...requiredModifiedFiles.map((file) => [file, "M"]),
  ...requiredAddedFiles.map((file) => [file, "A"]),
]);
assert.equal(
  expectedChanges.size,
  requiredModifiedFiles.length + requiredAddedFiles.length,
  "CLEANUP-1D change policy contains overlapping paths",
);
assert.deepEqual(
  [...implementationChangeByFile.keys()].sort(),
  [...expectedChanges.keys()].sort(),
  "Historical CLEANUP-1D paths differ from the exact authorized scope",
);
for (const [file, expectedStatus] of expectedChanges) {
  assert.equal(
    implementationChangeByFile.get(file),
    expectedStatus,
    `Historical CLEANUP-1D expected ${expectedStatus} status for ${file}`,
  );
}
for (const file of inventory.historicalImplementationChangePolicy
  .protectedUnchangedFiles) {
  execFileSync("git", ["cat-file", "-e", `${implementationHead}:${file}`], {
    cwd: root,
    stdio: "pipe",
  });
  assert.ok(
    !implementationChangeByFile.has(file),
    `Protected file changed during historical CLEANUP-1D: ${file}`,
  );
}

const sourcePrefix = `${inventory.legacyFrontend.sourceRoot}/`;
const historicalLegacyFiles = [
  ...inventory.legacyFrontend.expectedTrackedFiles,
].sort();
assert.equal(
  historicalLegacyFiles.length,
  168,
  "Historical legacy source inventory must remain exactly 168 files",
);
assert.ok(
  historicalLegacyFiles.every((file) => file.startsWith(sourcePrefix)),
  "Legacy source inventory contains a path outside the removed root",
);
const requiredRemovedFiles = [
  ...new Set([
    ...historicalLegacyFiles,
    ...inventory.legacyFrontend.configurationFiles,
    ...inventory.legacyFrontend.generatedResidue,
    ...inventory.legacyFrontend.archivalDeploymentFiles,
  ]),
].sort();
assert.equal(
  requiredRemovedFiles.length,
  176,
  "CLEANUP-1C removal evidence must remain exactly 176 paths",
);

const removalBaseline = inventory.baseline.cleanup1cRemovalBaselineCommit;
const removedFileEvidence = requiredRemovedFiles.map((file) => {
  assert.ok(!existsSync(path.join(root, file)), `Removed path exists: ${file}`);
  assert.ok(!trackedFileSet.has(file), `Removed path remains tracked: ${file}`);
  const baselineContent = gitBuffer("show", `${removalBaseline}:${file}`);
  return {
    path: file,
    baselineSizeBytes: baselineContent.byteLength,
    baselineSha256: createHash("sha256").update(baselineContent).digest("hex"),
  };
});
assert.ok(
  !existsSync(path.join(root, inventory.legacyFrontend.sourceRoot)),
  `Removed legacy root exists: ${inventory.legacyFrontend.sourceRoot}/`,
);

for (const entry of inventory.legacyFrontend.separateInfrastructureFiles) {
  const absolutePath = path.join(root, entry.path);
  assert.ok(
    existsSync(absolutePath) && statSync(absolutePath).isFile(),
    `Missing separate infrastructure file: ${entry.path}`,
  );
  assert.doesNotMatch(
    readFileSync(absolutePath, "utf8"),
    /\b(?:src\/|vite|index\.html|frontend)\b/i,
    `${entry.path} is not independent from the removed frontend`,
  );
}
for (const entry of inventory.legacyFrontend.knownMissingPaths) {
  assert.ok(
    !existsSync(path.join(root, entry.path)),
    `Known-missing path unexpectedly exists: ${entry.path}`,
  );
}

function buildTree(files) {
  const rootNode = new Map();
  for (const file of files) {
    let node = rootNode;
    for (const segment of file.split("/")) {
      if (!node.has(segment)) node.set(segment, new Map());
      node = node.get(segment);
    }
  }
  const lines = ["."];
  const render = (node, prefix) => {
    const entries = [...node.entries()].sort(([left], [right]) =>
      left.localeCompare(right, "en"),
    );
    entries.forEach(([name, children], index) => {
      const last = index === entries.length - 1;
      lines.push(`${prefix}${last ? "└── " : "├── "}${name}`);
      if (children.size > 0) {
        render(children, `${prefix}${last ? "    " : "│   "}`);
      }
    });
  };
  render(rootNode, "");
  return `${lines.join("\n")}\n`;
}

function readVerifiedUtf8(relativePath) {
  const content = readFileSync(path.join(root, relativePath));
  assert.ok(
    !(content[0] === 0xff && content[1] === 0xfe) &&
      !(content[0] === 0xfe && content[1] === 0xff),
    `${relativePath} must not be UTF-16`,
  );
  assert.ok(!content.includes(0), `${relativePath} contains NUL bytes`);
  const decoded = content.toString("utf8");
  assert.ok(
    !decoded.includes("\uFFFD"),
    `${relativePath} is not deterministic UTF-8`,
  );
  return decoded;
}

assert.deepEqual(inventory.legacyFrontend.trackedInventoryFiles, [
  "_inventory_raw.txt",
  "ProjectStructure.txt",
  "project_structure.txt",
]);
assert.equal(
  readVerifiedUtf8("_inventory_raw.txt"),
  `${trackedFiles.join("\n")}\n`,
  "_inventory_raw.txt differs from the exact sorted git ls-files set",
);
assert.equal(
  readVerifiedUtf8("ProjectStructure.txt"),
  buildTree(trackedFiles),
  "ProjectStructure.txt differs from the deterministic tracked-path tree",
);
const compatibilityPointer = [
  "Compatibility pointer — no repository snapshot is stored here.",
  "Canonical tracked-file inventory: _inventory_raw.txt",
  "Canonical tracked-path tree: ProjectStructure.txt",
  "Regenerate both files with:",
  "node scripts/cleanup/generate-tracked-inventories.mjs",
  "",
].join("\n");
assert.equal(
  readVerifiedUtf8("project_structure.txt"),
  compatibilityPointer,
  "project_structure.txt must remain a small compatibility pointer",
);

const packageJson = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8"),
);
const baselinePackageJson = JSON.parse(
  git("show", `${implementationBaseline}:package.json`),
);
const implementationPackageJson = JSON.parse(
  git("show", `${implementationHead}:package.json`),
);
assert.deepEqual(
  implementationPackageJson,
  baselinePackageJson,
  "Historical CLEANUP-1D must not modify package declarations or scripts",
);
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
  "Removed direct package inventory must remain exactly 12 packages",
);
for (const packageName of allRemovedDirectPackages) {
  assert.ok(
    !Object.hasOwn(packageJson.dependencies ?? {}, packageName) &&
      !Object.hasOwn(packageJson.devDependencies ?? {}, packageName),
    `Removed package is directly declared: ${packageName}`,
  );
}
const packageLock = JSON.parse(
  readFileSync(path.join(root, "package-lock.json"), "utf8"),
);
const lockRoot = packageLock.packages?.[""];
assert.ok(lockRoot, "package-lock.json is missing its root package record");
assert.deepEqual(lockRoot.dependencies ?? {}, packageJson.dependencies ?? {});
assert.deepEqual(
  lockRoot.devDependencies ?? {},
  packageJson.devDependencies ?? {},
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
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      moduleSpecifiers.add(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    ) {
      moduleSpecifiers.add(node.arguments[0].text);
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
    return moduleSpecifiersInFile(
      file,
      readFileSync(absolutePath, "utf8"),
    ).some(
      (specifier) =>
        specifier === packageName || specifier.startsWith(`${packageName}/`),
    );
  });
}
const packageConsumerEvidence = {};
for (const entry of inventory.packageDisposition.retainOperational) {
  const consumers = packageConsumers(entry.name).sort();
  assert.deepEqual(
    consumers,
    [...entry.expectedConsumersOutsideLegacyRoot].sort(),
    `Operational package ${entry.name} consumers changed`,
  );
  packageConsumerEvidence[entry.name] = consumers;
}
for (const packageName of allRemovedDirectPackages) {
  const consumers = packageConsumers(packageName);
  assert.deepEqual(
    consumers,
    [],
    `Removed direct package ${packageName} has repository consumers`,
  );
  packageConsumerEvidence[packageName] = consumers;
}

const helperContracts = [
  {
    file: "server/src/core/architecture/ArchitecturePolicy.ts",
    required: ["studioPluginRoot", "removedFrontendRoot"],
    forbidden: ['frontendRoot: "src"', 'sharedRoot: "shared"'],
  },
  {
    file: "server/src/core/ai/GenerationSandbox.ts",
    required: ['"studio-plugin": "studio-plugin"'],
    forbidden: ['"ui" |', 'ui: "src/"', 'shared: "shared/"'],
  },
  {
    file: "server/src/knowledge/CodebaseKnowledge.ts",
    required: ['"studio-plugin", "src"', '[".ts", ".tsx", ".lua"]'],
    forbidden: ['const frontendDir = join(this.rootDir, "src")'],
  },
  {
    file: "server/src/agents/implementations/CodeReviewControllerAgent.ts",
    required: ["retired @/ frontend alias"],
    forbidden: ["use @/ alias", "Use @/ path aliases"],
  },
  {
    file: "scripts/git-boundary-guard.js",
    required: ['"src/"', "removed root frontend"],
    forbidden: ['zone: "src/"'],
  },
];
for (const contract of helperContracts) {
  const content = readFileSync(path.join(root, contract.file), "utf8");
  for (const marker of contract.required) {
    assert.ok(
      content.includes(marker),
      `${contract.file} is missing post-removal marker: ${marker}`,
    );
  }
  for (const marker of contract.forbidden) {
    assert.ok(
      !content.includes(marker),
      `${contract.file} retains retired marker: ${marker}`,
    );
  }
}

const architectureValidator = readFileSync(
  path.join(root, "scripts/validate-architecture.ts"),
  "utf8",
);
for (const marker of inventory.toolingContract
  .architectureValidatorRequiredMarkers) {
  assert.ok(
    architectureValidator.includes(marker),
    `Architecture validator marker is missing: ${marker}`,
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
    `Retired CI marker remains: ${marker}`,
  );
}
const gateJobMatch = ciWorkflow.match(
  /\n  gate:\n([\s\S]*?)(?=\n  [A-Za-z0-9_-]+:\n|$)/,
);
assert.ok(gateJobMatch, "Unable to locate the Merge Gate job");
assert.match(
  gateJobMatch[1],
  /(?:^|[\s,\[])legacy-frontend-audit(?:[\s,\]]|$)/,
  "Merge Gate does not depend on legacy-frontend-audit",
);

const activeRoots = inventory.referencePolicy.activeAndToolingRoots;
const intentionalExactReferenceFiles = new Set(
  inventory.referencePolicy.intentionalExactReferenceFiles,
);
const classificationRules = inventory.referencePolicy.classificationRules;
const classificationForFile = (file) =>
  Object.entries(classificationRules).find(([, prefixes]) =>
    prefixes.some((prefix) => file === prefix || file.startsWith(prefix)),
  )?.[0];
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const activeToolingFiles = trackedFiles.filter((file) =>
  activeRoots.some(
    (rootPath) => file === rootPath || file.startsWith(`${rootPath}/`),
  ),
);
const intentionalExactReferences = [];
const exactRemovedPathViolations = [];
for (const file of activeToolingFiles) {
  const absolutePath = path.join(root, file);
  if (!existsSync(absolutePath) || statSync(absolutePath).isDirectory()) {
    continue;
  }
  const content = readFileSync(absolutePath, "utf8");
  for (const removedPath of requiredRemovedFiles) {
    const exactPathToken = new RegExp(
      `(^|[^A-Za-z0-9_./-])${escapeRegex(removedPath)}($|[^A-Za-z0-9_./-])`,
      "m",
    );
    if (!exactPathToken.test(content)) continue;

    const classification = classificationForFile(file);
    if (
      intentionalExactReferenceFiles.has(file) ||
      classification === "negativeGuard" ||
      classification === "historical"
    ) {
      intentionalExactReferences.push({
        file,
        removedPath,
        classification: classification ?? "explicit-inventory",
      });
    } else {
      exactRemovedPathViolations.push({ file, removedPath, classification });
    }
  }
}
assert.deepEqual(
  exactRemovedPathViolations,
  [],
  "Active/tooling files contain exact references to removed paths",
);

const classifiedRootReferences = [];
const unclassifiedRootReferences = [];
for (const file of trackedFiles) {
  const absolutePath = path.join(root, file);
  if (!existsSync(absolutePath) || statSync(absolutePath).isDirectory()) {
    continue;
  }
  const content = readFileSync(absolutePath, "utf8");
  const matchingLines = content
    .split("\n")
    .map((line, index) => ({ line: index + 1, text: line.trim() }))
    .filter(({ text }) => /(^|["'`\s(])src\//.test(text));
  if (matchingLines.length === 0) continue;

  const classification = classificationForFile(file);
  const evidence = { file, classification, references: matchingLines };
  if (classification) {
    classifiedRootReferences.push(evidence);
  } else {
    unclassifiedRootReferences.push(evidence);
  }
}
assert.deepEqual(
  unclassifiedRootReferences,
  [],
  "Root-relative src/ references must be explicitly classified",
);

const releaseInventory = JSON.parse(
  readFileSync(path.join(root, inventory.sourceReleaseInventory), "utf8"),
);
assert.deepEqual(inventory.canonicalFrontend, releaseInventory.frontendRelease);
for (const releasePath of releaseInventory.activeRelease.files) {
  const absolutePath = path.join(root, releasePath);
  assert.ok(existsSync(absolutePath), `Missing release file: ${releasePath}`);
  const content = readFileSync(absolutePath, "utf8");
  for (const pattern of releaseInventory.activeRelease.forbiddenPatterns) {
    assert.ok(
      !new RegExp(pattern.regex, "i").test(content),
      `${releasePath} violates ${pattern.id}: ${pattern.description}`,
    );
  }
}

assert.deepEqual(
  inventory.removalWaves.map((wave) => wave.id),
  ["CLEANUP-1B", "CLEANUP-1C", "CLEANUP-1D"],
);
assert.equal(inventory.removalWaves[0].status, "complete");
assert.equal(inventory.removalWaves[1].status, "complete");
assert.equal(inventory.removalWaves[2].status, "complete");
assert.equal(inventory.removalWaves[2].deletionAuthorized, false);

const result = {
  status: "passed",
  roadmapId: inventory.roadmapId,
  generatedAt: new Date().toISOString(),
  auditedHead: head,
  baseline: inventory.baseline,
  verificationEvidence: inventory.verificationEvidence,
  canonicalFrontend: inventory.canonicalFrontend,
  historicalImplementationChangePolicy: {
    baseline: implementationBaseline,
    implementationHead,
    changedFileCount: implementationChangeEntries.length,
    changes: implementationChangeEntries,
    deletionCount: 0,
  },
  legacyFrontend: {
    sourceRoot: inventory.legacyFrontend.sourceRoot,
    sourceRootStatus: "removed",
    removedFileCount: removedFileEvidence.length,
    removedSourceFileCount: historicalLegacyFiles.length,
  },
  inventories: {
    trackedFileCount: trackedFiles.length,
    files: inventory.legacyFrontend.trackedInventoryFiles,
    deterministicUtf8: true,
  },
  boundaries: {
    localSourceZones: ["server/src", "studio-plugin/src"],
    removedRootReintroductionGuard: "active",
    exactRemovedPathViolations,
  },
  references: {
    intentionalExactReferences,
    classified: classifiedRootReferences,
    unclassifiedCount: 0,
  },
  dependencies: {
    removedDirectPackageCount: allRemovedDirectPackages.length,
    packageLockRootSynchronized: true,
    packageConsumerEvidence,
  },
  activeReleaseIsolation: {
    filesVerified: releaseInventory.activeRelease.files,
    legacyReferenceViolations: 0,
  },
  removalWaves: inventory.removalWaves,
  cleanupSequenceStatus: inventory.cleanupSequenceStatus,
  nextStage: inventory.nextStage,
};

writeFileSync(
  path.join(outputDirectory, "post-removal-invariant-audit-result.json"),
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(JSON.stringify(result, null, 2));
