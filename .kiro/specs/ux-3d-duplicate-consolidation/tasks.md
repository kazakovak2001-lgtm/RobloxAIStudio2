# Implementation Plan: UX-3D Duplicate Consolidation Sprint 1

## Overview

Migrate all remaining pages from `AppLayout` to `AppShell`, remove orphan/legacy files, and delete the legacy `AppLayout` component. The application routing and behavior must remain unchanged.

## Tasks

- [x] 1. Migrate RegisterPage to AppShell
  - [x] 1.1 Replace AppLayout with AppShell in RegisterPage.tsx
    - In `src/pages/RegisterPage.tsx`, replace `import { AppLayout } from "../layouts/AppLayout"` with `import { AppShell } from "../../shared/ui/layout/AppShell"`
    - Replace `<AppLayout>` and `</AppLayout>` JSX tags with `<AppShell>` and `</AppShell>`
    - Run `npx tsc --noEmit` to verify TypeScript passes
    - Run `npx eslint src/pages/RegisterPage.tsx` to verify lint passes
    - _Requirements: R1, R2, R3_

- [x] 2. Migrate NewProjectPage to AppShell
  - [x] 2.1 Replace AppLayout with AppShell in NewProjectPage.tsx
    - In `src/pages/NewProjectPage.tsx`, replace `import { AppLayout } from "../layouts/AppLayout"` with `import { AppShell } from "../../shared/ui/layout/AppShell"`
    - Replace `<AppLayout>` and `</AppLayout>` JSX tags with `<AppShell>` and `</AppShell>`
    - Run `npx tsc --noEmit` to verify TypeScript passes
    - Run `npx eslint src/pages/NewProjectPage.tsx` to verify lint passes
    - _Requirements: R1, R2, R3_

- [x] 3. Migrate LandingPage to AppShell
  - [x] 3.1 Replace AppLayout with AppShell in LandingPage.tsx
    - In `src/pages/LandingPage.tsx`, replace `import { AppLayout } from "../layouts/AppLayout"` with `import { AppShell } from "../../shared/ui/layout/AppShell"`
    - Replace `<AppLayout>` and `</AppLayout>` JSX tags with `<AppShell>` and `</AppShell>`
    - Run `npx tsc --noEmit` to verify TypeScript passes
    - Run `npx eslint src/pages/LandingPage.tsx` to verify lint passes
    - _Requirements: R1, R2, R3_

- [x] 4. Migrate SettingsPage to AppShell
  - [x] 4.1 Replace AppLayout with AppShell in SettingsPage.tsx
    - In `src/pages/SettingsPage.tsx`, replace `import { AppLayout } from "../layouts/AppLayout"` with `import { AppShell } from "../../shared/ui/layout/AppShell"`
    - Replace `<AppLayout>` and `</AppLayout>` JSX tags with `<AppShell>` and `</AppShell>`
    - Run `npx tsc --noEmit` to verify TypeScript passes
    - Run `npx eslint src/pages/SettingsPage.tsx` to verify lint passes
    - _Requirements: R1, R2, R3_

- [x] 5. Migrate Workspace to AppShell
  - [x] 5.1 Replace AppLayout with AppShell in Workspace.tsx
    - In `src/features/workspace/Workspace.tsx`, replace `import { AppLayout } from "../../layouts/AppLayout"` with `import { AppShell } from "../../../shared/ui/layout/AppShell"`
    - Replace `<AppLayout>` and `</AppLayout>` JSX tags with `<AppShell>` and `</AppShell>`
    - Run `npx tsc --noEmit` to verify TypeScript passes
    - Run `npx eslint src/features/workspace/Workspace.tsx` to verify lint passes
    - _Requirements: R1, R2, R3_

- [x] 6. Migrate AiEngineDemoPage to AppShell
  - [x] 6.1 Replace AppLayout with AppShell in AiEngineDemoPage.tsx
    - In `src/pages/AiEngineDemoPage.tsx`, replace `import { AppLayout } from "../layouts/AppLayout"` with `import { AppShell } from "../../shared/ui/layout/AppShell"`
    - Replace `<AppLayout>` and `</AppLayout>` JSX tags with `<AppShell>` and `</AppShell>`
    - Run `npx tsc --noEmit` to verify TypeScript passes
    - Run `npx eslint src/pages/AiEngineDemoPage.tsx` to verify lint passes
    - _Requirements: R1, R2, R3_

- [x] 7. Delete orphan ProjectDetailPage
  - [x] 7.1 Remove ProjectDetailPage.tsx and its type map
    - Verify `ProjectDetailPage` is NOT imported in `src/App.tsx` or any routing file (it is not — `/projects/:id` routes to Workspace)
    - Delete `src/pages/ProjectDetailPage.tsx`
    - Delete `src/pages/ProjectDetailPage.d.ts.map`
    - Run `npx tsc --noEmit` to verify no broken imports
    - _Requirements: R4, R3_

- [x] 8. Delete AppLayout and legacy layout files
  - [x] 8.1 Verify no remaining AppLayout consumers and delete legacy layouts
    - Search the entire `src/` directory for any remaining imports of `AppLayout` — there should be none after tasks 1-6
    - Delete `src/layouts/AppLayout.tsx`
    - Delete `src/layouts/AppLayout.d.ts.map`
    - If `src/layouts/` directory is empty after deletion, remove it
    - Run `npx tsc --noEmit` to verify TypeScript passes
    - Run `npm run build` to verify production build passes
    - _Requirements: R5, R3_

- [x] 9. Final validation and documentation
  - [x] 9.1 Run full validation suite and update documentation
    - Run `npm run typecheck` (or `npx tsc --noEmit`) — must pass
    - Run `npm run lint` — must pass
    - Run `npm run build` — must pass
    - Verify all routes load correctly (/, /login, /register, /dashboard, /projects, /projects/:id, /new-project, /settings, /ai-engine, /plugin-manager, /analytics)
    - Generate `docs/DUPLICATE_EXECUTION_RESULTS.md` summarizing: tasks completed, files modified, files deleted, build status
    - Update `docs/MIGRATION_PROGRESS.md` to reflect completion of AppLayout→AppShell migration
    - _Requirements: R3, R6_

## Notes

- DC-1 through DC-6 from DUPLICATE_EXECUTION_REPORT.md are already completed (frontend-new deleted, backup deleted, pages renamed)
- DC-7 (routing) is already correct in App.tsx — no changes needed
- DC-8 (LoginPage) is already migrated to AppShell
- All remaining tasks follow the same simple pattern: swap AppLayout → AppShell import and JSX tags
- The Workspace.tsx file uses a deeper relative path (`../../layouts/AppLayout`) so the AppShell import must use `../../../shared/ui/layout/AppShell`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "4.1", "5.1", "6.1"] },
    { "id": 1, "tasks": ["7.1"] },
    { "id": 2, "tasks": ["8.1"] },
    { "id": 3, "tasks": ["9.1"] }
  ]
}
```
