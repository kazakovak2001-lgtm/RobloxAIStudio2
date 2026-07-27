# Roadmap Status

**Last Updated**: July 27, 2026

---

## Current Delivery Sequence: Two-Repository Cutover

This sequence is authoritative for work after the standalone frontend integration. It replaces the historical plan to further migrate the embedded frontend in this repository.

| ID            | Delivery item                                                  | Priority | Status                                  | Dependency            |
| ------------- | -------------------------------------------------------------- | -------- | --------------------------------------- | --------------------- |
| CUTOVER-0     | Standalone frontend governance and CI alignment                | Critical | ✅ Complete                             | —                     |
| CI-BASELINE-1 | Portable green backend CI and repository hygiene               | Critical | ✅ Complete                             | CUTOVER-0             |
| CORE-1        | Real project data, persistence, and API contract stabilization | Critical | ✅ Complete                             | CI-BASELINE-1         |
| WORKSPACE-1   | Workflow-oriented standalone Workspace                         | High     | ✅ Complete                             | CORE-1                |
| STUDIO-1      | Generated artifact → Roblox Studio end-to-end validation       | High     | ✅ Complete — real desktop verified     | CORE-1, WORKSPACE-1   |
| CUTOVER-1     | Release promotion and legacy frontend removal                  | High     | 🟡 Active — preparation and gate review | WORKSPACE-1, STUDIO-1 |

See [FRONTEND_CUTOVER.md](./FRONTEND_CUTOVER.md) for ownership, branch, validation, and legacy-removal rules.
See [CORE-1A_DURABLE_PROJECTS.md](./CORE-1A_DURABLE_PROJECTS.md) for the completed identity/project boundary.
See [CORE-1B_DURABLE_RUNTIME.md](./CORE-1B_DURABLE_RUNTIME.md) for the verified blueprint, execution, chat, and PostgreSQL restart boundary.
See [STUDIO-1A_ARTIFACT_LINEAGE.md](./STUDIO-1A_ARTIFACT_LINEAGE.md) for durable canonical generation artifacts.
See [STUDIO-1B_RUNTIME_CONSOLIDATION.md](./STUDIO-1B_RUNTIME_CONSOLIDATION.md) for the shared Studio runtime, real artifact queue, and incremental no-op contract.
See [STUDIO-1C_IMPORT_ACKNOWLEDGEMENT.md](./STUDIO-1C_IMPORT_ACKNOWLEDGEMENT.md) for the verified backend ACK/result contract.
See [STUDIO-1D_REAL_PLUGIN_ACCEPTANCE.md](./STUDIO-1D_REAL_PLUGIN_ACCEPTANCE.md) for the CI-verified canonical plugin implementation.
See [STUDIO-1E_DESKTOP_ACCEPTANCE_RUNBOOK.md](./STUDIO-1E_DESKTOP_ACCEPTANCE_RUNBOOK.md) for the deterministic installable package, checksum contract, and manual evidence procedure.
See [STUDIO-1F_DESKTOP_FINDINGS_AND_RERUN.md](./STUDIO-1F_DESKTOP_FINDINGS_AND_RERUN.md) for the production-only defects found during the first desktop runs.
See [STUDIO-1G_DESKTOP_ACCEPTANCE_RESULT.md](./STUDIO-1G_DESKTOP_ACCEPTANCE_RESULT.md) for the completed real desktop evidence and canonical acceptance identity.
See the standalone frontend documentation for the completed WORKSPACE-1 slices and production responsive QA:

