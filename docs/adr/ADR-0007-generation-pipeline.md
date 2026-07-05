# ADR-0007: Roblox Generation Pipeline

**Status:** Accepted
**Date:** 2026-07-05
**Deciders:** Engineering Team

---

## Context

After completing the AI core (orchestrator, LLM wiring, evaluation, memory, planning), the system needed a finalization layer that consumes all agent outputs and produces a single, validated, complete GameBlueprint ready for future export. Previously, `aggregateToGameGenerationResult` produced a raw artifact — useful for the frontend but not suitable as a structured engineering deliverable with manifest, validation, and reporting.

## Decision

Implement a Generation Pipeline (`server/src/generation/`) that runs AFTER `AIPipelineIntegrator` completes:

**Core components:**

- `GenerationTypes.ts` — Pipeline versioning (`CURRENT_VERSIONS`), `GenerationStatus`, `ValidationIssue`, `BlueprintValidationResult`, `GenerationManifest`, `GenerationReport`
- `GenerationBlueprint.ts` — `GameBlueprint` interface (central typed data model), `createGameBlueprint()`, `mergeBlueprint()` (deep merge with conflict prevention)
- `BlueprintValidator.ts` — Validates required sections, cross-agent consistency, scoring (100 base, -15/error, -5/warning)
- `GenerationManifest.ts` — `buildGenerationManifest()` with all pipeline version numbers and execution metadata
- `GenerationReport.ts` — `buildGenerationReport()` structured multi-section report
- `GenerationRegistry.ts` — In-memory store for blueprints, manifests, reports
- `GenerationPipeline.ts` — Orchestrates: read memory → merge → validate → manifest → report → store → emit events

**Architecture:**

```
AIPipelineIntegrator (plan-driven execution)
  → Memory populated with agent outputs
  → pipeline.completed
  ↓
GenerationPipeline.finalize(memory, options)
  → Create GameBlueprint from memory context
  → Merge all sections (deterministic deep merge)
  → Validate (BlueprintValidator)
  → Build GenerationManifest (all versions, metrics)
  → Build GenerationReport (structured, human-readable)
  → Store in GenerationRegistry
  → Emit generation.* events
  → Return complete GameBlueprint
```

**Events:** `generation.started`, `generation.blueprint.updated`, `generation.validation.completed`, `generation.report.created`, `generation.completed`, `generation.failed`

**Versioning:** Every manifest tracks exact versions of generation pipeline, planning engine, memory layer, evaluation layer, blueprint schema, manifest schema.

## Consequences

**Positive:**

- Single canonical output model (`GameBlueprint`) for the entire system
- Blueprint validation catches incomplete generations before they reach the frontend
- Manifest enables reproducibility and debugging (all versions + metadata recorded)
- Report provides engineering traceability without additional tooling
- Registry enables status queries and post-run inspection

**Negative:**

- Additional processing after pipeline completion (minimal: < 10ms)
- GameBlueprint duplicates some data already in ProjectContext (acceptable for self-containment)

**Neutral:**

- No persistence beyond process lifetime (same as memory/planning layers)
- No export to file/Roblox Studio (future milestone)

## Future Extensions

- Export to `.rbxl`/`.rbxmx` format
- Blueprint diffing between generations
- Blueprint versioning with rollback
- Cloud-stored blueprints for collaboration
- Export manifest to CI/CD pipeline metadata
