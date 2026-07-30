# ARCH-205 Implementation Contract

Tracks issue #108 and completes the remaining protected evidence work for ARCH-2B.

## Design principles

- The architecture decision is a pure value, not an incidental side effect of CLI logging.
- Report status and process exit code are derived from the same `BoundaryGateDecision`.
- Negative fixtures must demonstrate rejection of invalid architecture states.
- Temporary layer exceptions remain visible as acknowledged debt and are never reported as clean architecture.
- Exception removal is evidence-driven: a manifest exception is removed only when no real AST edge requires it.

## First implementation slice

- Added `scripts/architecture/boundary-gate-core.ts`.
- Replaced duplicated decision logic in `scripts/validate-boundaries.ts` with the pure core.
- Added focused Vitest fixtures for manifest completeness, stale subsystem declarations, unknown layers, duplicate and stale exceptions, forbidden layer edges, allowlisted debt, cycle normalization, non-allowlisted cycles, critical violations and unresolved imports.
- Added filesystem-backed AST fixtures proving static import, re-export, dynamic import and CommonJS discovery.
- Regenerated canonical tracked-file inventories and protected the result in CI.

## Remaining work

1. Record exact real edges supporting each remaining `allowedLayerEdges` entry.
2. Remove stale exceptions and assign any retained debt to a concrete milestone and source path.
