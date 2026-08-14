---
name: data-202b-audit
description: Runs a read-only, implementation-first, cross-checked audit of DATA-202B autonomous-session persistence and restart correctness.
argument-hint: "[optional target or commit range]"
disable-model-invocation: true
---

# DATA-202B audit

Audit `$ARGUMENTS` when supplied; otherwise audit DATA-202B as merged by PR #139 at merge commit `396d6330`, compared with the current checked-out HEAD.

This workflow is read-only. Do not edit, commit, merge, push, change branches, or modify external state. Inspect implementation, tests, validators, current project-control authority, and relevant git history before accepting documentation claims. Use `git diff 396d6330^1 396d6330` to identify the original slice, then verify its present-day descendants.

Coordinate independent reviews with these project agents:

1. `architecture-auditor`: trace the runtime and storage call graph, domain boundaries, deterministic phase transitions, claims, recovery ordering, persisted record shapes, and current authority.
2. `persistence-engineer`: in read-only mode, inspect storage composition, PostgreSQL transactions, bootstrap ordering, rejection handling, fresh-instance recovery, concurrent mutation fencing, and serialized state. Do not implement changes.
3. `test-engineer`: in read-only mode, map every invariant to a test or validator and identify assertions that cannot fail for the intended reason. Do not add or modify tests.
4. `security-reviewer`: review project isolation, stale or replayed execution, duplicate claims, fail-open recovery, untrusted persisted data, error exposure, and runtime capabilities crossing persistence boundaries.
5. `release-reviewer`: verify exact commits, inventories, paired Frontend pins, restart evidence, current gates, and clean candidate state.

Run independent reviews in parallel when possible. Require every material statement to be classified as `FACT`, `INFERENCE`, `GAP`, `RISK`, or `RECOMMENDATION` with precise evidence. Distinguish a failed check from a check not run. Cross-check conflicting claims and preserve unresolved disagreements as gaps.

Return:

1. Scope and exact commits inspected.
2. A compact invariant-to-evidence matrix.
3. Ranked findings with the required classifications.
4. Validation commands and exact outcomes.
5. A verdict: `CONFORMANT`, `NON-CONFORMANT`, or `INSUFFICIENT EVIDENCE`.
6. The smallest recommended next vertical slice. Do not implement it.
