# Code Health Report — v1.3.3

## Summary

| Metric                             | Value                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| Server source files                | ~85                                                                              |
| Frontend source files              | ~30                                                                              |
| Total TypeScript errors (server)   | **0**                                                                            |
| Total TypeScript errors (frontend) | **0**                                                                            |
| Files over 300 lines               | 8                                                                                |
| `as any` casts                     | ~15                                                                              |
| `console.*` statements             | ~45 (intentional structured logging)                                             |
| TODO/FIXME/HACK comments           | 0                                                                                |
| `eval()` usage                     | 0                                                                                |
| Synchronous FS calls               | ~12 (in AssemblyPersistenceStore/HistoryIndex — acceptable for file persistence) |

## Scores (0–100)

| Category                     | Score  | Notes                                                                                |
| ---------------------------- | ------ | ------------------------------------------------------------------------------------ |
| **Type Safety**              | 92     | 0 TS errors; ~15 `as any` casts (mostly in diff/aggregation serialization)           |
| **Code Quality**             | 85     | 8 files over 300 lines; no dead code in live paths after v1.3.2                      |
| **Maintainability**          | 88     | Clear module boundaries; single-responsibility per file; some large orchestrators    |
| **Reliability**              | 90     | Error boundaries in place; retry logic; fallback paths; deterministic outputs        |
| **Performance**              | 82     | No O(n²) in hot paths; sync FS in persistence (acceptable); some deep-clone overhead |
| **Security**                 | 90     | No eval; no secret exposure; env-var only config; input validation on API boundary   |
| **Architecture Consistency** | 88     | Layer boundaries correct; 5 dead files remain (from audit, not yet removed)          |
| **Documentation**            | 78     | ADRs current; API docs outdated; 3 stale root docs remain                            |
| **Overall Health**           | **87** | READY for continued development                                                      |

## Dead Code (Identified, Not Removed)

| File                                           | Status | Reason                                   |
| ---------------------------------------------- | ------ | ---------------------------------------- |
| `server/src/execution/incrementalGenerator.ts` | Dead   | Never imported                           |
| `server/src/execution/pipelineEngine.ts`       | Dead   | 3-line re-export shim                    |
| `server/src/engine/GameGenerationEngine.ts`    | Dead   | Redundant composition root               |
| `server/src/pipeline/PipelineRunner.ts`        | Dead   | Superseded by aiPipelineIntegrator       |
| `server/src/governance/orchestrator.ts`        | Dead   | Speculative interfaces never implemented |

## Large Files (>300 lines)

| File                                | Lines | Risk                                         |
| ----------------------------------- | ----- | -------------------------------------------- |
| `aiPipelineIntegrator.ts`           | 628   | HIGH — candidate for extraction              |
| `AssemblyImpactAnalyzer.ts`         | 320   | MEDIUM                                       |
| `blueprintAssembler.ts`             | 319   | MEDIUM                                       |
| `CompilerAPI.ts`                    | 388   | MEDIUM — API surface is naturally large      |
| `CompilerOrchestrator.ts`           | 313   | LOW — orchestration is inherently sequential |
| `gameGenerationResultAggregator.ts` | 310   | MEDIUM                                       |
| `PlanningEngine.ts`                 | 324   | LOW                                          |
| `index.ts`                          | 368   | MEDIUM — Socket.io bridge is verbose         |

## Async Safety

| Pattern                  | Count                                   | Risk                                |
| ------------------------ | --------------------------------------- | ----------------------------------- |
| `void` (fire-and-forget) | ~3                                      | LOW — intentional in queue dispatch |
| Missing await            | 0 detected                              | —                                   |
| Unhandled rejections     | 0 — all wrapped in ErrorBoundary.safe() | —                                   |

## Security

| Check                     | Status                                                   |
| ------------------------- | -------------------------------------------------------- |
| eval() / new Function     | ✓ None                                                   |
| Secret in source          | ✓ None (env-var only)                                    |
| Input validation boundary | ✓ CompilerAPI validates all inputs                       |
| Unsafe JSON.parse         | ✓ All wrapped in try/catch                               |
| File path injection       | LOW risk — persistence uses assemblyId as directory name |
| Command execution         | ✓ None                                                   |

## Recommendation

**READY** for architecture consolidation and continued development.

The 5 dead code files and 3 stale docs are documented in `ARCHITECTURE_REFACTOR_PLAN.md` and can be removed with explicit approval (Phase 1 of the plan).
