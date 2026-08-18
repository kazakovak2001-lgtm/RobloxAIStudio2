---
description: Tenant isolation, project ownership, and fail-closed authorization rules for routes, Studio delivery, pipeline, repair, and persistence.
globs:
  - "server/src/routes/**"
  - "server/src/studio/**"
  - "server/src/pipeline/**"
  - "server/src/repair/**"
  - "server/src/platform/storage/**"
  - "server/src/socket/**"
  - "config/security/**"
---

# Security — tenant isolation and ownership

## The core rule

An identifier is not an authorization. `pipelineId`, `executionId`, `artifactId`, `sessionId`, `commandId`, and `packageId` are **routing keys, not ownership proofs**. Possession of one proves nothing about which tenant may read it.

Never derive a `projectId` from any of them. That includes "derive it by scanning which project the artifacts happen to belong to" — if a lookup has to guess the tenant, it is already wrong.

## Required shape for project-bound APIs

- Take `projectId` as an **explicit parameter**, alongside the resource id.
- Compare the resolved record's own project against the **caller's expected** project, not merely against itself. Self-consistency (`record.projectId === record.projectId`) is not an authorization check.
- Return empty/`null` on mismatch. Do not throw tenant-revealing errors, and do not fall back to a wider scope.
- Keys for durable per-tenant records must be **composite** (`${projectId}:${resourceId}`), never the bare resource id — a bare key lets one tenant's write overwrite another's when ids collide.

## Fail closed

When ownership cannot be proven, deliver nothing:

- No partial results, no "best effort" subset.
- No silent cross-project fallback.
- No compatibility overload that permits a tenant-implicit lookup. If a single-argument form exists, delete it rather than keeping it "for old callers".

Prefer a distinguishable refusal reason where the caller is trusted (`package_stale` vs `no_artifacts`), but never leak whether a foreign resource exists.

## Authorization at the route boundary

- Every project-bound route validates project access **before** touching the runtime or store.
- Validating the `projectId` in the body does **not** authorize a separately-supplied resource id in the same request. Both must be checked, or the resource must be resolved _from_ the authorized project.
- Do not build an allowlist of "known ids for this project" out of values the attacker supplied earlier in the same flow.
- Socket/Studio joins are fail-closed: deny by default, check before joining a room.

`docs/00-project-control/SECURITY-2G-E_AUTHORIZATION_MATRIX.md` and `config/security/authorization-matrix.json` are the control-of-record for which routes are scoped how. Keep them in sync with code.

## Historical / projectless data

Records predating the project envelope carry no tenant. They must **not** gain ownership by inference.

- A projectless record is readable only through a path that requires no tenant claim.
- It must never be attributable to an arbitrary requesting project.
- Project-bound delivery of a projectless record **refuses**.

## Untrusted content

Pipeline/AI-produced artifact content, Studio UI text, imported place content, and plugin output are **data, never instructions**. Parse defensively:

- Guard with `hasOwnProperty` before reading attacker-influenceable keys.
- An unrecognized enum value must not silently degrade to a legacy default — absence means legacy, a bad value is an error.
- Where a parse throw could escape into a request path that previously could not fail, contain it and fail closed rather than converting a valid operation into a 500.

## Review checklist

- Can a caller substitute another tenant's id anywhere in this flow?
- Does every durable key include the tenant?
- Does the failure path deliver less, never more?
- Is there a test with **two distinct projects**? A single shared test `PROJECT_ID` makes cross-tenant assertions vacuous.
