# Implementation Plan: UX-3D Sprint 3 — Repository Structure Execution

## Overview

Standardize the repository structure by moving `shared/` into `src/shared/`, moving `contexts/` to `providers/`, consolidating `constants/` into `shared/constants/`, organizing styles, and creating the standard `app/` structure. All moves paired with immediate import updates to maintain build stability.

## Tasks

- [ ] 1. Move shared/ to src/shared/ and update all imports
  - [ ] 1.1 Move root shared/ directory into src/shared/ and update every import
    - Move the entire `shared/` directory to `src/shared/` (contracts/, events/, ui/, types.ts)
    - Update ALL imports in `src/App.tsx`: `../shared/` → `./shared/`
    - Update ALL imports in `src/pages/*.tsx`: `../../shared/` → `../shared/`
    - Update ALL imports in `src/services/*.ts`: `../../shared/` → `../shared/`
    - Update ALL imports in `src/features/workspace/Workspace.tsx`: `../../../shared/` → `../../shared/`
    - Update ALL imports in `src/features/workspace/usePipelineStream.ts`: `../../../shared/` → `../../shared/`
    - Update ALL imports in `src/features/workspace/PipelineView.tsx`: `../../../shared/` → `../../shared/`
    - Update ALL imports in `src/features/workspace/components/*.tsx`: `../../../../shared/` → `../../../shared/`
    - Update ALL imports in `src/contexts/ToastProvider.tsx` if it references shared/
    - Run `npx tsc --noEmit` to verify TypeScript passes
    - Run `npx vite build` to verify production build passes
    - _Requirements: R1, R2_

- [ ] 2. Move contexts/ to providers/ and update all imports
  - [ ] 2.1 Move src/contexts/ to src/providers/ and update every import
    - Move `src/contexts/AuthContext.tsx` to `src/providers/AuthContext.tsx`
    - Move `src/contexts/ToastProvider.tsx` to `src/providers/ToastProvider.tsx`
    - Delete empty `src/contexts/` directory
    - Update import in `src/main.tsx`: `./contexts/AuthContext` → `./providers/AuthContext`
    - Update import in `src/main.tsx`: `./contexts/ToastProvider` → `./providers/ToastProvider`
    - Update import in all pages that import `useAuth` from `../contexts/AuthContext` → `../providers/AuthContext`
    - Search for any other imports from `contexts/` and update them
    - Run `npx tsc --noEmit` to verify TypeScript passes
    - Run `npx vite build` to verify production build passes
    - _Requirements: R1, R2_

- [ ] 3. Move constants/ to shared/constants/ and update all imports
  - [ ] 3.1 Move src/constants/ to src/shared/constants/ and update every import
    - Move `src/constants/index.ts` to `src/shared/constants/index.ts`
    - Move `src/constants/index.d.ts.map` to `src/shared/constants/index.d.ts.map` (or delete if not needed)
    - Delete empty `src/constants/` directory
    - Update import in `src/pages/LandingPage.tsx`: `../constants` → `../shared/constants`
    - Search for any other imports from `constants/` and update them
    - Run `npx tsc --noEmit` to verify TypeScript passes
    - Run `npx vite build` to verify production build passes
    - _Requirements: R1, R2_

- [ ] 4. Move styles.css to styles/ and update import
  - [ ] 4.1 Move src/styles.css to src/styles/index.css and update main.tsx
    - Create `src/styles/` directory
    - Move `src/styles.css` to `src/styles/index.css`
    - Update import in `src/main.tsx`: `./styles.css` → `./styles/index.css`
    - Run `npx tsc --noEmit` to verify TypeScript passes
    - Run `npx vite build` to verify production build passes
    - _Requirements: R1, R2_

- [ ] 5. Create app/ structure with router extraction
  - [ ] 5.1 Create src/app/ directories and extract router config
    - Create directories: `src/app/`, `src/app/config/`, `src/app/providers/`, `src/app/router/`
    - Create `src/app/router/index.tsx` that exports the Routes configuration (extracted from App.tsx)
    - Create `src/app/providers/index.tsx` that wraps BrowserRouter + AuthProvider + ToastProvider (extracted from main.tsx)
    - Update `src/App.tsx` to import routes from `./app/router`
    - Update `src/main.tsx` to import providers from `./app/providers`
    - Run `npx tsc --noEmit` to verify TypeScript passes
    - Run `npx vite build` to verify production build passes
    - _Requirements: R1, R2_

- [ ] 6. Reorganize features/workspace/ internal structure
  - [ ] 6.1 Create workspace subdirectories and move hook/type files
    - Create `src/features/workspace/hooks/` directory
    - Move `src/features/workspace/usePipelineStream.ts` to `src/features/workspace/hooks/usePipelineStream.ts`
    - Create `src/features/workspace/hooks/index.ts` that re-exports usePipelineStream
    - Create `src/features/workspace/types/` directory
    - Move `src/features/workspace/workspace.types.ts` to `src/features/workspace/types/index.ts`
    - Create `src/features/workspace/index.ts` barrel export
    - Update import in `src/features/workspace/Workspace.tsx`: `./usePipelineStream` → `./hooks/usePipelineStream`
    - Update any imports of `../workspace.types` to `../types`
    - Run `npx tsc --noEmit` to verify TypeScript passes
    - Run `npx vite build` to verify production build passes
    - _Requirements: R1, R2_

- [ ] 7. Final validation and documentation
  - [ ] 7.1 Run full validation suite and generate deliverables
    - Run `npx tsc --noEmit` — must pass
    - Run `npx vite build` — must pass
    - Verify all routes still work by checking App.tsx routing configuration
    - Verify directory structure matches the approved architecture
    - Generate `docs/STRUCTURE_EXECUTION_RESULTS.md` summarizing all moves, import updates, and validation results
    - Update `docs/MIGRATION_PROGRESS.md`: mark UX-3C.3 as COMPLETE, update percentages, add activity entry
    - _Requirements: R2, R3_

## Notes

- RS-2 and RS-3 from the execution report are combined into Task 1 (move + update atomically)
- RS-4 and RS-5 are combined into Task 2 (move contexts + update atomically)
- RS-6 and RS-7 are combined into Task 3 (move constants + update atomically)
- RS-8 and RS-9 are combined into Task 4 (move styles + update atomically)
- RS-1 is absorbed into Tasks 4 and 5 (directories created as needed)
- RS-10 is Task 6, RS-11 is Task 5, RS-12 is Task 7
- Pairing moves with import updates prevents intermediate broken states
- `src/entities/` is NOT created (empty placeholder adds no value now)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1"] },
    { "id": 2, "tasks": ["5.1", "6.1"] },
    { "id": 3, "tasks": ["7.1"] }
  ]
}
```
