# Workspace Integration Guide

## Overview

The workspace supports two experience modes:

- **Legacy** (default): The original 3-column grid with all 29 panels
- **Mission Control**: The new 5-zone layout with progressive disclosure

## Activation

### Enable Mission Control (per-user)

**Browser Console:**

```javascript
localStorage.setItem(
  "roblox-ai-studio:workspace-experience",
  "mission-control",
);
location.reload();
```

**Programmatic:**

```typescript
import { setWorkspaceExperience } from "@/features/workspace";
setWorkspaceExperience("mission-control");
// Reload page to apply
window.location.reload();
```

### Rollback to Legacy

**Browser Console:**

```javascript
localStorage.setItem("roblox-ai-studio:workspace-experience", "legacy");
location.reload();
```

**Or simply clear the flag:**

```javascript
localStorage.removeItem("roblox-ai-studio:workspace-experience");
location.reload();
```

## Architecture

```
Router (/projects/:id)
  └── WorkspaceEntry (feature flag check)
        ├── if "legacy" → LegacyWorkspace (Workspace.tsx, unchanged)
        └── if "mission-control" → WorkspaceProvider
                                      └── MissionControlPage
                                            ├── usePipelineStream (existing)
                                            └── MissionControlShell
                                                  ├── CommandBar (TopBar + PhaseSelector)
                                                  ├── ExplorerZone (ProjectExplorer)
                                                  ├── CanvasZone (mode switching)
                                                  ├── PropertiesZone (context-aware)
                                                  └── AICommandZone (persistent bottom)
```

## Affected Routes

| Route            | Impact                                                            |
| ---------------- | ----------------------------------------------------------------- |
| `/projects/:id`  | Entry point now goes through WorkspaceEntry (transparent wrapper) |
| All other routes | Zero impact — untouched                                           |

## What Changes

| Aspect           | Legacy                             | Mission Control                                 |
| ---------------- | ---------------------------------- | ----------------------------------------------- |
| Entry point      | `Workspace.tsx` (direct)           | `WorkspaceEntry.tsx` → `MissionControlPage.tsx` |
| State management | Local useState + usePipelineStream | WorkspaceProvider context + usePipelineStream   |
| Layout           | 3-column grid                      | 5-zone CSS Grid                                 |
| Panel rendering  | All 29 unconditionally             | Progressive disclosure (future)                 |
| Socket.IO        | usePipelineStream (unchanged)      | usePipelineStream (unchanged)                   |
| API calls        | Same service modules               | Same service modules                            |

## Future Migration Order

1. ✅ Phase 1: Core Architecture (WorkspaceProvider, Panel Registry, Preferences)
2. ✅ Phase 2: Layout Shell (5-zone grid, zone components, mode switching)
3. ✅ Phase 2.5: Integration Layer (feature flags, safe switch, documentation)
4. Phase 3: Panel Migration — move panels into zone containers
5. Phase 4: Progressive Disclosure — conditional rendering via visibility matrix
6. Phase 5: Context Awareness — properties panel reacts to selection
7. Phase 6: Responsive Polish — tablet/mobile optimization
8. Phase 7: Legacy Removal — remove feature flag, make Mission Control default

## Rollback Procedure

If Mission Control causes issues:

1. **Immediate (per-user):** Clear localStorage flag
2. **Global rollback:** In `src/app/router/index.tsx`, change import back:
   ```typescript
   const WorkspacePage = lazy(() => import("@/features/workspace/Workspace"));
   ```
3. **Full revert:** `git checkout -- src/app/router/index.tsx src/features/workspace/index.ts src/features/workspace/WorkspaceEntry.tsx`

## Safety Guarantees

- Legacy workspace code is never modified
- WorkspaceProvider only instantiates when Mission Control is active
- Socket.IO connection shared (usePipelineStream is the same hook)
- No additional API endpoints required
- No state duplication (Mission Control uses its own clean state layer)
- Feature flag checked once on mount (no runtime flicker)
