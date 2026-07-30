# ARCH-205 Implementation Contract

Tracks issues #108, #110 and completes the protected evidence work for ARCH-2B.

## Design principles

- The architecture decision is a pure value, not an incidental side effect of CLI logging.
- Report status and process exit code are derived from the same `BoundaryGateDecision`.
- Negative fixtures demonstrate rejection of invalid architecture states.
- Temporary layer exceptions remain visible as acknowledged debt and are never reported as clean architecture.
- Exception removal is evidence-driven: a manifest exception remains only while a real AST edge requires it.

## ARCH-205 implementation slice

- Added `scripts/architecture/boundary-gate-core.ts`.
- Replaced duplicated decision logic in `scripts/validate-boundaries.ts` with the pure core.
- Added focused Vitest fixtures for manifest completeness, stale subsystem declarations, unknown layers, duplicate and stale exceptions, forbidden layer edges, allowlisted debt, cycle normalization, non-allowlisted cycles, critical violations and unresolved imports.
- Added filesystem-backed AST fixtures proving static import, re-export, dynamic import and CommonJS discovery.
- Added review-driven regression coverage for malformed exception reasons and unresolved internal targets.
- Regenerated canonical tracked-file inventories and protected the result in CI.

## ARCH-206 closure slice

- Added the versioned `architecture.layer-debt.json` evidence document.
- Recorded all 18 active AST edges supporting the four retained `allowedLayerEdges` entries.
- Assigned each retained edge to exactly one owning milestone: `RUNTIME-2D`, `DURABILITY-2E` or `STUDIO-2F`.
- Added deterministic evidence construction and validation under `scripts/architecture/layer-debt-evidence.ts`.
- Added a real repository AST test and protected validation command that fail on evidence drift, stale owners or missing allowed-edge ownership.
- Replaced broad manifest reasons with concrete source-file summaries and remediation milestones; exact import specifiers remain canonical in `architecture.layer-debt.json`.
- Final protected validation is required on the exact non-bot head before merge.

## Remaining work

None within the ARCH-2B evidence contract. Dependency inversion and removal of the four active exceptions continue under their recorded RUNTIME-2D, DURABILITY-2E and STUDIO-2F owners.
