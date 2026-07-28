# AI Development Governance

**Version:** 1.1.0
**Effective:** v1.9+  
**Status:** CANONICAL — all AI assistants must follow this document.

---

## 1. Project Mission

This repository is a **production-grade Roblox AI Studio DevKit** — a multi-agent AI orchestration platform that autonomously generates complete Roblox game projects.

The engineering objectives are:

- **Reliability** — deterministic execution with no silent failures
- **Scalability** — horizontal scaling via distributed worker pool
- **Maintainability** — strict module boundaries, typed contracts, version-by-version development
- **Deterministic Generation** — PlanExecutor is the single canonical runtime engine

---

## 2. Architecture Rules

The following rules are **mandatory** and must never be violated:

1. **Never redesign architecture.** Extend, do not replace.
2. **Preserve module boundaries.** Each domain lives in its designated directory under `server/src/`.
3. **Preserve versioned contracts.** REST and Socket.IO contracts are the source of truth between this repository and `kazakovak2001-lgtm/Frontend`.
4. **Preserve repository ownership.** `server/src/` is the Node.js backend, `studio-plugin/src/` is the Roblox Studio runtime, and the standalone Frontend repository is the only web client. Root `src/` is forbidden.
5. **Preserve pipeline stages.** PlanExecutor → Agents → Evaluation → Memory → Artifacts is the canonical flow.
6. **No cross-repository source imports.** Frontend integration uses REST and Socket.IO; backend and Studio communicate through the Studio protocol.
7. **Respect Boundary Firewall.** `scripts/validate-boundaries.ts` must pass with 0 violations.
8. **Respect Dependency Graph.** `architecture.manifest.json` defines allowed and forbidden edges.
9. **PlanExecutor is the only runtime execution engine.** `aiPipelineIntegrator` is deprecated and hard-banned from runtime code.

---

## 3. Development Rules

| Rule                    | Requirement                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------- |
| TypeScript strict mode  | Backend code compiles under `strict: true` with `noUnusedLocals`, `noUnusedParameters` |
| Zero compiler errors    | Backend and standalone Frontend type checks pass in their owning repositories          |
| Zero ESLint errors      | `eslint` must pass with no warnings in CI mode                                         |
| Backward compatibility  | Existing API contracts must not break                                                  |
| No breaking API changes | New endpoints are additive; existing responses unchanged                               |
| Explicit typing only    | No `any` in production code; use `unknown` with type guards                            |
| Small focused commits   | One logical change per commit; Conventional Commits format                             |
| Version-by-version      | Each version has a clear scope; no scope creep                                         |

---

## 4. Allowed Changes

AI assistants MAY:

- Add new modules within existing domain boundaries
- Add new services that follow existing patterns
- Add validators and schema enforcement
- Improve runtime robustness (error handling, retry, checkpoint)
- Improve observability (tracing, telemetry, metrics)
- Improve testing (unit, integration, E2E)
- Improve documentation
- Fix bugs within requested scope

**Condition:** All changes must stay inside the requested scope for the current version.

---

## 5. Forbidden Changes

AI assistants must NEVER:

- Rename unrelated files or folders
- Move folders or restructure directories without explicit request
- Delete modules (quarantine instead)
- Rewrite architecture or orchestration flow
- Introduce unnecessary dependencies
- Perform mass refactors across unrelated modules
- Modify previous version outputs without explicit request
- Add features outside the current version scope
- Override deterministic execution mode
- Break existing API response shapes

**If an issue outside the requested scope is discovered:** Document it in the version report under "Known Issues" or "Recommendations" — do NOT fix it.

---

## 6. Version Workflow

Every version MUST follow this workflow in order:

```
1. Implement
   └── Write code within requested scope

2. Validate
   └── tsc --noEmit (frontend + backend)

3. Build
   └── Verify compilation succeeds

4. Boundary Check
   └── validate-boundaries.ts → 0 violations
   └── validate-architecture.ts → STABLE

5. Runtime Check
   └── No runtime errors in standard flow

6. Documentation
   └── Version report generated
   └── Validation results documented

7. Final Report
   └── Summary of changes
   └── Validation proof
   └── Known issues
   └── Recommendations
```

**No version is complete before ALL validation passes.**

---

## 7. Validation Checklist

Every version must pass ALL of the following:

### Frontend

- [ ] `tsc --noEmit` → 0 errors

### Backend

- [ ] `tsc --project server/tsconfig.json --noEmit` → 0 errors

### Architecture

- [ ] `npx tsx scripts/validate-architecture.ts` → exit 0
- [ ] `npx tsx scripts/validate-boundaries.ts` → 0 critical violations

### Code Quality

- [ ] ESLint passes (when configured)
- [ ] No `any` types in new code
- [ ] Conventional Commits format

### Runtime

- [ ] No silent failures in standard flow
- [ ] All outputs JSON-serializable
- [ ] Checkpoints created per pipeline phase

### End-to-End

- [ ] E2E simulator framework operational
- [ ] All validation checks pass

---

## 8. Documentation Standards

Every version MUST generate:

| Document                             | Content                                                     |
| ------------------------------------ | ----------------------------------------------------------- |
| Version report (`reports/vX.Y_*.md`) | Summary of changes, validation results, architecture impact |
| Validation proof                     | tsc output, boundary check output                           |
| Architecture changes                 | New modules, modified boundaries, new contracts             |
| Known issues                         | Discovered problems outside scope                           |
| Future recommendations               | Suggested improvements for next version                     |

---

## 9. AI Behaviour

Every AI assistant working on this repository MUST:

1. **Stay inside requested scope.** Do not add features not explicitly asked for.
2. **Preserve compatibility.** Never break existing consumers.
3. **Prefer extension over replacement.** Add new code alongside existing; do not rewrite.
4. **Avoid speculative implementations.** Only build what is requested and validated.
5. **Explain important architectural decisions.** Document WHY, not just WHAT.
6. **Never sacrifice stability for convenience.** A working system is more valuable than a clean one.
7. **Validate before declaring done.** Run all checks in the validation checklist.
8. **Use quarantine over deletion.** If a module's status is uncertain, move to `_quarantine/`.
9. **Commit atomically.** Each commit must leave the system in a compilable state.
10. **Respect the governance document.** This file is the final authority on development standards.

---

## References

- `architecture.manifest.json` — Domain definitions and boundary rules
- `scripts/validate-architecture.ts` — Backend and Studio architecture validator
- `scripts/validate-boundaries.ts` — Import boundary firewall
- `server/tsconfig.json` — Backend TypeScript configuration
- Standalone Frontend repository — Web-client TypeScript configuration
