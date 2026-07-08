# Core Engineering Rules

These rules are permanent and apply to every change in this repository without exception.

## Mandatory Standards

1. **Production-ready code only.** Every commit must be deployable. No experimental code on main.
2. **Architecture first.** Understand the existing architecture before making changes. Never bypass layers.
3. **One responsibility per module.** Each file, class, and function does exactly one thing.
4. **No duplicate implementations.** Before creating anything new, verify it does not already exist.
5. **No placeholder code.** Every function must have a complete implementation or must not exist.
6. **No mock implementations as final solutions.** Mocks are only for tests. Production code calls real services.
7. **Fix root cause, not symptoms.** If a bug appears, trace it to the source. Do not patch around it.
8. **Preserve architecture consistency.** Follow existing patterns. Do not introduce alternative approaches.
9. **One task at a time.** Complete the current task before starting the next. No parallel half-implementations.
10. **Minimal safe changes.** Make the smallest change that solves the problem correctly.
11. **Verify before continuing.** After every change: build, typecheck, test, run. Fix failures immediately.

## Layer Integrity

```
Frontend → API Client → REST/Socket → Controllers → Services → Business Logic → Pipeline → Storage
```

- No layer may be bypassed.
- Frontend never calls Services directly.
- Controllers never contain business logic.
- Services never contain UI logic.
- Business logic never depends on transport layer.

## Forbidden Practices

- Committing code that does not compile.
- Leaving TODO as a final implementation.
- Creating alternative implementations alongside existing ones.
- Modifying unrelated files in a focused task.
- Introducing new dependencies without explicit justification.
- Hardcoding secrets or environment-specific values.

## Reference

See also:

- [GOVERNANCE.md](./GOVERNANCE.md) — Mandatory workflow
- [QUALITY_GATE.md](./QUALITY_GATE.md) — Validation requirements
- [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md) — Implementation lifecycle

---

## Frontend Architecture & UI Integration Rules

These rules are binding for all sprints that affect the frontend.

### 1. Preserve Existing Architecture

- Preserve the current project structure.
- Preserve existing page names (`DashboardPage`, `NewProjectPage`, `ProjectsPage`, `SettingsPage`).
- Preserve existing component names.
- Preserve the Workspace (`src/features/workspace/`).
- Preserve the Dashboard (`src/pages/DashboardPage.tsx`).
- Preserve the current routing structure.
- Preserve the existing design system (Tailwind CSS classes, UI primitives in `src/components/ui/`).

### 2. No Duplicate Pages

Never create:

- `WorkspaceV2`
- `DashboardNew`
- `NewWorkspace`
- `AlternativeDashboard`

or any variant unless explicitly requested by a sprint specification.

Always extend existing components first.

### 3. Mandatory Frontend Audit Before Changes

Before any task that touches frontend, analyze:

- `src/pages/` — identify existing pages.
- `src/components/` — identify existing shared components.
- `src/layouts/` — identify existing layout wrappers.
- `src/features/` — identify existing feature modules.
- Router configuration — identify route structure.
- Existing dialogs, panels, modals, tabs within pages.

Determine where new functionality logically belongs before creating anything.

### 4. Backend → Frontend Mapping Rule

Every user-facing backend feature must have a corresponding frontend integration.

If the backend introduces:

- A new service or module,
- A new API endpoint,
- A new workflow or pipeline step,

it must be connected to the existing frontend via API client functions and visible UI.

No backend feature may exist without a corresponding UI path.

### 5. Extend Instead of Creating

Prefer in this order:

1. New panel within existing page.
2. New section within existing panel.
3. New tab within existing component.
4. New dialog or modal triggered from existing UI.
5. New page (only when requirements explicitly demand a standalone view).

### 6. Consistency Preservation

- Do not move existing UI components to different directories.
- Do not rename components.
- Do not restructure the `src/` folder hierarchy.
- Do not alter navigation or routing without explicit justification in the sprint specification.

### 7. Definition of Done (Frontend)

Every completed sprint that adds user-visible functionality must include:

- Backend implementation.
- API client integration (`src/services/`).
- Frontend component integration.
- Connection to existing UI (Workspace, Dashboard, or relevant page).
- Real data from API (no hardcoded mock data in production components).
- Loading states for async operations.
- Error handling and display.
- TypeScript zero errors (`tsc --noEmit`).
- Tests passing (`vitest run`).
- Build succeeding (`vite build`).
