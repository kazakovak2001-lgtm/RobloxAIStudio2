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
  process.env.PROMOTED_BASELINE_INVENTORY ??
    "config/cutover/promoted-baseline.inventory.json",
);
const outputDirectory = path.resolve(
  root,
  process.env.PROMOTED_BASELINE_OUTPUT ?? "artifacts/cutover-1f",
);
const promotedDefaultRef =
  process.env.PROMOTED_DEFAULT_REF ??
  "origin/release/cutover-1e-candidate";
const rollbackRef =
  process.env.ROLLBACK_REF ?? "origin/backup/default-before-cutover-1e";

mkdirSync(outputDirectory, { recursive: true });
process.on("uncaughtException", (error) => {
  const failure = {
    status: "failed",
    roadmapId: "CUTOVER-1F",
    generatedAt: new Date().toISOString(),
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
  writeFileSync(
    path.join(outputDirectory, "promotion-integrity-failure.json"),
    `${JSON.stringify(failure, null, 2)}\n`,
  );
  console.error(error);
  process.exit(1);
});

const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
assert.equal(inventory.schemaVersion, 1, "Unsupported inventory schema");
assert.equal(inventory.roadmapId, "CUTOVER-1F");
assert.equal(
  inventory.legacyCleanupAuthorized,
  false,
  "CUTOVER-1F must not authorize legacy cleanup",
);

const sourceInventoryPath = path.resolve(root, inventory.sourceReleaseInventory);
const sourceInventory = JSON.parse(readFileSync(sourceInventoryPath, "utf8"));
assert.equal(sourceInventory.roadmapId, "CUTOVER-1D");
assert.equal(
  sourceInventory.promotionPlan?.legacyCleanupAuthorized,
  false,
  "Historical release inventory unexpectedly authorizes legacy cleanup",
);

const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

const promotedDefaultTip = git("rev-parse", promotedDefaultRef);
const rollbackTip = git("rev-parse", rollbackRef);
execFileSync(
  "git",
  [
    "merge-base",
    "--is-ancestor",
    inventory.promotedDefault.baselineCommit,
    promotedDefaultRef,
  ],
  { cwd: root, stdio: "pipe" },
);
assert.equal(
  rollbackTip,
  inventory.rollbackReference.expectedTip,
  "Pinned rollback reference moved",
);

for (const releasePath of sourceInventory.activeRelease.files) {
  const absolutePath = path.join(root, releasePath);
  assert.ok(
    existsSync(absolutePath),
    `Missing active release file: ${releasePath}`,
  );
  assert.ok(statSync(absolutePath).isFile(), `Not a file: ${releasePath}`);
  const content = readFileSync(absolutePath, "utf8");
  for (const pattern of sourceInventory.activeRelease.forbiddenPatterns) {
    const regex = new RegExp(pattern.regex, "i");
    assert.ok(
      !regex.test(content),
      `${releasePath} violates ${pattern.id}: ${pattern.description}`,
    );
  }
}

const workflowPath = path.resolve(root, inventory.workflowPath);
const workflow = readFileSync(workflowPath, "utf8");
const pushBlock = workflow.match(/\n  push:\n([\s\S]*?)\n  pull_request:/);
assert.ok(pushBlock, "Unable to locate the CI push branch block");
const branchesMatch = pushBlock[1].match(/branches:\s*\[([^\]]+)\]/);
assert.ok(branchesMatch, "CI push branches must use an explicit inline list");
const pushBranches = branchesMatch[1]
  .split(",")
  .map((branch) => branch.trim().replace(/^['\"]|['\"]$/g, ""))
  .filter(Boolean);

assert.ok(
  pushBranches.includes(inventory.promotedDefault.requiredPushBranch),
  `CI push targeting omits ${inventory.promotedDefault.requiredPushBranch}`,
);
for (const branch of inventory.transitionalPushBranches) {
  assert.ok(
    pushBranches.includes(branch),
    `CI push targeting omits transitional branch ${branch}`,
  );
}
for (const branch of inventory.nonCanonicalPushBranches) {
  assert.ok(
    !pushBranches.includes(branch),
    `CI still treats obsolete default branch ${branch} as canonical`,
  );
}
assert.ok(
  workflow.includes(inventory.expectedVerifier),
  "CI does not invoke the promoted-baseline verifier",
);
assert.ok(
  !workflow.includes(`run: node ${inventory.historicalVerifier}`),
  "CI still invokes the historical pre-promotion verifier",
);
assert.ok(
  workflow.includes("name: Promoted Baseline Integrity"),
  "CI job display name is not aligned with the promoted baseline",
);

const result = {
  status: "passed",
  roadmapId: inventory.roadmapId,
  generatedAt: new Date().toISOString(),
  promotedDefault: {
    branch: inventory.promotedDefault.branch,
    ref: promotedDefaultRef,
    tip: promotedDefaultTip,
    verifiedAncestor: inventory.promotedDefault.baselineCommit,
  },
  rollbackReference: {
    branch: inventory.rollbackReference.branch,
    ref: rollbackRef,
    tip: rollbackTip,
  },
  workflow: {
    path: inventory.workflowPath,
    pushBranches,
    verifier: inventory.expectedVerifier,
  },
  activeRelease: {
    sourceInventory: inventory.sourceReleaseInventory,
    filesVerified: sourceInventory.activeRelease.files,
    forbiddenPatternCount:
      sourceInventory.activeRelease.forbiddenPatterns.length,
    legacyReferenceViolations: 0,
  },
  frontendRelease: sourceInventory.frontendRelease,
  rollbackMode: sourceInventory.rollbackInventory.mode,
  legacyCleanupAuthorized: inventory.legacyCleanupAuthorized,
};

writeFileSync(
  path.join(outputDirectory, "promotion-integrity-result.json"),
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(JSON.stringify(result, null, 2));
