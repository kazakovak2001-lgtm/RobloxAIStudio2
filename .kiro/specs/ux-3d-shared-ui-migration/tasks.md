# Implementation Plan: UX-3D Sprint 2 — shared/ui Migration

## Overview

Delete all orphaned legacy UI and layout files from `src/components/`. All pages already use `shared/ui/` components. This sprint completes UX-3C.2 tasks SU-23 through SU-27.

## Tasks

- [ ] 1. Delete legacy src/components/ui/ directory
  - [ ] 1.1 Verify zero imports and delete src/components/ui/
    - Search entire `src/` for any import referencing `components/ui/` — must find zero
    - Delete all files in `src/components/ui/`: Avatar.tsx, Badge.tsx, Breadcrumb.tsx, Button.d.ts, Button.d.ts.map, Button.js.map, Button.tsx, Card.d.ts, Card.d.ts.map, Card.js.map, Card.tsx, Dialog.tsx, Dropdown.tsx, Input.tsx, Loader.tsx, Modal.tsx, Pagination.tsx, Table.tsx, Tabs.tsx, Toast.tsx, Tooltip.tsx
    - Delete the `src/components/ui/` directory itself
    - Run `npx tsc --noEmit` to verify TypeScript passes
    - Run `npx vite build` to verify production build passes
    - _Requirements: R1, R4, R5_

- [ ] 2. Delete legacy src/components/layout/ directory
  - [ ] 2.1 Verify zero imports and delete src/components/layout/
    - Search entire `src/` for any import referencing `components/layout/` — must find zero
    - Verify `src/components/ErrorBoundary.tsx` is NOT in this directory (it is at `src/components/ErrorBoundary.tsx`, not in `layout/`)
    - Delete all files in `src/components/layout/`: Navbar.tsx, Navbar.d.ts, Navbar.d.ts.map, Navbar.js.map, Sidebar.tsx
    - Delete the `src/components/layout/` directory itself
    - Run `npx tsc --noEmit` to verify TypeScript passes
    - _Requirements: R2, R3, R4, R5_

- [ ] 3. Verify shared/ui coverage across all pages
  - [ ] 3.1 Audit all page imports for shared/ui usage
    - For each page in `src/pages/` and `src/features/workspace/Workspace.tsx`, verify imports come from `shared/ui/` (not from any legacy path)
    - Confirm zero remaining imports from `src/components/ui/` or `src/components/layout/`
    - Verify `src/components/` directory only contains `ErrorBoundary.tsx`
    - Run `npx tsc --noEmit` to confirm build stability
    - _Requirements: R4, R5_

- [ ] 4. Final validation and documentation
  - [ ] 4.1 Run full validation and generate deliverables
    - Run `npx tsc --noEmit` — must pass
    - Run `npx vite build` — must pass
    - Verify all routes still work by checking App.tsx routing configuration
    - Generate `docs/SHARED_UI_EXECUTION_RESULTS.md` with: sprint summary, files deleted, validation results
    - Update `docs/MIGRATION_PROGRESS.md`: mark UX-3C.2 as 100% COMPLETE, update completion percentages, add activity entry
    - _Requirements: R4, R5, R6_

## Notes

- All pages already import from `shared/ui/` — confirmed in Sprint 2 analysis
- `src/components/ErrorBoundary.tsx` must be preserved (active import from Workspace.tsx)
- The legacy `src/components/ui/` has zero active imports — safe to delete entirely
- The legacy `src/components/layout/` has zero active imports — safe to delete entirely
- Some pages use inline `<input>` elements alongside `shared/ui/Input` — this is acceptable and does not require migration (form fields with custom styling for specific contexts)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["3.1"] },
    { "id": 2, "tasks": ["4.1"] }
  ]
}
```
