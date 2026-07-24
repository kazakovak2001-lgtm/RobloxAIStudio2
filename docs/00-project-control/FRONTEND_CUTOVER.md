# Frontend Cutover Policy

**Status**: Active  
**Roadmap ID**: CUTOVER-0  
**Effective date**: July 24, 2026

## Decision

The standalone [Frontend repository](https://github.com/kazakovak2001-lgtm/Frontend) is the only target web client for Roblox AI Studio.

The React/Vite application in this repository's root `src/` directory is a legacy migration inventory. It is frozen: it must not receive new product features, new pages, or parallel API integrations.

This policy supersedes historical documentation that planned to evolve the embedded frontend in place.

## Ownership Boundaries

| Area                                                    | Canonical location               | Rule                                                            |
| ------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------- |
| Web UI, routes, Workspace, client state                 | `kazakovak2001-lgtm/Frontend`    | All new user-facing UI work belongs here.                       |
| API, domain logic, AI execution, Socket.IO, persistence | `RobloxAIStudio2/server/`        | Frontend accesses it only through REST and Socket.IO contracts. |
| Roblox Studio integration                               | `RobloxAIStudio2/studio-plugin/` | Maintain one plugin implementation and one protocol.            |
| Legacy web client                                       | `RobloxAIStudio2/src/`           | Read-only migration reference until the removal gate is passed. |

## Mandatory Rules

1. Search both repositories before creating a component, endpoint, service, hook, or contract.
2. Reuse and extend the existing `Frontend` API adapter, realtime client, contexts, routes, and UI primitives before adding equivalents.
3. Do not import source code across repositories. The boundary is versioned REST/Socket.IO contracts.
4. Every user-facing backend capability must have one discoverable path in the standalone frontend; do not recreate it in the legacy frontend.
5. Production workflows must use persisted project data and generated artifacts. Fixtures and placeholders belong only in tests.
6. Any public API change requires a contract-impact review and a matching standalone frontend change in the same delivery sequence.
7. Every task must run the project controller pre-check or an equivalent duplicate/architecture audit before implementation.

## Current Branch Strategy

- `feature/plugin-merge` is the active integration baseline for the connected backend and Studio plugin.
- The repository default branch is currently `standing-pentaceratops`.
- Do not merge the large integration PR into the default branch without a dedicated release plan, conflict review, and full validation.
- Cutover work uses small branches and focused pull requests based on `feature/plugin-merge` until the release baseline is formally promoted.

## Delivery Order

1. **CUTOVER-0** — governance, repository ownership, and CI alignment.
2. **CI-BASELINE-1** — restore a portable, green backend CI baseline by removing tracked generated dependencies and correcting validation scope. This is a prerequisite discovered during CUTOVER-0.
3. **CORE-1** — persist project/blueprint/chat state, remove production fixtures, and stabilize API contracts.
4. **WORKSPACE-1** — evolve the standalone Workspace around the creator flow: Define → Generate → Validate → Studio/Export.
5. **STUDIO-1** — validate generated artifacts through the Roblox Studio plugin and remove verified legacy plugin files.
6. **CUTOVER-1** — promote the integration baseline, switch deployment to `Frontend`, then remove the legacy web client in an isolated cleanup release.
7. Post-launch improvements and F-12 collaboration only after the preceding gates pass.

## Legacy Frontend Removal Gate

The embedded `src/` frontend may be removed only when all conditions are true:

- The standalone frontend covers the agreed core user flow: create project → generate → observe progress → inspect artifacts → validate/playtest → repair → synchronize/export.
- The backend serves the same typed API contracts used by the standalone frontend with real persisted data.
- Cross-repository build, typecheck, API, realtime, and manual Studio validation pass.
- No runtime script, CI workflow, deployment configuration, documentation link, or import depends on the embedded frontend.
- The removal occurs in a dedicated pull request with a rollback plan.

## Definition of Done for a Cutover Sprint

- Both repository boundaries remain intact.
- No new legacy frontend code is introduced.
- CI covers the active backend integration branch and the standalone frontend default branch.
- Project-control documents and the decision log reflect the verified state.
- The next sprint has a single objective, dependencies, validation plan, and rollback plan.

## Known CUTOVER-0 Blocker

The backend repository currently tracks generated `node_modules/` files despite ignoring that directory for new files. A clean Linux install rewrites Windows-specific binaries and causes `scripts/validate.ts` to scan dependencies as project source. The result is a non-portable checkout and a failing full backend CI.

**Required follow-up**: `CI-BASELINE-1` must remove tracked generated dependencies in a dedicated, reviewed cleanup and make repository validation exclude dependency directories. This is deliberately not combined with CUTOVER-0 because it is a large destructive change with its own rollback and validation requirements.
