---
name: robloxaistudio-frontend-contract
description: Orchestration workflow for cross-repo API contract work between RobloxAIStudio2 (backend) and the separate canonical ../Frontend repository — trace route through to UI consumer, establish the actual contract before changing it, validate both sides narrowly. Use when asked to add/change an API endpoint's contract or to audit backend/frontend drift. For a read-only drift audit specifically, prefer delegating to the frontend-contract-reviewer agent.
disable-model-invocation: true
argument-hint: "[the endpoint(s) or feature whose contract is in scope]"
---

# RobloxAIStudio2 ↔ Frontend contract

Orchestrates cross-repo contract work. It does not duplicate `frontend-contract-reviewer` (the read-only auditor) or `frontend-ui-engineering`/`api-endpoint-builder` (general implementation skills) — it sequences them for this project's two-repo shape.

## 0. Confirm the workspace

- Backend: this repo.
- Frontend: `../Frontend` — a separate git repository with its own `main`. Confirm it's reachable (`.claude/settings.json` should list it under `additionalDirectories`); if not, say so and stop.
- The embedded/legacy frontend inside this repo is **obsolete**. Never read it as the contract, never edit it, never propose reviving it.

## 1. Establish the actual contract — do not assume it

Before any edit, trace the full chain and cite `file:line` on both sides:

```
backend route → request schema/type → response schema/type
→ frontend API client → frontend TS type → UI consumer
→ auth / status / error handling
```

For a read-only version of just this step, delegate to the `frontend-contract-reviewer` agent instead of doing it inline — it returns FACT/INFERENCE/RECOMMENDATION/UNVERIFIED findings without spending this session's context on both repos' source.

## 2. Identify drift or the gap to fill

Check explicitly: endpoint path/method, field name/casing, enum value sets, nullability, auth requirements, status codes, error envelope shape. Empty-state and error shapes drift more than success shapes — check them, not just the happy path.

## 3. Decide direction and compatibility

- Prefer additive backend changes; a removed/renamed field breaks an independently-deployed client.
- State explicitly whether old-client-vs-new-server (and the reverse) stays safe during rollout.
- Do not copy Frontend into Backend or vice versa.

## 4. Implement as coordinated, separate changes

- Backend schema/route change: implemented and validated in this repo.
- Frontend client/type/consumer change: implemented and validated in `../Frontend`.
- These land as **separate commits in separate repos**, each independently reviewable — never one combined diff spanning both.
- Do not touch both repos speculatively before step 1 has produced the actual gap.

## 5. Targeted validation, per repo

- Backend: the specific route's tests, `npm run typecheck` if types changed.
- Frontend: its own targeted tests/typecheck (inspect `../Frontend/package.json` for the actual commands — do not assume they match the backend's).
- Do not run either repo's full suite unless the caller asks for release-readiness.

## 6. Report

- The established contract (with `file:line` both sides) before your change.
- Exact drift found, classified by type (endpoint/field/enum/nullability/auth/status/error).
- Exact files changed in each repo and why.
- Compatibility statement for the rollout window.
- Anything left as `RECOMMENDATION` rather than applied.

## Git

Two repos, two independent authorizations. No commit, push, or merge in either without explicit authorization for that repo's exact change. See `CLAUDE.md` → Git safety.
