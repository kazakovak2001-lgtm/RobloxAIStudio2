# Requirements: UX-3D Sprint 2 — shared/ui Migration

## Overview

Complete the remaining UX-3C.2 tasks (SU-23 through SU-27) and delete all orphaned legacy UI/layout files. The application must behave identically before and after.

## Requirements

### R1: Delete Legacy UI Directory

The `src/components/ui/` directory must be deleted. It has zero active imports and all functionality has been replaced by `shared/ui/`.

### R2: Delete Legacy Layout Directory

The `src/components/layout/` directory (Navbar.tsx, Sidebar.tsx and map files) must be deleted. It has zero active imports and all functionality has been replaced by `shared/ui/layout/`.

### R3: Preserve ErrorBoundary

`src/components/ErrorBoundary.tsx` must NOT be deleted — it is actively used by Workspace.tsx.

### R4: Build Stability

After every deletion: TypeScript compilation (`npx tsc --noEmit`) and Vite production build (`npx vite build`) must pass.

### R5: No Behavior Change

No routes, APIs, business logic, or visual output may change. This is purely dead code removal.

### R6: Documentation

Generate sprint deliverables: SHARED_UI_EXECUTION_RESULTS.md, update MIGRATION_PROGRESS.md.
