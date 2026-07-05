# ADR-0005: Shared Project Memory Layer

**Status:** Accepted
**Date:** 2026-07-05
**Deciders:** Engineering Team

---

## Context

Agents in the pipeline operate sequentially but need shared state. Previously, accumulated outputs were passed as flat key-value blobs — untyped, unversioned, no decision history. As the pipeline grew more complex, a structured memory layer became necessary to:

- Provide typed read/write access to project state
- Record architectural decisions made during generation
- Enable snapshots for debugging/replay
- Prevent direct agent-to-agent coupling

## Decision

Implement a Shared Project Memory subsystem (server/src/memory/):

**Core components:**

- `MemoryTypes.ts` — All type definitions (ProjectContext, ArchitecturalDecision, MemorySnapshot, etc.)
- `ProjectContext.ts` — Factory functions and section types for the master state object
- `ProjectMemory.ts` — Per-execution mutable memory (context, decisions, executions, snapshots)
- `MemoryManager.ts` — Agent-facing API façade (readContext, writeContext, appendDecision, appendWarning, appendRecommendation)
- `MemoryRegistry.ts` — Singleton registry keyed by executionId
- `MemorySerializer.ts` — Pure utilities (serialize, deserialize, clone, deepMerge, validate)

**Pipeline integration:**

- `AIPipelineIntegrator` creates memory at pipeline start via `MemoryRegistry.create()`
- Every agent receives `input.memory` (MemoryManager) + `input.projectContext` (read-only snapshot)
- After each successful step, memory context is updated from agent output
- Snapshot taken after every step
- Decision history records key choices (gameplay loop, architecture, world definition)
- Events emitted: `memory.created`, `memory.updated`, `memory.snapshot`, `memory.decision`

**Memory is in-process only. No persistence, no database, no external storage.**

## Consequences

**Positive:**

- Agents have typed, structured access to full project state
- Decision history provides engineering traceability
- Snapshots enable future replay/debugging
- Cross-agent communication is mediated, never direct

**Negative:**

- Memory is lost on process restart (acceptable for v0.x — persistence is a future milestone)
- Adds ~2ms overhead per step for snapshot creation

## Alternatives Considered

| Alternative                                    | Reason Not Chosen                                                     |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| Vector database / RAG                          | Out of scope; this is project execution state, not semantic retrieval |
| Redis/database persistence                     | Premature; in-memory is sufficient for single-process execution       |
| Agent-to-agent messaging                       | Creates coupling; memory layer keeps agents independent               |
| Flat accumulated outputs only (prior approach) | Untyped, no versioning, no decisions, no snapshots                    |
