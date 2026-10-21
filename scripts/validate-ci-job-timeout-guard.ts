/**
 * CI-FRONTEND-CONTRACT-1.
 *
 * The "Frontend Production Contract" job (`production-contract` in
 * `.github/workflows/ci.yml`) ran an E2E script that could throw after
 * opening a Socket.IO client it never reached the code path to disconnect.
 * `run().catch()` in that script sets `process.exitCode` without forcing
 * exit, so the open socket kept Node's event loop alive and the job step
 * never returned — every affected run sat "in_progress" for hours until
 * GitHub's platform-default six-hour job ceiling finally killed it, which
 * reads as permanently pending to any human or branch-protection check.
 *
 * `timeout-minutes` bounds that: a hang becomes a real, fast failure instead
 * of an indefinite one. This guard is deliberately narrow — it checks only
 * the one job proven to hang, not every job in the workflow. Requiring a
 * timeout on every job is a separate, broader initiative; this exists so a
 * future edit cannot silently drop the bound on the job that actually hung.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const WORKFLOW_PATH = resolve(
  import.meta.dirname,
  "../.github/workflows/ci.yml",
);
const GUARDED_JOB_KEY = "production-contract";

/**
 * Extracts one top-level job's YAML block by its key.
 *
 * A tiny line-based scan rather than a full YAML parse: this file only needs
 * to prove one field is present under one known job, and a targeted scan is
 * enough to do that without adding a YAML-parsing dependency to the build.
 */
export function extractJobBlock(
  workflowSource: string,
  jobKey: string,
): string {
  const lines = workflowSource.split("\n");
  const jobHeader = new RegExp(`^  ${jobKey}:\\s*$`);
  const startIndex = lines.findIndex((line) => jobHeader.test(line));
  if (startIndex === -1) {
    throw new Error(`Job "${jobKey}" was not found in ${WORKFLOW_PATH}`);
  }

  const blockLines = [lines[startIndex]];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    // Any other line indented exactly two spaces (a sibling top-level job
    // key, or the end of the `jobs:` map) closes this job's block.
    if (/^  \S/.test(line)) break;
    blockLines.push(line);
  }
  return blockLines.join("\n");
}

export function jobHasTimeoutMinutes(jobBlock: string): boolean {
  return /^\s{4}timeout-minutes:\s*\d+\s*$/m.test(jobBlock);
}

function runFixtures(): void {
  const boundedJob = [
    "  production-contract:",
    "    name: Frontend Production Contract",
    "    runs-on: ubuntu-latest",
    "    timeout-minutes: 10",
    "    steps: []",
    "  other-job:",
    "    name: Something Else",
    "    steps: []",
    "",
  ].join("\n");
  assert.ok(
    jobHasTimeoutMinutes(extractJobBlock(boundedJob, GUARDED_JOB_KEY)),
    "a job block carrying timeout-minutes must be detected as bounded",
  );

  const unboundedJob = [
    "  production-contract:",
    "    name: Frontend Production Contract",
    "    runs-on: ubuntu-latest",
    "    steps: []",
    "  other-job:",
    "    name: Something Else",
    "    timeout-minutes: 5",
    "    steps: []",
    "",
  ].join("\n");
  assert.equal(
    jobHasTimeoutMinutes(extractJobBlock(unboundedJob, GUARDED_JOB_KEY)),
    false,
    "a sibling job's timeout-minutes must not leak into this job's block",
  );

  const lastJobUnbounded = [
    "  other-job:",
    "    name: Something Else",
    "    timeout-minutes: 5",
    "    steps: []",
    "  production-contract:",
    "    name: Frontend Production Contract",
    "    steps: []",
    "",
  ].join("\n");
  assert.equal(
    jobHasTimeoutMinutes(extractJobBlock(lastJobUnbounded, GUARDED_JOB_KEY)),
    false,
    "the guarded job must be checked correctly even as the last job in the file",
  );

  assert.throws(
    () => extractJobBlock(boundedJob, "no-such-job"),
    "extracting a job key absent from the workflow must fail loudly, not silently pass",
  );
}

function run(): void {
  runFixtures();

  const workflow = readFileSync(WORKFLOW_PATH, "utf8");
  const jobBlock = extractJobBlock(workflow, GUARDED_JOB_KEY);
  assert.ok(
    jobHasTimeoutMinutes(jobBlock),
    `Job "${GUARDED_JOB_KEY}" in ${WORKFLOW_PATH} must declare timeout-minutes ` +
      `— it has hung indefinitely before (CI-FRONTEND-CONTRACT-1) and GitHub's ` +
      `platform default is 6 hours with no bound in place.`,
  );
  console.log(
    `CI job timeout guard: "${GUARDED_JOB_KEY}" declares timeout-minutes.`,
  );
}

run();
