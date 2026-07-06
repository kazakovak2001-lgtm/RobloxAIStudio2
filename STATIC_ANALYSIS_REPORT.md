# Static Analysis Report — v1.3.3

## TypeScript Compiler

| Project                         | Errors | Warnings | Status  |
| ------------------------------- | ------ | -------- | ------- |
| Server (`server/tsconfig.json`) | 0      | 0        | ✅ PASS |
| Frontend (`tsconfig.json`)      | 0      | 0        | ✅ PASS |

**Strict mode enabled**: `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`

## Import Analysis

| Check                     | Result                                         |
| ------------------------- | ---------------------------------------------- |
| Broken imports            | 0                                              |
| Circular imports detected | 0 (verified via dependency direction audit)    |
| Cross-layer violations    | 0 (lower layers never import upper)            |
| Legacy import paths       | 0 (all `agents/` references removed in v1.3.2) |

## `as any` Casts (15 total)

| File                      | Count | Reason                                                          | Risk |
| ------------------------- | ----- | --------------------------------------------------------------- | ---- |
| `AssemblyDiffEngine.ts`   | 6     | Array type widening for generic diff function                   | LOW  |
| `aiPipelineIntegrator.ts` | 4     | Memory writeContext field extraction from untyped agent outputs | LOW  |
| `blueprintAssembler.ts`   | 3     | Dynamic field extraction from pipeline outputs                  | LOW  |
| `ProjectContext.ts`       | 2     | deepMerge type bridging                                         | LOW  |

All are localized to serialization/deserialization boundaries where runtime types are validated elsewhere (LLMOutputParser, EvaluationRules).

## Console Usage (Structured Logging)

~45 `console.log`/`console.warn`/`console.error` statements. All follow the structured format:

```
[MODULE] Action | Key: Value | Key: Value
```

Examples:

- `[EVALUATION] Agent: X | Score: Y | Duration: Zms`
- `[PLANNING] Next Step: X | Reason: Y`
- `[GOVERNANCE] Decision: X | Score: Y`
- `[WORKER] Started | ID: X`

**Assessment**: Intentional observability layer. Production-ready (could be upgraded to a logger library in future).

## Synchronous File System (12 calls)

All in `server/src/assembly/`:

- `AssemblyPersistenceStore.ts` — `existsSync`, `mkdirSync`, `writeFileSync`, `readFileSync`, `readdirSync`
- `AssemblyHistoryIndex.ts` — `existsSync`, `readFileSync`, `writeFileSync`, `mkdirSync`

**Assessment**: Acceptable for file-based persistence layer. These execute outside the hot request path (only during assembly build completion). Would need async conversion for high-concurrency production use.

## Duplicate Code

| Pattern                    | Locations                                                 | Estimated Duplication                                                    |
| -------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------ |
| Agent process() structure  | 13 agent files                                            | Structural similarity (not copy-paste) — each has unique prompt/fallback |
| Registry singleton pattern | 8 registries                                              | Same pattern, different types — acceptable                               |
| Event emission boilerplate | aiPipelineIntegrator, AssemblyBuilder, GenerationPipeline | ~20 lines repeated — could extract helper                                |

**Overall duplication estimate**: <5% — well within acceptable range.

## Error Handling Coverage

| Layer                | Pattern                                           | Coverage |
| -------------------- | ------------------------------------------------- | -------- |
| CompilerAPI          | Input validation + `CompilerErrorBoundary.safe()` | 100%     |
| CompilerOrchestrator | `CompilerErrorBoundary.safe()` per stage          | 100%     |
| Agents               | `BaseAgent.execute()` retry loop (3 attempts)     | 100%     |
| Pipeline             | try/catch with structured fallback result         | 100%     |
| Persistence          | Individual file ops don't crash pipeline          | 100%     |
| LLM calls            | `generateWithRetry()` with repair prompt          | 100%     |

## Distributed Runtime Assessment

| Component           | Issue                                                         | Severity                  |
| ------------------- | ------------------------------------------------------------- | ------------------------- |
| JobQueueManager     | In-memory only — lost on restart                              | INFO (by design for v1.2) |
| WorkerHealthMonitor | Heartbeat threshold is configurable but not tested under load | LOW                       |
| CompilerWorkerNode  | Poll-based (setInterval) — could miss rapid queue changes     | LOW                       |
| NetworkJobRouter    | Routing table in-memory — no persistence                      | INFO (by design)          |

No deadlock risks detected (no mutex/lock patterns used).
No starvation risks (priority queue with FIFO within priority).
