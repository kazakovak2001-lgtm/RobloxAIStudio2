---
description: Deterministic stage ordering, lifecycle transitions, checkpoints, retry/resume/pause/cancel, terminal evidence, and artifact persistence semantics for Pipeline v2.
globs:
  - "server/src/pipeline/**"
  - "server/src/planning/**"
  - "server/src/projects/services/**"
  - "server/src/validation/**"
  - "server/src/agents/**"
---

# Pipeline v2 — determinism and lifecycle

## Determinism

- Stage order is **explicit and declared**, never "whatever order the executor returned nodes in". Sort by the declared stage sequence before acting on a node list.
- A dependency edge may only name an artifact that is **already durably stored**. Resolve lineage during the commit loop, not while staging.
- Deterministic producers stay deterministic: same input, same output, same content hash. Do not fold timestamps, randomness, or iteration order into hashed content.
- Re-running a stage on unchanged input must not produce a different artifact identity.

## State transitions

- Transitions are explicit and enumerated. No implicit "it must be running because it isn't done".
- A terminal state is terminal. Do not resurrect a failed/cancelled execution in place — start a new one with a lineage edge to the old.
- Record _why_ a transition happened alongside the transition. A status with no recorded reason is unusable in an audit.
- Persist the transition before emitting the event that announces it.

## Checkpoints, retry, resume, pause, cancel

- A checkpoint is durable and self-sufficient: resume reads it and needs nothing from the previous process.
- Retry is bounded and the bound is enforced server-side. Client-supplied limits narrow, never widen.
- Resume is idempotent — resuming twice from one checkpoint must not duplicate work or artifacts.
- Pause/cancel take effect at declared boundaries, not mid-write. A cancel must never leave a half-written package.

## Artifacts

- Validation runs **before** anything is persisted. A rejected generation persists no deliverable content — the report saying why may still be written, and must not itself be deliverable.
- Content hash follows content, always. An edited artifact is a different artifact; keeping the old hash makes a stale dependency read as current.
- Provenance follows content too — human-edited bytes are not attributable to the agent that originally produced them.
- Artifacts stay **inspectable** after they stop being **deliverable**. Withholding delivery is not deletion.
- Storing an artifact and publishing a package are separate acts. Never treat "it is in the store" as "it may be shipped".

## Terminal evidence

- Evidence writes are idempotent — the same terminal outcome reported twice yields one record, not two.
- Evidence describes what actually happened, including partial and refused outcomes. Do not normalize a withheld or degraded result into a clean success.
- An evidence record must be distinguishable from the absence of one.

## Schema versions

- Bump the contract version on any shape change, and update every reader in the same slice.
- Tests must assert the **literal** expected version at least once. Asserting only against the exported constant makes the bump unverifiable — the constant could be anything and the test still passes.

## Review checklist

- Could two runs of this produce different artifact ids or hashes from identical input?
- Does anything persist before validation passes?
- Is every state change durable before it is announced?
- Does a mid-stage crash leave a package a later consumer could mistake for complete?
