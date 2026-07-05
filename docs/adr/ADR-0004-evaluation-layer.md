# ADR-0004: Evaluation & Quality Control Layer

**Status:** Accepted
**Date:** 2026-07-05
**Deciders:** Engineering Team

---

## Context

LLM-generated outputs are inherently non-deterministic. The pipeline needs a systematic way to validate every agent output before accepting it, measure quality, and abort early on unusable results.

## Decision

Implement a declarative evaluation layer (server/src/evaluation/):

- `AgentEvaluationSpec` defines required keys, nested checks, array/object/string validation per agent
- `EvaluationRules` provides pure static rule functions (no side effects)
- `Evaluator.evaluate()` runs all rules, computes qualityScore (0-100), returns structured result
- Scoring: -20 per error, -5 per warning, clamped to [0, 100]
- Thresholds: <60 = failed, <80 = warning, ≥80 = passed
- Evaluation runs after every agent in `AIPipelineIntegrator`
- `evaluation.failed` status aborts the pipeline (same as agent failure)
- SSE events: evaluation.started / evaluation.completed / evaluation.failed

## Consequences

**Positive:** Every pipeline step has a quality score; bad outputs are caught immediately; frontend can show per-step quality
**Negative:** Overly strict specs could cause unnecessary pipeline failures (tunable via thresholds)

## Alternatives Considered

| Alternative                   | Reason Not Chosen                                      |
| ----------------------------- | ------------------------------------------------------ |
| Post-pipeline validation only | Late detection; wasted LLM tokens on subsequent stages |
| LLM-based self-evaluation     | Expensive; adds latency; non-deterministic             |