- [`WORKSPACE-1_WORKFLOW_SHELL.md`](https://github.com/kazakovak2001-lgtm/Frontend/blob/main/docs/WORKSPACE-1_WORKFLOW_SHELL.md)
- [`WORKSPACE-1_STAGE_TOOLS.md`](https://github.com/kazakovak2001-lgtm/Frontend/blob/main/docs/WORKSPACE-1_STAGE_TOOLS.md)
- [`WORKSPACE-1_STAGE_COMPOSITION.md`](https://github.com/kazakovak2001-lgtm/Frontend/blob/main/docs/WORKSPACE-1_STAGE_COMPOSITION.md)
- [`WORKSPACE-1_NATIVE_TESTS.md`](https://github.com/kazakovak2001-lgtm/Frontend/blob/main/docs/WORKSPACE-1_NATIVE_TESTS.md)
- [`WORKSPACE-1_RESPONSIVE_QA.md`](https://github.com/kazakovak2001-lgtm/Frontend/blob/main/docs/WORKSPACE-1_RESPONSIVE_QA.md)

## Completed STUDIO-1 Acceptance Gate

STUDIO-1 passed on July 27, 2026 through a real Roblox Studio desktop session. The verified identity is:

- backend commit `d99246d813e12bccff0193a15e73de41b92f175d`;
- frontend commit `a8d005d433d48e18d8e64ac176ee63c9c694b644`;
- project `proj-286c6929-5`;
- client `studio-39fa03bb`;
- session `session-afec81df-c`;
- execution `exec-1785180356168`;
- command `cmd-96bd9df4-e`;
- expected and verified artifact count `8`;
- Roblox Studio `0.730.0.7300790` (64-bit), production channel;
- plugin artifact ID `8657228073`, bundle SHA-256 `a97e6268193f202cb5cc12ef5c174d0a028067c382327dd9432aacbe80f5ced7`.

The authenticated project status returned `artifactVerified=true`, `verificationStatus=verified`, the matching execution ID, eight verified artifacts, and zero pending changes. Explorer evidence confirmed real Script, LocalScript, ModuleScript, and non-Lua metadata instances. Issue #15 is closed as completed.

CUTOVER-1 is now unblocked, but the next step is preparation and review—not immediate deletion or a direct merge of the oversized integration PR. The cutover must still prove branch alignment, deployment ownership, rollback readiness, no remaining runtime dependency on the embedded frontend, clean cross-repository validation, and a separately reviewed cleanup change.

## Historical Roadmap: UX-4 Feature Development

| ID   | Feature                  | Priority     | Status      | Sprint |
| ---- | ------------------------ | ------------ | ----------- | ------ |
| F-1  | Analytics Real Data      | Must Have    | ✅ COMPLETE | 9      |
| F-2  | AI Studio Chat Backend   | Must Have    | ✅ COMPLETE | 10     |
| F-3  | Plugin Manager Real Data | Must Have    | ✅ COMPLETE | 11     |
| F-4  | Game Simulation          | Should Have  | ✅ COMPLETE | 12-13  |
| F-5  | Economy Designer         | Should Have  | ✅ COMPLETE | 14     |
| F-6  | Autonomous Pipeline      | Should Have  | ✅ COMPLETE | 15-16  |
| F-7  | Knowledge Base UI        | Should Have  | ✅ COMPLETE | 17     |
| F-8  | Playtesting Dashboard    | Should Have  | ✅ COMPLETE | 18-19  |
| F-9  | Multi-Project Workspace  | Future       | ✅ COMPLETE | —      |
| F-10 | Real Authentication      | Future       | ✅ COMPLETE | —      |
| F-11 | Persistent Storage       | Future       | ✅ COMPLETE | —      |
| F-12 | Collaborative Dev        | Experimental | —           | —      |

## Active Bugfixes

| ID        | Issue                                               | Status                |
| --------- | --------------------------------------------------- | --------------------- |
| UX-4.1    | Responsive Layout Fix                               | ✅ RESOLVED           |
| STUDIO-1f | Roblox custom `Content-Type` rejection              | ✅ RESOLVED in PR #16 |
| STUDIO-1f | Lua generator → plugin artifact shape gap           | ✅ RESOLVED in PR #17 |
| STUDIO-1f | First-run specialist assignment overridden          | ✅ RESOLVED in PR #19 |
| STUDIO-1g | Real Roblox Studio end-to-end artifact verification | ✅ VERIFIED           |

## Milestones

- ✅ Phase 1 COMPLETE (F-1, F-2, F-3 — all "Must Have" items done)
- ✅ Phase 2A COMPLETE (F-4, F-5, F-6, F-7, F-8 — all "Should Have" items done)
- ✅ Phase 2B COMPLETE (F-11 → F-10 → F-9 — Infrastructure done)
- 🔒 Security Hardening (Pre-Deploy) — ✅ COMPLETE (All 12 tasks done, FINAL_V1_RELEASE_SIGN_OFF.md generated)
- UX-3D: 8/8 sprints ✅ (See MIGRATION_PROGRESS.md for full history)
- ✅ STUDIO-1 COMPLETE — real desktop import and backend verification passed
- 🟡 CUTOVER-1 ACTIVE — release promotion and cleanup gate preparation

## Release Hardening Sprint Status

| #    | Task                                               | Priority | Status  |
| ---- | -------------------------------------------------- | -------- | ------- |
| T-1  | Bug condition exploration tests                    | CRITICAL | ✅ Done |
| T-2  | Preservation property tests                        | CRITICAL | ✅ Done |
| T-3  | Fix auth route blocking (PUBLIC_PREFIXES)          | CRITICAL | ✅ Done |
| T-4  | Replace SHA-256 with bcrypt for passwords          | CRITICAL | ✅ Done |
| T-5  | Move tokens to httpOnly cookies                    | CRITICAL | ✅ Done |
| T-6  | Wire AuthService.validateToken() into middleware   | CRITICAL | ✅ Done |
| T-7  | Socket.IO token validation (JWT handshake)         | HIGH     | ✅ Done |
| T-8  | Remove dead code and merge studioService           | MEDIUM   | ✅ Done |
| T-9  | Update stale documentation                         | MEDIUM   | ✅ Done |
| T-10 | Add production infrastructure (Docker, migrations) | HIGH     | ✅ Done |
| T-11 | Final verification and release report              | HIGH     | ✅ Done |
| T-12 | Checkpoint — ensure all tests pass                 | HIGH     | ✅ Done |

## Post-Launch Improvements

| #     | Task                                      | Priority    | Effort     |
| ----- | ----------------------------------------- | ----------- | ---------- |
| APR-1 | Autonomous Pipeline Real-Time Events      | ✅ COMPLETE | —          |
| P-1   | Add zod schemas to auth endpoints         | MEDIUM      | 1.5h       |
| P-2   | External monitoring (uptime, error rates) | MEDIUM      | 2h         |
| P-3   | Log aggregation (structured → external)   | LOW         | 2h         |
| P-4   | SSL for remote Postgres connections       | MEDIUM      | 30min      |
| P-5   | F-12 Collaborative Dev (experimental)     | LOW         | 3+ sprints |
| P-6   | Login rate limit (10/min)                 | ✅ COMPLETE | —          |
| P-7   | Validate API keys against stored database | ✅ COMPLETE | —          |

## Release Readiness

- **Feature-Complete**: All 11 historical UX-4 features (F-1 through F-11) are complete
- **Security Status**: 12/12 hardening tasks completed (including final checkpoint)
- **Historical v1.0 Decision**: ✅ APPROVED for the embedded product baseline
- **Studio Gate**: ✅ STUDIO-1 complete with real desktop evidence
- **Current Cutover Decision**: ▶️ CUTOVER-1 unblocked; release-promotion preparation is active
- **Sign-Off Document**: `FINAL_V1_RELEASE_SIGN_OFF.md`
- **Post-release**: F-12 (Collaborative Dev) deferred to post-launch
