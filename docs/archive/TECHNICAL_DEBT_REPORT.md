# Technical Debt Report — v1.3.3

## Critical (0)

No critical technical debt identified.

## High (3)

| ID    | Issue                                         | File                                           | Impact                                                    |
| ----- | --------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------- |
| TD-H1 | `aiPipelineIntegrator.ts` is 628 lines        | `server/src/execution/aiPipelineIntegrator.ts` | Hard to maintain; memory update logic should be extracted |
| TD-H2 | 5 dead code files still in repository         | See ARCHITECTURE_REFACTOR_PLAN.md Phase 1      | Grep pollution, developer confusion                       |
| TD-H3 | Stale documentation (API.md, ARCHITECTURE.md) | `docs/`                                        | New developers get incorrect mental model                 |

## Medium (6)

| ID    | Issue                                                                          | File                                                     | Impact                              |
| ----- | ------------------------------------------------------------------------------ | -------------------------------------------------------- | ----------------------------------- |
| TD-M1 | Socket.io bridge in index.ts is 100+ lines of switch/case                      | `server/src/index.ts`                                    | Verbose; could be auto-dispatched   |
| TD-M2 | 15 `as any` casts at serialization boundaries                                  | Various assembly/ files                                  | Reduced type safety at those points |
| TD-M3 | Sync FS in persistence layer                                                   | `AssemblyPersistenceStore.ts`, `AssemblyHistoryIndex.ts` | Blocks event loop during writes     |
| TD-M4 | `governance/aiGovernance.ts` is in wrong folder                                | Should be in `validation/`                               | Confusing placement                 |
| TD-M5 | `CompilerOrchestrator.ts` (v1.0) is partially superseded by CompilerAPI (v1.1) | Both exist                                               | Could be merged                     |
| TD-M6 | No ESLint configuration                                                        | Project root                                             | No automated style enforcement      |

## Low (5)

| ID    | Issue                                                                                     | File                                                      | Impact                      |
| ----- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------- |
| TD-L1 | Singleton pattern repeated 8 times                                                        | Various `*Registry.ts` files                              | Could use a generic factory |
| TD-L2 | Event emission helper duplicated in 3 files                                               | aiPipelineIntegrator, AssemblyBuilder, GenerationPipeline | ~20 lines each              |
| TD-L3 | `commitlint.config.js` exists but no husky pre-commit enforces it for dev                 | `.husky/`                                                 | Not blocking CI             |
| TD-L4 | `vite.config.ts` has generated `.js`/`.d.ts` siblings                                     | Root                                                      | Cosmetic noise              |
| TD-L5 | `IMPLEMENTATION_COMPLETE.md`, `IMPLEMENTATION_SUMMARY.md`, `QUICK_REFERENCE.md` are stale | Root                                                      | Misleading                  |

## Informational (3)

| ID    | Issue                                                                    | File       | Impact                                    |
| ----- | ------------------------------------------------------------------------ | ---------- | ----------------------------------------- |
| TD-I1 | No test suite exists                                                     | —          | Cannot verify behavior during refactoring |
| TD-I2 | No CI/CD pipeline YAML is active (`.github/workflows/ci.yml` just added) | `.github/` | Builds not verified on push               |
| TD-I3 | `storage/` directory doesn't exist until first assembly build            | —          | Expected; not a bug                       |

## Debt Score

**Total weighted score**: 23/100 (lower is better)

- Critical: 0 × 10 = 0
- High: 3 × 5 = 15
- Medium: 6 × 1.5 = 9
- Low: 5 × 0.5 = 2.5
- Round: **27 points** of debt

**Assessment**: Acceptable for a v1.x project. No blockers for continued development.
