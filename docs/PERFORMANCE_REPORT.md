# Performance Report — v3.1

## Benchmark Results

| Operation                   | Measured     | Threshold | Status |
| --------------------------- | ------------ | --------- | ------ |
| Full Lua package generation | <5ms         | <50ms     | ✅     |
| 10 sequential generations   | <50ms        | <200ms    | ✅     |
| Experience assembly         | <5ms         | <20ms     | ✅     |
| Asset generation            | <2ms         | <10ms     | ✅     |
| Playtest analysis           | <5ms         | <10ms     | ✅     |
| 3 repair iterations         | <10ms        | <50ms     | ✅     |
| 5 concurrent orchestrators  | <3s          | <5s       | ✅     |
| 100 generations memory      | <50MB growth | <50MB     | ✅     |

## Build Performance

| Metric                      | Value               |
| --------------------------- | ------------------- |
| Frontend build (vite)       | ~15-20s             |
| TypeScript check (frontend) | ~3s                 |
| TypeScript check (backend)  | ~3s                 |
| Test suite (307 tests)      | ~13s                |
| Workspace bundle            | 254 KB (72 KB gzip) |

## Memory Profile

- 100 Lua generations: <50MB heap growth
- No detected memory leaks in generation engines
- Bounded history in event bus (1000 max)
- Bounded audit log (5000 max)
- Pipeline store: bounded by active sessions

## Concurrency

- 5 simultaneous orchestrator sessions: all complete successfully
- No race conditions detected in async pipeline execution
- Fire-and-forget pattern prevents request blocking

## Recommendations

1. For production: add request rate limiting (100 req/min per IP)
2. Consider worker threads for CPU-intensive generations at scale
3. Add Redis for session state in multi-instance deployment
