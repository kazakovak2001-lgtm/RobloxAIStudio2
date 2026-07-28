# CUTOVER-1F Post-Promotion CI Alignment

**Status**: Verified  
**Date**: July 28, 2026  
**Tracking issue**: #30  
**Implementation pull request**: #31

## Objective

Align CI and release-integrity verification with the promoted repository default branch before any legacy frontend decommission work begins.

## Pre-Implementation Finding

The repository default branch had already been promoted to:

```text
release/cutover-1e-candidate
```

However, `.github/workflows/ci.yml` still limited `push` runs to the previous default branch and `feature/plugin-merge`. Its release-readiness job also continued to compare the historical pre-promotion branches. Pull-request validation remained active, but post-merge push validation and the readiness semantics were no longer aligned with the repository default.

## Implemented Alignment

The focused CUTOVER-1F change:

- targets `release/cutover-1e-candidate` for push CI;
- retains transitional push coverage for `feature/plugin-merge`;
- removes `standing-pentaceratops` from canonical push targeting;
- preserves the historical CUTOVER-1D inventory unchanged;
- introduces `config/cutover/promoted-baseline.inventory.json`;
- introduces `scripts/cutover/verify-promoted-baseline-integrity.mjs`;
- replaces the stale readiness invocation with `Promoted Baseline Integrity`;
- preserves the exact standalone Frontend release commit and independent rollback rehearsal.

## Integrity Contract

The promoted-baseline verifier proved that:

1. CUTOVER-1E merge commit `95dda46034b29c9d6de9af15f9a44c2c0d2c938e` remains an ancestor of the promoted default;
2. `backup/default-before-cutover-1e` remains pinned to `91a1626d080a4bc22ce20648c4ff10481ae6e299`;
3. active release artifacts remain isolated from root `src/`, root `public/`, legacy Vite configuration, and the prior combined deployment stack;
4. CI push targeting includes the promoted default and excludes the obsolete default;
5. CI invokes the promoted-baseline verifier rather than the historical pre-promotion verifier;
6. the exact standalone Frontend release identity remains `1036c3ef9705d145cb9700cd14268a33d2abdd58`;
7. legacy frontend cleanup remains unauthorized.

## Verification Evidence

Protected pull request #31 triggered:

```text
CI Pipeline run: 30320863802 (#261)
Verified head: f50af319b22e7ed8f2296862b64bcff3c52b4103
```

The first PostgreSQL service initialization was interrupted by repeated Docker Hub connection timeouts before checkout. The isolated job retry completed successfully without any source change.

The final run state passed:

- TypeScript Check;
- ESLint;
- Prettier Check;
- Test Suite;
- PostgreSQL Restart E2E;
- Backend Release Image;
- Composed HTTPS Release;
- Promoted Baseline Integrity;
- Repository Validation;
- Commit Message Lint;
- Merge Gate.

Promoted-baseline evidence:

```text
Artifact name: cutover-1f-promotion-integrity
Artifact ID: 8673979912
Digest: sha256:751d72c2e889fef8d6446a9e0e701240857f3143ec897f0c380c584a5df2ad43
```

The merge commit is recorded in issue #30 and pull request #31 after the protected merge operation.

## Cleanup Boundary

CUTOVER-1F does not delete or prune any legacy frontend file, dependency, script, or deployment artifact. The next stage is CLEANUP-1A: a machine-readable legacy frontend decommission audit and removal plan.

## Rollback

Revert the focused CUTOVER-1F pull request. The CUTOVER-1E default promotion, protected branch, pinned rollback reference, and independently deployable backend and Frontend artifacts remain unchanged.
