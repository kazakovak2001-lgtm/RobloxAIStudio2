# Routes and Navigation Audit

> **Source of truth:** Codebase inspection of `src/app/router/index.tsx`, `src/shared/ui/layout/Sidebar.tsx`, `src/shared/ui/layout/AppShell.tsx`, and related hooks.
>
> **Requirements covered:** 1.2, 1.3, 1.4

---

## 1. Application Routes (12 total)

All routes are defined in `src/app/router/index.tsx` using React Router v6 (`<Routes>` / `<Route>`) with lazy-loaded page components wrapped in `<Suspense>`.

### 1.1 Public Routes (PublicLayout)

| #   | Path        | Page Component | Layout       | Auth Guard | Notes                  |
| --- | ----------- | -------------- | ------------ | ---------- | ---------------------- |
| 1   | `/`         | `LandingPage`  | PublicLayout | None       | Landing/marketing page |
| 2   | `/login`    | `LoginPage`    | PublicLayout | None       | Authentication         |
| 3   | `/register` | `RegisterPage` | PublicLayout | None       | Registration           |

### 1.2 Authenticated Routes (AppLayout)

| #   | Path              | Page Component      | Layout    | Auth Guard      | Notes                                                |
| --- | ----------------- | ------------------- | --------- | --------------- | ---------------------------------------------------- |
| 4   | `/dashboard`      | `DashboardPage`     | AppLayout | None (implicit) | Main dashboard                                       |
| 5   | `/new-project`    | `NewProjectPage`    | AppLayout | None (implicit) | Project creation flow                                |
| 6   | `/projects`       | `ProjectsPage`      | AppLayout | None (implicit) | Project listing                                      |
| 7   | `/projects/:id`   | `WorkspacePage`     | AppLayout | None (implicit) | **Workspace** — 29 panel components in 3-column grid |
| 8   | `/settings`       | `SettingsPage`      | AppLayout | None (implicit) | User/app settings                                    |
| 9   | `/ai-studio`      | `AiStudioPage`      | AppLayout | None (implicit) | AI configuration                                     |
| 10  | `/plugin-manager` | `PluginManagerPage` | AppLayout | None (implicit) | Plugin management                                    |
| 11  | `/analytics`      | `AnalyticsPage`     | AppLayout | None (implicit) | Global analytics                                     |
| 12  | `/knowledge`      | `KnowledgePage`     | AppLayout | None (implicit) | Knowledge base                                       |

### 1.3 Catch-All

| Path | Behavior                                                           |
| ---- | ------------------------------------------------------------------ |
| `*`  | `<Navigate to="/" replace />` — redirects unknown paths to landing |

### 1.4 Route Architecture Notes

- **No explicit auth guards** — all AppLayout routes are accessible without runtime authentication checks in the router. Auth enforcement (if any) would be at the API/service layer.
- **Lazy loading** — every page uses `React.lazy()` + `<Suspense>` with a shared `<Loader>` fallback.
- **Layout wrappers** use `<Outlet />` from React Router to render child routes.

---

## 2. Sidebar Navigation Entries (7 items)

Defined as `defaultNavigationItems` in `src/shared/ui/layout/Sidebar.tsx`.

| #   | ID               | Label          | Icon (lucide-react)                  | href              | Conditional Visibility | Badge |
| --- | ---------------- | -------------- | ------------------------------------ | ----------------- | ---------------------- | ----- |
| 1   | `dashboard`      | Dashboard      | `LayoutDashboard` (h-5 w-5)          | `/dashboard`      | None — always visible  | None  |
| 2   | `ai-studio`      | AI Studio      | `Bot` (aliased as `AIIcon`, h-5 w-5) | `/ai-studio`      | None — always visible  | None  |
| 3   | `projects`       | Projects       | `FolderKanban` (h-5 w-5)             | `/projects`       | None — always visible  | None  |
| 4   | `plugin-manager` | Plugin Manager | `Puzzle` (h-5 w-5)                   | `/plugin-manager` | None — always visible  | None  |
| 5   | `analytics`      | Analytics      | `BarChart3` (h-5 w-5)                | `/analytics`      | None — always visible  | None  |
| 6   | `knowledge`      | Knowledge Base | `BookOpen` (h-5 w-5)                 | `/knowledge`      | None — always visible  | None  |
| 7   | `settings`       | Settings       | `Settings` (h-5 w-5)                 | `/settings`       | None — always visible  | None  |

