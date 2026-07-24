# Roadmap Status

**Last Updated**: July 24, 2026

---

## Current Delivery Sequence: Two-Repository Cutover

This sequence is authoritative for work after the standalone frontend integration. It replaces the historical plan to further migrate the embedded frontend in this repository.

| ID            | Delivery item                                                  | Priority | Status       | Dependency            |
| ------------- | -------------------------------------------------------------- | -------- | ------------ | --------------------- |
| CUTOVER-0     | Standalone frontend governance and CI alignment                | Critical | 🟡 IN REVIEW | —                     |
| CI-BASELINE-1 | Portable green backend CI and repository hygiene               | Critical | ⏭️ NEXT      | CUTOVER-0             |
| CORE-1        | Real project data, persistence, and API contract stabilization | Critical | ⏳ Planned   | CI-BASELINE-1         |
| WORKSPACE-1   | Workflow-oriented standalone Workspace                         | High     | ⏳ Planned   | CORE-1                |
| STUDIO-1      | Generated artifact → Roblox Studio end-to-end validation       | High     | ⏳ Planned   | CORE-1, WORKSPACE-1   |
| CUTOVER-1     | Release promotion and legacy frontend removal                  | High     | ⏳ Planned   | WORKSPACE-1, STUDIO-1 |

See [FRONTEND_CUTOVER.md](./FRONTEND_CUTOVER.md) for ownership, branch, validation, and legacy-removal rules.

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

| ID     | Issue                 | Status                            |
| ------ | --------------------- | --------------------------------- |
| UX-4.1 | Responsive Layout Fix | ✅ RESOLVED (already implemented) |

## Milestones

- ✅ Phase 1 COMPLETE (F-1, F-2, F-3 — all "Must Have" items done)
- ✅ Phase 2A COMPLETE (F-4, F-5, F-6, F-7, F-8 — all "Should Have" items done)
- ✅ Phase 2B COMPLETE (F-11 → F-10 → F-9 — Infrastructure done)
- 🔒 Security Hardening (Pre-Deploy) — ✅ COMPLETE (All 12 tasks done, FINAL_V1_RELEASE_SIGN_OFF.md generated)
- UX-3D: 8/8 sprints ✅ (See MIGRATION_PROGRESS.md for full history)

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

- **Feature-Complete**: All 11 planned features (F-1 through F-11) are complete
- **Security Status**: 12/12 hardening tasks completed (including final checkpoint)
- **Release Decision**: ✅ APPROVED — v1.0 ready for production deployment
- **Sign-Off Document**: `FINAL_V1_RELEASE_SIGN_OFF.md`
- **Post-release**: F-12 (Collaborative Dev) deferred to post-launch
