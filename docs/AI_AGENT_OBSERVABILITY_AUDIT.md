# AI Agent Observability Audit

**Date**: July 17, 2026

## Existing Infrastructure

| System                   | Tracks                                           | Status        |
| ------------------------ | ------------------------------------------------ | ------------- |
| ExecutionTracer          | Plan/node lifecycle, duration, eval scores       | ✅ Production |
| PipelineMetricsCollector | Pipeline duration, stages, retries, tokens, cost | ✅ Production |
| BaseAgent.execute()      | success, attempts, duration                      | ✅ Partial    |
| LLMOutputParser          | console.warn on missing keys                     | ✅ Partial    |
| AgentMetrics (collab)    | tasks completed/failed per role                  | ✅ Production |
| Frontend panels          | MetricsPanel, CostMonitor, TokenUsage, AuditLog  | ✅ Production |

## Gaps

| Missing                     | Where to Add                         |
| --------------------------- | ------------------------------------ |
| LLM provider/model per call | BaseAgent.generateWithRetry()        |
| Token usage per agent call  | OllamaProvider response (eval_count) |
| JSON repair count           | LLMOutputParser.parseAndValidate()   |
| Validation failure count    | LLMOutputParser.parseAndValidate()   |
| Fallback usage flag         | BaseAgent.generateWithRetry()        |

## Recommendation

Extend `BaseAgent.generateWithRetry()` to emit structured metrics. Use existing `ExecutionTracer` or `console.log` structured JSON. No new systems needed.
