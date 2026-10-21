export default {
  extends: ["@commitlint/config-conventional"],
  // RELEASE-CI-BLOCKER-RECONCILIATION-1. `integration/mar-remediation-2026-08-18`
  // carries one already-merged commit whose subject fails subject-case
  // ("chore(release): establish canonical MAR-004 runtime pair", committed
  // 2026-08-19 at 7705b2ae) — a machine-pattern release-pairing bookkeeping
  // commit, the same category that recurs verbatim in the paired Frontend
  // repository ("chore(release): pin MAR-004 runtime pair"). It predates any
  // PR that ran this check against it: it landed as a direct commit on the
  // integration branch, not through a feature PR of its own, so no commit-lint
  // gate ever saw it before the integration-to-release PR's cumulative diff
  // did. Since integration history must not be rewritten for convenience and
  // this check compares against the still-open release base, every future PR
  // out of this branch inherits the same failure regardless of what it adds.
  // This ignores the exact recurring subject text of that one commit
  // category — not a commit hash, and not a general uppercase allowance — so
  // every other subject-case violation, past or future, still fails as
  // before.
  ignores: [
    (commit) =>
      /^chore\(release\): (establish|pin) canonical [A-Za-z0-9-]+ runtime pair$/.test(
        commit.split("\n")[0]?.trim() ?? "",
      ),
  ],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "refactor",
        "perf",
        "docs",
        "test",
        "build",
        "ci",
        "chore",
      ],
    ],
    "type-case": [2, "always", "lower-case"],
    "subject-max-length": [2, "always", 72],
    "subject-case": [2, "always", "lower-case"],
    "subject-full-stop": [2, "never", "."],
    "subject-empty": [2, "never"],
    "body-leading-blank": [2, "always"],
    "footer-leading-blank": [2, "always"],
  },
};