### 2.1 Navigation Item Interface

```typescript
interface NavigationItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: string; // Optional badge text (e.g., notification count)
  disabled?: boolean; // Grays out item with cursor-not-allowed
  href: string;
}
```

### 2.2 Active State Logic

Active state is determined by comparing `location.pathname` against the item's `href`:

- Exact match: `pathname === item.href`
- Prefix match: `pathname.startsWith(item.href + "/")`

This means `/projects/:id` (Workspace) will highlight the "Projects" nav item.

### 2.3 Navigation Items Override

The `Sidebar` component accepts an optional `navigationItems` prop, allowing pages to override the default 7 items. Currently no page uses this override.

---

## 3. AppShell Composition

Defined in `src/shared/ui/layout/AppShell.tsx`.

### 3.1 Component Hierarchy

```
AppShell (div.flex.h-screen.w-screen)
├── Sidebar (aside) — conditionally rendered via `hideSidebar` prop
└── Main Column (div.flex.flex-1.flex-col)
    ├── TopBar (header.h-14) — conditionally rendered via `hideTopBar` prop
    ├── Main Content (main.flex-1.overflow-y-auto) — <Outlet /> / children
    └── StatusBar (footer.h-8) — conditionally rendered via `hideStatusBar` prop
```

### 3.2 Layout Configuration by Route Type

| Layout         | Sidebar                   | TopBar     | StatusBar                   | Used By                             |
| -------------- | ------------------------- | ---------- | --------------------------- | ----------------------------------- |
| `AppLayout`    | ✅ Visible                | ✅ Visible | ✅ Visible                  | All authenticated routes (9 routes) |
| `PublicLayout` | ❌ Hidden (`hideSidebar`) | ✅ Visible | ❌ Hidden (`hideStatusBar`) | Landing, Login, Register (3 routes) |

### 3.3 AppShell Props Interface

```typescript
interface AppShellProps {
  children: ReactNode;
  hideSidebar?: boolean; // default: false
  hideTopBar?: boolean; // default: false
  hideStatusBar?: boolean; // default: false
}
```

### 3.4 CSS Architecture

- **Root container:** `flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100`
- **Sidebar:** Takes its natural width (controlled by SidebarProvider context). Uses `shrink-0` to prevent flex compression.
- **Main column:** `flex-1 flex-col min-w-0 overflow-hidden` — fills remaining horizontal space.
- **Content area:** `flex-1 overflow-y-auto overflow-x-hidden` — vertical scroll for page content.

---

## 4. Responsive Behavior

### 4.1 Breakpoint Definitions

Defined in `src/shared/hooks/useBreakpoint.ts`:

| Breakpoint | Width Range    | Constant            |
| ---------- | -------------- | ------------------- |
| `mobile`   | < 768px        | `MOBILE_MAX = 768`  |
| `tablet`   | 768px – 1023px | `TABLET_MAX = 1024` |
| `desktop`  | ≥ 1024px       | —                   |

### 4.2 Sidebar Modes

Managed by `SidebarProvider` in `src/shared/hooks/useSidebar.tsx`:

| Breakpoint | Sidebar Mode          | Width                    | Behavior                                                 |
| ---------- | --------------------- | ------------------------ | -------------------------------------------------------- |
| `desktop`  | `expanded` (default)  | 260px (`EXPANDED_WIDTH`) | Full sidebar with labels, toggle to collapse             |
| `desktop`  | `collapsed` (toggled) | 72px (`COLLAPSED_WIDTH`) | Icon-only rail, toggle to expand                         |
| `tablet`   | `overlay`             | 72px inline              | Always shows icon-only rail; tap opens overlay           |
| `mobile`   | `hidden`              | 0px (no inline)          | Sidebar hidden; hamburger in TopBar opens overlay drawer |

