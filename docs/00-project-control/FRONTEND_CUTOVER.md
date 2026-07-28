# Frontend Cutover Policy

**Status**: Active  
**Roadmap ID**: CUTOVER-0  
**Effective date**: July 24, 2026

## Decision

The standalone [Frontend repository](https://github.com/kazakovak2001-lgtm/Frontend) is the only target web client for Roblox AI Studio.

The former React/Vite application in this repository's root `src/` directory was a frozen migration inventory and is physically removed in CLEANUP-1C. It must not be recreated; Git history and the cleanup inventory preserve the migration evidence.

This policy supersedes historical documentation that planned to evolve the embedded frontend in place.

## Ownership Boundaries

| Area                                                    | Canonical location                | Rule                                                            |
| ------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------- |
| Web UI, routes, Workspace, client state                 | `kazakovak2001-lgtm/Frontend`     | All new user-facing UI work belongs here.                       |
| API, domain logic, AI execution, Socket.IO, persistence | `RobloxAIStudio2/server/`         | Frontend accesses it only through REST and Socket.IO contracts. |
| Roblox Studio integration                               | `RobloxAIStudio2/studio-plugin/`  | Maintain one plugin implementation and one protocol.            |
| Removed legacy web client                               | Historical `RobloxAIStudio2/src/` | Do not recreate; use the standalone Frontend repository.        |

## Mandatory Rules

1. Search both repositories before creating a component, endpoint, service, hook, or contract.
2. Reuse and extend the existing `Frontend` API adapter, realtime client, contexts, routes, and UI primitives before adding equivalents.
3. Do not import source code across repositories. The boundary is versioned REST/Socket.IO contracts.
4. Every user-facing backend capability must have one discoverable path in the standalone frontend; do not recreate an embedded frontend.
5. Production workflows must use persisted project data and generated artifacts. Fixtures and placeholders belong only in tests.
6. Any public API change requires a contract-impact review and a matching standalone frontend change in the same delivery sequence.
7. Every task must run the project controller pre-check or an equivalent duplicate/architecture audit before implementation.

## Current Branch Strategy

- `release/cutover-1e-candidate` is the protected repository default and canonical backend/Studio baseline.
- `backup/default-before-cutover-1e` preserves the exact pre-promotion default reference.
- `feature/plugin-merge` remains historical integration evidence; PR #1 must not be merged directly.
- Cleanup work uses small branches and focused pull requests based on the protected default.

## Delivery Order

1. **CUTOVER-0** — governance, repository ownership, and CI alignment.
2. **CI-BASELINE-1** — restore a portable, green backend CI baseline by removing tracked generated dependencies, synchronizing lockfiles, and correcting validation false positives. This is a prerequisite discovered during CUTOVER-0.
3. **CORE-1** — persist project/blueprint/chat state, remove production fixtures, and stabilize API contracts.
4. **WORKSPACE-1** — evolve the standalone Workspace around the creator flow: Define → Generate → Validate → Studio/Export.
5. **STUDIO-1** — validate generated artifacts through the Roblox Studio plugin and remove verified legacy plugin files.
6. **CUTOVER-1** — promote the integration baseline, switch deployment to `Frontend`, then remove the legacy web client in an isolated cleanup release.
7. Post-launch improvements and F-12 collaboration only after the preceding gates pass.

## Legacy Frontend Removal Gate

The removal gate passed before CLEANUP-1C began:

- The standalone frontend covers the agreed core user flow: create project → generate → observe progress → inspect artifacts → validate/playtest → repair → synchronize/export.
- The backend serves the same typed API contracts used by the standalone frontend with real persisted data.
- Cross-repository build, typecheck, API, realtime, and manual Studio validation pass.
- No runtime script, CI workflow, deployment configuration, documentation link, or import depends on the embedded frontend.
- CLEANUP-1B tooling decoupling is protected, verified, and merged.
- The removal occurs in a dedicated pull request with a rollback plan.

CLEANUP-1C implements the dedicated removal under issue #37 from exact baseline `85a2fa8d512738e6d02ffae42da77af7a27db6fc`. Its protected audit requires all 176 authorized deletions, exact dependency pruning, unchanged active release boundaries, and a hard failure if root `src/` reappears. CLEANUP-1D post-removal verification remains blocked until CLEANUP-1C is verified and merged.

## Definition of Done for a Cutover Sprint

- Both repository boundaries remain intact.
- The removed legacy frontend root is not reintroduced.
- CI covers the active backend integration branch and the standalone frontend default branch.
- Project-control documents and the decision log reflect the verified state.
- The next sprint has a single objective, dependencies, validation plan, and rollback plan.

## CI-BASELINE-1 Verification

**Status**: Merged and verified.

The backend cleanup removes 9,386 tracked generated `node_modules/` files while retaining the existing ignore rule. It also synchronizes `package-lock.json` with `package.json`, standardizes local, CI, and Docker runtime on Node.js 22, and keeps security validation strict for real credentials while allowing low-confidence example strings only in non-production documentation and test fixtures.

Verified on a clean Node.js 22 / npm 10 install:

- `npm ci`
- `npm run ci` — 61 test files, 706 tests, architecture, boundary, lint, formatting, and repository validation all passed before merge; the first CORE-1a validation now passes 62 test files / 709 tests

This remediation remains an isolated CI baseline review. It does not change product behavior, API contracts, or legacy frontend removal gates.
