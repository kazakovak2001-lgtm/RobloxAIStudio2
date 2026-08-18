# RobloxAIStudio2

## Repositories

- **`RobloxAIStudio2`** — canonical backend/runtime repository. This repo.
- **`../Frontend`** — canonical frontend repository. Separate git repo, separate history.
- Any embedded/legacy frontend inside this repo is **obsolete**. Do not revive, extend, or treat it as canonical.
- The two repos stay separate. Never copy one into the other.

## Source of truth

Priority order. Lower items never override higher ones:

1. Current repository implementation (the code as it exists now)
2. `docs/00-project-control/` authoritative documents
3. Current tests and contracts
4. `CLAUDE.md` and `.claude/rules/`
5. External/automatic memory

**Memory tools are not authoritative.** `Remember`, Perseus Vault, skilder, auto-memory/`MEMORY.md`, prior sessions, and conversation summaries all go stale. They may name files, flags, PRs, or statuses that no longer exist. Verify against the code before acting on them, and never let them override current implementation or project-control docs.

## Status language

Use exactly these terms:

`IMPLEMENTED` · `PARTIALLY IMPLEMENTED` · `SCAFFOLDING` · `PLANNED` · `UNVERIFIED`

Never infer implementation from a filename, a roadmap row, a doc heading, or an export that exists. A type union with one reachable value is `SCAFFOLDING`, not `IMPLEMENTED`. If you have not read the code path, it is `UNVERIFIED`.

## Architecture invariants

- Modular platform; deterministic **Pipeline v2**
- Explicit stage ordering and explicit state transitions
- Checkpoints; retry/resume
- Durable persistence; restart-safe recovery
- Provider-agnostic AI
- Strong typing
- Explicit runtime ownership
- Studio integration boundaries
- Small coherent vertical slices

Details: `.claude/rules/pipeline-v2.md`, `.claude/rules/persistence.md`, `.claude/rules/studio.md`.

## Tenant and project ownership

Hard invariants. These are the highest-severity rules in the repo:

- **Never infer project ownership** from `pipelineId`, `executionId`, `artifactId`, `sessionId`, or any other indirect identifier.
- Project-bound reads and writes require **explicit project ownership validation**.
- **Fail closed** when ownership cannot be proven. Return empty/null, not "best guess".
- **No silent cross-project fallback.** Ever.
- Historical projectless state must **not** acquire tenant ownership by inference.
- Do not reintroduce tenant-implicit compatibility APIs (single-argument lookups keyed only on a pipeline/execution id).

Details: `.claude/rules/security.md`.

## Persistence

- Durable acknowledgement **before** reporting success
- Idempotent recovery
- Concurrency-safe startup recovery
- Explicit rollback/publish semantics
- **No process-local handles** (sockets, timers, class instances, callbacks) in durable serialized state
- Separate execution failure from persistence failure where applicable

Details: `.claude/rules/persistence.md`.

## Working method

Default investigation sequence:

```
search/grep → exact implementation → direct dependency → relevant tests → authoritative docs (only if needed)
```

- **Do not broad-read the repository by default.** Do not open large files to "get oriented".
- Load only domain-relevant rules and skills.
- Prefer isolated reviewer agents for large audits — they keep bulk output out of the main context.
- When a claim matters, verify it in code and cite `file:line`.

## Git safety

- **Never commit** without explicit authorization.
- **Never push** without explicit authorization.
- **Never merge** without explicit authorization.
- Final merge authorization is bound to the **exact reviewed HEAD SHA**. Any HEAD change invalidates prior authorization — re-confirm.
- Never `reset`, `stash`, `clean`, `restore`, `checkout` over, or otherwise discard unrelated work without explicit authorization.
- Before staging, inspect what is included. This working tree may hold intentional in-progress work from another session.
- Unresolved PR review threads are blockers until resolved or explicitly waived.
- Do not expand a narrow slice into unrelated cleanup or formatting.

## Frontend contract

For any API-surface work, inspect **both** canonical repos before changing either. Trace the full chain:

```
backend route → request schema/type → response schema/type
→ frontend API client → frontend TS type → consumer
→ auth / error / status semantics
```

Establish the actual contract first; do not edit both repos speculatively. Watch for endpoint, field, enum, nullability, auth, status-code, and error-shape drift.

Details: `.claude/rules/frontend-contract.md`. Workflow: `/robloxaistudio-frontend-contract`.

## Studio evidence

Distinguish these states and never collapse them:

`generated` → `transferred` → `imported` → `acknowledged` → `executed` → `observed`

An artifact that was delivered is not one that was imported; one that was imported is not one that ran. **Never claim Studio runtime acceptance without evidence.** Operator-observed is not machine-verified — say which one you have.

Details: `.claude/rules/studio.md`.

## Token discipline

- Do not load Roblox monetization, UX, animation, world-design, or game-ideas skills during backend infrastructure work.
- Do not load persistence/security context during pure frontend UI work.
- Do not activate every installed plugin for every task.
- Use existing agents (`architecture-auditor`, `security-reviewer`, `release-reviewer`, `studio-acceptance-engineer`, `frontend-contract-reviewer`, `persistence-engineer`, `test-engineer`) rather than re-deriving their work inline.

## Repo specifics

- Test runner: `npm run test` (vitest, `config/testing/vitest.backend.config.ts`). Targeted runs strongly preferred.
- Gates: `npm run typecheck`, `npm run validate` (includes DOC-202A documentation-authority validator).
- `docs/00-project-control/DECISION_LOG.md` is **append-only** — add dated entries, never edit past ones.
- After adding/removing/renaming tracked files, regenerate inventories via `node scripts/cleanup/generate-tracked-inventories.mjs` (CI exact-matches them against `git ls-files`).
- Commit style: conventional, all-lowercase subject, body lines ≤100 chars.
