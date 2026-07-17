# Requirements: UX-3D Duplicate Consolidation Sprint 1

## Overview

Eliminate active duplicate implementations (AppLayout → AppShell migration) without changing application behavior. The repository must behave exactly as before after this sprint.

## Source of Truth

All duplicate sets come from `docs/DUPLICATE_EXECUTION_REPORT.md` (Phase UX-3C.1).

## Requirements

### R1: All pages must use AppShell layout

All page components that currently import `AppLayout` must be migrated to use `AppShell` from `shared/ui/layout/AppShell`.

### R2: No functionality changes

Application behavior, routing, and user flows must remain identical after migration.

### R3: Build stability

TypeScript build, lint, and production build must pass after every migration step.

### R4: Orphan page cleanup

Pages that are not referenced in routing (AiEngineDemoPage.tsx, ProjectDetailPage.tsx) should be migrated or deleted if truly unused.

### R5: Legacy layout removal

After all consumers are migrated, `src/layouts/AppLayout.tsx` and related legacy layout files must be removed.

### R6: Documentation update

Migration progress documentation must reflect the final state of the repository.
