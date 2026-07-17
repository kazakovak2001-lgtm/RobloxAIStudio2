# Design: UX-3D Duplicate Consolidation Sprint 1

## Current State

### Pages already using AppShell (no action needed):

- DashboardPage.tsx ✅
- ProjectsPage.tsx ✅
- LoginPage.tsx ✅
- PluginManagerPage.tsx ✅
- AnalyticsPage.tsx ✅
- AiStudioPage.tsx ✅

### Pages still using AppLayout (need migration):

- RegisterPage.tsx
- NewProjectPage.tsx
- LandingPage.tsx
- SettingsPage.tsx
- Workspace.tsx (features/workspace/Workspace.tsx)

### Orphan pages (use AppLayout, not routed):

- AiEngineDemoPage.tsx (route /ai-engine actually loads AiStudioPage)
- ProjectDetailPage.tsx (route /projects/:id loads Workspace)

### Legacy layout files to remove:

- src/layouts/AppLayout.tsx
- src/layouts/AppLayout.d.ts.map

## Migration Pattern

Each page migration follows:

1. Replace `import { AppLayout } from "../layouts/AppLayout"` with `import { AppShell } from "../../shared/ui/layout/AppShell"`
2. Replace `<AppLayout>...</AppLayout>` wrapper with `<AppShell>...</AppShell>`
3. Wrap content in `<Workspace>` if the page has standard workspace content (matching the pattern used by already-migrated pages)
4. Validate: typecheck, lint, build

## Orphan Handling

- `AiEngineDemoPage.tsx`: Migrate to AppShell (it's still a valid demo page, just named differently in the router variable)
- `ProjectDetailPage.tsx`: Delete — not routed, replaced by Workspace.tsx

## Routing

App.tsx routing is already correct. No routing changes needed (DC-7 is already satisfied).

## Validation Commands

```bash
npm run typecheck
npm run lint
npm run build
```
