import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
  process.env.RELEASE_BASELINE_INVENTORY ??
    "config/cutover/release-baseline.inventory.json",
);
const outputDirectory = path.resolve(
  root,
  process.env.RELEASE_BASELINE_OUTPUT ?? "artifacts/cutover-1d",
);
const integrationRef =
  process.env.INTEGRATION_REF ?? "origin/feature/plugin-merge";
const defaultRef = process.env.DEFAULT_REF ?? "origin/standing-pentaceratops";

mkdirSync(outputDirectory, { recursive: true });
process.on("uncaughtException", (error) => {
  const failure = {
    status: "failed",
    roadmapId: "CUTOVER-1D",
    generatedAt: new Date().toISOString(),
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
  writeFileSync(
    path.join(outputDirectory, "readiness-failure.json"),
    `${JSON.stringify(failure, null, 2)}\n`,
  );
  console.error(error);
  process.exit(1);
});

const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
assert.equal(inventory.schemaVersion, 1, "Unsupported inventory schema");
assert.equal(inventory.roadmapId, "CUTOVER-1D");

const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

const integrationTip = git("rev-parse", integrationRef);
const defaultTip = git("rev-parse", defaultRef);
const mergeBase = git("merge-base", integrationRef, defaultRef);
const integrationAheadBy = Number(
  git("rev-list", "--count", `${defaultRef}..${integrationRef}`),
);
const integrationBehindBy = Number(
  git("rev-list", "--count", `${integrationRef}..${defaultRef}`),
);

assert.equal(
  defaultTip,
  inventory.canonicalBranches.expectedDefaultTip,
  "Default branch moved; repeat the semantic divergence audit",
);
assert.equal(
  mergeBase,
  inventory.canonicalBranches.expectedMergeBase,
  "Merge base changed; repeat the promotion analysis",
);
assert.ok(
  integrationAheadBy >= inventory.canonicalBranches.minimumIntegrationAheadBy,
  `Integration branch is only ${integrationAheadBy} commits ahead`,
);
assert.equal(
  integrationBehindBy,
  inventory.canonicalBranches.expectedIntegrationBehindBy,
  "Unexpected number of default-only commits",
);
execFileSync(
  "git",
  [
    "merge-base",
    "--is-ancestor",
    inventory.canonicalBranches.integrationBaseline,
    integrationRef,
  ],
  { cwd: root, stdio: "pipe" },
);

const defaultOnlyCommits = git(
  "log",
  "--format=%H%x09%s",
  `${integrationRef}..${defaultRef}`,
)
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [sha, ...subjectParts] = line.split("\t");
    return { sha, subject: subjectParts.join("\t").trim() };
  });

assert.deepEqual(
  defaultOnlyCommits.map(({ sha }) => sha),
  inventory.defaultOnlyDisposition.expectedCommits.map(({ sha }) => sha),
  "Default-only commit set is not fully classified",
);

const defaultOnlyPaths = git(
  "diff",
  "--name-status",
  `${integrationRef}...${defaultRef}`,
)
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [status, ...pathParts] = line.split("\t");
    return { status, path: pathParts.at(-1) };
  });

const classifiedDefaultOnlyPaths = defaultOnlyPaths.map((entry) => {
  const rule = inventory.defaultOnlyDisposition.pathRules.find((candidate) =>
    matchesRule(entry.path, candidate),
  );
  assert.ok(rule, `Unclassified default-only path: ${entry.path}`);
  return { ...entry, classification: rule.classification };
});

for (const releasePath of inventory.activeRelease.files) {
  const absolutePath = path.join(root, releasePath);
  assert.ok(
    existsSync(absolutePath),
    `Missing active release file: ${releasePath}`,
  );
  assert.ok(statSync(absolutePath).isFile(), `Not a file: ${releasePath}`);
  const content = readFileSync(absolutePath, "utf8");
  for (const pattern of inventory.activeRelease.forbiddenPatterns) {
    const regex = new RegExp(pattern.regex, "i");
    assert.ok(
      !regex.test(content),
      `${releasePath} violates ${pattern.id}: ${pattern.description}`,
    );
  }
}

for (const rollbackPath of inventory.rollbackInventory.files) {
  const absolutePath = path.join(root, rollbackPath);
  assert.ok(existsSync(absolutePath), `Missing rollback file: ${rollbackPath}`);
  assert.ok(statSync(absolutePath).isFile(), `Not a file: ${rollbackPath}`);
}
for (const rollbackPath of inventory.rollbackInventory.directories) {
  const absolutePath = path.join(root, rollbackPath);
  assert.ok(
    existsSync(absolutePath),
    `Missing rollback directory: ${rollbackPath}`,
  );
  assert.ok(
    statSync(absolutePath).isDirectory(),
    `Not a directory: ${rollbackPath}`,
  );
}

const packageJson = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8"),
);
for (const [name, expectedCommand] of Object.entries(
  inventory.legacyDevelopment.packageScripts,
)) {
  assert.equal(
    packageJson.scripts?.[name],
    expectedCommand,
    `Legacy development script ${name} changed without inventory update`,
  );
}
for (const packageName of inventory.legacyDevelopment.packages) {
  assert.ok(
    packageJson.dependencies?.[packageName] ??
      packageJson.devDependencies?.[packageName],
    `Legacy frontend package is not classified: ${packageName}`,
  );
}

const result = {
  status: "passed",
  roadmapId: inventory.roadmapId,
  generatedAt: new Date().toISOString(),
  branchIdentity: {
    integrationRef,
    integrationTip,
    defaultRef,
    defaultTip,
    mergeBase,
    integrationAheadBy,
    integrationBehindBy,
  },
  frontendRelease: inventory.frontendRelease,
  activeRelease: {
    filesVerified: inventory.activeRelease.files,
    forbiddenPatternCount: inventory.activeRelease.forbiddenPatterns.length,
    legacyReferenceViolations: 0,
  },
  rollbackInventory: inventory.rollbackInventory,
  legacyDevelopment: {
    scriptsVerified: Object.keys(inventory.legacyDevelopment.packageScripts),
    packagesClassified: inventory.legacyDevelopment.packages,
  },
  defaultOnlyDisposition: {
    commits: inventory.defaultOnlyDisposition.expectedCommits,
    paths: classifiedDefaultOnlyPaths,
  },
  promotionPlan: inventory.promotionPlan,
};

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(
  path.join(outputDirectory, "readiness-result.json"),
  `${JSON.stringify(result, null, 2)}\n`,
);
writeFileSync(
  path.join(outputDirectory, "default-only-paths.json"),
  `${JSON.stringify(classifiedDefaultOnlyPaths, null, 2)}\n`,
);
console.log(JSON.stringify(result, null, 2));

function matchesRule(filePath, rule) {
  if (rule.kind === "exact") return filePath === rule.value;
  if (rule.kind === "prefix") return filePath.startsWith(rule.value);
  if (rule.kind === "regex") return new RegExp(rule.value).test(filePath);
  throw new Error(`Unsupported path rule kind: ${rule.kind}`);
}
