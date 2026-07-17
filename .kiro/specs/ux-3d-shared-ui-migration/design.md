# Design: UX-3D Sprint 2 — shared/ui Migration

## Approach

This sprint performs dead code removal only. All pages already use `shared/ui/` components. The remaining work is deleting orphaned legacy files and validating.

## Files to Delete

### src/components/ui/ (entire directory)

- Avatar.tsx
- Badge.tsx
- Breadcrumb.tsx
- Button.d.ts, Button.d.ts.map, Button.js.map, Button.tsx
- Card.d.ts, Card.d.ts.map, Card.js.map, Card.tsx
- Dialog.tsx
- Dropdown.tsx
- Input.tsx
- Loader.tsx
- Modal.tsx
- Pagination.tsx
- Table.tsx
- Tabs.tsx
- Toast.tsx
- Tooltip.tsx

**Justification**: Zero imports from any active source file. All functionality replaced by `shared/ui/` equivalents.

### src/components/layout/ (entire directory)

- Navbar.tsx, Navbar.d.ts, Navbar.d.ts.map, Navbar.js.map
- Sidebar.tsx

**Justification**: Zero imports from any active source file. `shared/ui/layout/Sidebar.tsx` and `shared/ui/layout/TopBar.tsx` are the canonical implementations used by AppShell.

## Files to Preserve

- `src/components/ErrorBoundary.tsx` — actively imported by `src/features/workspace/Workspace.tsx`

## Validation Strategy

After each deletion wave:

1. `npx tsc --noEmit` — must pass
2. `npx vite build` — must pass
3. Verify no broken imports via TypeScript

## Risk Assessment

- **Risk**: LOW — all targets have zero active imports
- **Rollback**: Git revert if any validation fails