### 4.3 Sidebar State Machine

```
Desktop:
  expanded ←→ collapsed (via toggle button)

Tablet:
  overlay mode (72px rail always visible)
  toggle opens full-width overlay drawer (260px, with backdrop)

Mobile:
  hidden (0px inline, no sidebar)
  hamburger menu opens full-width overlay drawer (260px, with backdrop + close button)
```

### 4.4 Mobile Overlay Behavior

- **Backdrop:** `fixed inset-0 z-40 bg-black/60 backdrop-blur-sm` — click to close
- **Sidebar overlay:** `fixed inset-y-0 left-0 z-50 shadow-2xl` — 260px wide
- **Close on navigation:** Sidebar closes automatically on mobile after item click
- **Close on breakpoint change:** Overlay closes when breakpoint becomes `desktop`

### 4.5 TopBar Responsive Behavior

| Element              | Desktop | Tablet  | Mobile                    |
| -------------------- | ------- | ------- | ------------------------- |
| Hamburger menu       | Hidden  | Hidden  | Visible (toggles sidebar) |
| Breadcrumbs          | Visible | Visible | Visible                   |
| Active Project pill  | Visible | Visible | Hidden (`hidden md:flex`) |
| AI Status indicator  | Visible | Visible | Hidden (`hidden md:flex`) |
| Roblox Connection    | Visible | Visible | Hidden (`hidden md:flex`) |
| Search button        | Visible | Visible | Visible                   |
| Notifications button | Visible | Visible | Visible                   |
| User menu            | Visible | Visible | Visible                   |

### 4.6 StatusBar

- Fixed height: 32px (`h-8`)
- Displays: Backend status, Plugin status, Sync status (left) | Git branch (center) | Cursor position, encoding, language (right)
- No responsive adaptations — all content shown at all sizes

---

## 5. TopBar Component Details

Defined in `src/shared/ui/layout/TopBar.tsx`.

### 5.1 TopBar Interface

```typescript
interface TopBarProps {
  breadcrumbs?: BreadcrumbItem[]; // Auto-generated from pathname if not provided
  actions?: React.ReactNode; // Custom action slot
  activeProject?: string; // Defaults to "No Active Project"
  aiStatus?: "online" | "offline" | "loading";
  robloxConnectionStatus?: "connected" | "disconnected" | "connecting";
  onUserMenuClick?: () => void;
}
```

### 5.2 TopBar Layout

- **Height:** 56px (`h-14`), sticky top, z-30
- **Background:** `bg-slate-900/80 backdrop-blur-xl`
- **Sections:** Left (hamburger + breadcrumbs) | Center (active project) | Right (status indicators + actions)

---

## 6. Existing Components Mapping to Mission Control

### 6.1 Components That Already Exist

| Mission Control Zone           | Existing Component                                        | Location                                     | Status                                                                                                                |
| ------------------------------ | --------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Command Bar                    | `TopBar`                                                  | `src/shared/ui/layout/TopBar.tsx`            | ✅ Exists — has breadcrumbs, AI status, Roblox connection, notifications, user menu. Missing: workflow phase selector |
| Project Explorer               | `ProjectExplorer`                                         | `src/shared/ui/projects/ProjectExplorer.tsx` | ✅ Exists — has TreeView, search, filter. Currently used on Projects page, not in workspace                           |
| Center Canvas                  | None (flat grid)                                          | `src/features/workspace/Workspace.tsx`       | ❌ No mode-based canvas. All 29 panels render simultaneously in 3-column grid                                         |
| Properties Panel               | None                                                      | —                                            | ❌ No context-sensitive properties panel exists                                                                       |
| AI Command Center              | Partial (`LiveConsole`, `GenerateButton`, `ActivityFeed`) | `src/features/workspace/components/`         | ⚠️ Components exist but are scattered across the 3 columns, not unified in a bottom zone                              |
| Workspace Layout (with panels) | `Workspace` component                                     | `src/shared/ui/layout/Workspace.tsx`         | ⚠️ Exists with left/right/bottom panel support and tabs, but NOT used by `WorkspacePage`                              |

