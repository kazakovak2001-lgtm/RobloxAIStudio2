# AI Controller Operational Roadmap

**Date**: July 17, 2026  
**Status**: Planning Document — No Implementation

---

## Current Capabilities (Delivered)

| Capability               | Type           | Status                                  |
| ------------------------ | -------------- | --------------------------------------- |
| Pre-Implementation Check | Gate           | ✅ Active (steering + hook + CLI + API) |
| Duplication Detection    | Agent          | ✅ 695 files indexed                    |
| Architecture Validation  | Agent          | ✅ 1,535 edges, violation detection     |
| Code Review              | Agent          | ✅ Static rules + LLM analysis          |
| Architecture Graph       | Query          | ✅ Dependencies, impact, suggestions    |
| Decision Memory          | Knowledge      | ✅ 10 decisions + 17 rules parsed       |
| GCP Secret Provider      | Infrastructure | ✅ env fallback mode                    |
| Kiro Integration         | Workflow       | ✅ Steering + preToolUse hook           |

**Current mode**: Reactive gate — checks only when asked (before file creation).

---

## Gap Analysis: Gate → Continuous Monitoring

| Aspect    | Current (Gate)              | Target (Continuous)           |
| --------- | --------------------------- | ----------------------------- |
| Trigger   | Manual/hook-driven          | Automatic on every change     |
| Scope     | Single file/intent          | Whole repository health       |
| Frequency | On-demand                   | Periodic + event-driven       |
| Output    | ALLOW/WARN/BLOCK            | Health dashboard + trends     |
| History   | In-memory (lost on restart) | Persistent + queryable        |
| Learning  | Static rules                | Evolving from project history |

---

## Recommended Next Steps (Priority Order)

### Priority 1: Persistence Layer (HIGH IMPACT, LOW RISK)

**What**: Persist CodebaseKnowledge index + DecisionMemory to existing PostgreSQL storage provider.

**Why**: Currently re-indexes 695 files on every server restart. Persistence enables cross-session decision tracking, historical trends, and faster startup.

**Approach**: Use existing `STORAGE_PROVIDER` pattern. Store in `codebase_index` and `architectural_decisions` tables. Auto-reindex on timestamp change.

**Risk**: LOW — additive tables, existing migration runner.  
**Effort**: 4-6 hours.

---

### Priority 2: Continuous Health Score (HIGH IMPACT, MEDIUM RISK)

**What**: Automated Architecture Health Score computed from violations, circular deps, duplication density, and rule compliance.

**Why**: Replace manual "9.2/10" in CURRENT_STATE.md with real-time computed score with trend data.

**Approach**: New method on ArchitectureControllerAgent. Scheduled computation. Expose via API. Store history.

**Risk**: MEDIUM — threshold calibration needed.  
**Effort**: 3-4 hours.

---

### Priority 3: Change Impact Preview (MEDIUM IMPACT, LOW RISK)

**What**: Show which files/modules are affected by current git diff before committing.

**Why**: Architecture Graph already answers "what depends on X?" — connect it to git diff.

**Approach**: Parse `git diff --name-only`, run impact analysis per changed file, aggregate report.

**Risk**: LOW — read-only analysis.  
**Effort**: 2-3 hours.

---

### Priority 4: Learning from Outcomes (MEDIUM IMPACT, HIGH RISK)

**What**: Record whether pre-check predictions were correct. Adjust confidence thresholds over time.

**Why**: No feedback loop exists. System can't improve without outcome data.

**Approach**: Feedback API, outcome recording in DecisionMemory, threshold adjustment.

**Risk**: HIGH — needs enough data, careful design.  
**Effort**: 6-8 hours.

---

### Priority 5: Semantic Search (LOW IMPACT, MEDIUM RISK)

**What**: Embedding-based similarity instead of keyword matching.

**Why**: "notification system" doesn't match "Toast component" with keywords.

**Approach**: Use LLM embeddings, cosine similarity, fallback to keywords.

**Risk**: MEDIUM — LLM dependency for indexing.  
**Effort**: 8-12 hours.

---

### Priority 6: CI Pipeline Integration (LOW IMPACT, LOW RISK)

**What**: Advisory CI step that runs pre-check on new files in PRs.

**Approach**: New CI job, parse output, post PR comment. Non-blocking.

**Risk**: LOW — advisory only.  
**Effort**: 2 hours.

---

## Anti-Patterns to Avoid

- Making pre-check blocking in CI (causes resentment)
- Adding complex ML models (maintenance burden)
- Creating a separate dashboard app (scope creep)
- Replacing existing validators (they work — extend them)
- Running full scan on every commit (too slow)

---

## Recommended Implementation Order

```
Month 1: Persistence + Change Impact Preview
Month 2: Health Score + CI Integration
Month 3: Learning (if enough data)
Month 4+: Semantic Search (if false negatives are high)
```

---

## Success Metrics

| Metric                  | Current | Target (3 months)    |
| ----------------------- | ------- | -------------------- |
| Duplicate files created | Unknown | 0 per sprint         |
| Pre-check usage rate    | Manual  | 100% of new features |
| False positive rate     | Unknown | <10%                 |
| Architecture violations | 1       | 0                    |
| Health score            | Manual  | Automated + trending |
| Decision memory entries | 10      | 30+ (with outcomes)  |