### 6.2 Key Gap Analysis

| Mission Control Feature               | Current State                                  |
| ------------------------------------- | ---------------------------------------------- |
| Workflow Phase Selector               | ❌ Does not exist                              |
| Canvas Mode Switching                 | ❌ Does not exist                              |
| Progressive Disclosure                | ❌ All 29 panels always rendered               |
| Zone-based Layout (CSS Grid zones)    | ❌ Uses simple 3-column grid                   |
| Panel Visibility Matrix               | ❌ No visibility logic                         |
| Resizable zones                       | ❌ No resize handles                           |
| Persistent AI Command Center (bottom) | ❌ LiveConsole/GenerateButton in column layout |
| Context-aware Properties Panel        | ❌ No properties panel                         |

### 6.3 Reusable Foundation

The following existing infrastructure can be leveraged for Mission Control:

1. **`Workspace` component** (`src/shared/ui/layout/Workspace.tsx`) — Already supports left/right/bottom panels with configurable sizes and a tab bar. Could serve as the base for the zone layout.
2. **`SidebarProvider` / `useSidebar`** — Proven responsive pattern with breakpoints and collapse states. Same pattern can be applied to Explorer and Properties zones.
3. **`TopBar`** — Already positioned and styled correctly. Needs phase selector addition.
4. **`ProjectExplorer`** — TreeView-based file browser ready for the Explorer zone.
5. **`ErrorBoundary`** — Already wraps the workspace grid; can be applied per-zone.

---

## 7. Workspace Page Current Layout

The `WorkspacePage` at `/projects/:id` renders in a `xl:grid-cols-[1fr_1.15fr_0.95fr]` CSS Grid:

### Column 1 (1fr) — 8 panels:

1. GenerateButton
2. GenerationStatusPanel
3. PipelineStatusBar
4. PipelineStatusViewer
5. AgentBoard
6. CostMonitor
7. TokenUsage
8. MetricsPanel

### Column 2 (1.15fr) — 8 panels:

9. PipelineView
10. LiveConsole
11. GameArchitectPanel
12. SimulationPanel
13. EconomyPanel
14. AutonomousPipelinePanel
15. ArtifactExplorer
16. ExportPreview

### Column 3 (0.95fr) — 9 panels:

17. ReviewSummaryPanel
18. ActivityFeed
19. AuditLogViewer
20. ValidationResults
21. PlaytestPanel
22. GenerationHistoryPanel
23. StudioBridgePanel
24. ProtocolMonitor
25. ProjectSummary

**Total: 25 rendered panel components** (the design spec mentions 29; 4 additional — ProgressTimeline, PublishWorkflow, StudioConnectionStatus, SyncButton, AgentCard — are defined in the visibility matrix but not yet imported/rendered in the current WorkspacePage).

---

## 8. File Reference Index

| File                                         | Purpose                                                 |
| -------------------------------------------- | ------------------------------------------------------- |
| `src/app/router/index.tsx`                   | All 12 routes + layout assignments                      |
| `src/shared/ui/layout/AppShell.tsx`          | Shell composition (Sidebar + TopBar + Main + StatusBar) |
| `src/shared/ui/layout/AppLayout.tsx`         | AppLayout + PublicLayout route wrappers                 |
| `src/shared/ui/layout/Sidebar.tsx`           | 7 navigation items + responsive sidebar                 |
| `src/shared/ui/layout/TopBar.tsx`            | Top bar with breadcrumbs + status indicators            |
| `src/shared/ui/layout/StatusBar.tsx`         | Bottom status bar (backend/plugin/sync status)          |
| `src/shared/ui/layout/Workspace.tsx`         | Reusable workspace layout with tab bar + panels         |
| `src/shared/hooks/useSidebar.tsx`            | Sidebar state management + responsive modes             |
| `src/shared/hooks/useBreakpoint.ts`          | Breakpoint detection (mobile/tablet/desktop)            |
| `src/features/workspace/Workspace.tsx`       | Current WorkspacePage with 3-column grid                |
| `src/shared/ui/projects/ProjectExplorer.tsx` | Existing project tree explorer component                |
