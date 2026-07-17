# Visual Fragmentation Analysis

> **Source:** `src/features/workspace/Workspace.tsx` and 29 components in `src/features/workspace/components/`
> **Validates:** Requirement 1.6 — Identify visual fragmentation issues including panels lacking workflow context, components competing for attention, and information overload in the 3-column layout.

---

## Executive Summary

The current WorkspacePage renders **all 29 panel components simultaneously** inside a single 3-column CSS Grid with zero workflow awareness, no progressive disclosure, and no conditional visibility logic. Every panel mounts and stays mounted regardless of pipeline state (idle, running, completed, failed). This creates severe visual fragmentation where generation controls sit next to analytics next to playtest panels, forcing users to mentally filter irrelevant information at every stage of the workflow.

---

## 1. Layout Structure — Actual Code Evidence

### Grid Definition

```tsx
// src/features/workspace/Workspace.tsx, line ~115
<div className="grid gap-4 xl:grid-cols-[1fr_1.15fr_0.95fr]">
```

- **Below `xl` (1280px):** Single-column vertical stack of all 29 panels
- **At `xl` and above:** 3-column grid with fixed fractional ratios
- **No responsive intermediate:** No tablet-optimized 2-column layout exists
- **No max-height containment:** Each column uses `space-y-4` with unbounded vertical scrolling

### Column Assignments (Hardcoded)

| Column | Width Ratio | Panel Count | Panels                                                                                                                                                             |
| ------ | ----------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1      | `1fr`       | 8           | GenerateButton, GenerationStatusPanel, PipelineStatusBar, PipelineStatusViewer, AgentBoard, CostMonitor, TokenUsage, MetricsPanel                                  |
| 2      | `1.15fr`    | 8           | PipelineView (contains ProgressTimeline), LiveConsole, GameArchitectPanel, SimulationPanel, EconomyPanel, AutonomousPipelinePanel, ArtifactExplorer, ExportPreview |
| 3      | `0.95fr`    | 9           | ReviewSummaryPanel, ActivityFeed, AuditLogViewer, ValidationResults, PlaytestPanel, GenerationHistoryPanel, StudioBridgePanel, ProtocolMonitor, ProjectSummary     |

**Total rendered components:** 25 direct + PipelineView (which renders ProgressTimeline internally) + AgentCard (rendered per-agent inside AgentBoard) + StudioConnectionStatus (referenced but embedded in StudioBridgePanel) + SyncButton (embedded) = **29 unique panel components** all mounted unconditionally.

---

## 2. No Workflow Awareness — Zero Conditional Rendering

### Evidence from Workspace.tsx

The component's render path has exactly **one conditional branch**: a loading state that shows a Loader for 250ms. After that timer expires, all 29 panels render unconditionally:

```tsx
{
  isLoading ? (
    <Loader label="Preparing workspace" size="lg" />
  ) : (
    <ErrorBoundary>
      <div className="grid gap-4 xl:grid-cols-[1fr_1.15fr_0.95fr]">
        {/* ALL 29 panels render here — no conditions */}
      </div>
    </ErrorBoundary>
  );
}
```

**Findings:**

- ❌ No `if (status === 'running')` guards on any panel
- ❌ No `currentPhase` or workflow stage variable exists in state
- ❌ No visibility matrix or show/hide logic
- ❌ No `React.lazy` per-panel or `Suspense` boundaries within the grid
- ❌ No `display: none` or `hidden` class toggles on panels
- The only panel with internal null-return logic is `MetricsPanel` (returns `null` when `pipelineId` is null) and `GenerationStatusPanel` (returns `null` when no pipelineId AND no status). All other panels render their full DOM tree regardless of pipeline state.

### Panels That Render "Empty" Shells When Idle

These panels render their card frame, headers, and placeholder text even when they have no data:

| Panel                   | Idle Behavior                                                      |
| ----------------------- | ------------------------------------------------------------------ |
| AgentBoard              | Renders card + "Start a pipeline to populate the live agent board" |
| LiveConsole             | Renders full search/filter UI + 3 default log lines                |
| CostMonitor             | Shows "$0.0000" for both spent and remaining                       |
| TokenUsage              | Shows 0/0/0 for prompt/completion/total                            |
| ActivityFeed            | Renders card + "No activity yet."                                  |
| EconomyPanel            | Renders full card + "Analyze in-game economy..." placeholder       |
| SimulationPanel         | Renders full card + "Run a simulation..." placeholder              |
| PlaytestPanel           | Renders full card + "Validate generated code..." placeholder       |
| AutonomousPipelinePanel | Renders prompt textarea + "Start Autonomous Run" button            |
| PipelineStatusBar       | Renders status bar with "idle" badge                               |
| PipelineView            | Renders card + "Pipeline overview" header + idle badge             |
| ProgressTimeline        | Renders empty timeline container                                   |

**Impact:** 12 panels display "nothing useful" in idle state but still consume viewport space, contribute to DOM node count, and compete for visual attention.

---

## 3. Components Competing for Attention

### Problem: Multiple Real-Time Data Consumers on Simultaneous Display

The workspace instantiates the `usePipelineStream` hook at the page level, then distributes its data to multiple panels that all display overlapping or identical information simultaneously:

| Data Source             | Consuming Panels (all visible at once)                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `state.agents`          | AgentBoard, ProjectSummary (agent count), CostMonitor (aggregated cost), TokenUsage (aggregated tokens) |
| `state.logs`            | LiveConsole                                                                                             |
| `events` (SSE messages) | ActivityFeed                                                                                            |
| `status`                | PipelineView, PipelineStatusBar, StudioBridgePanel, the header badge                                    |
| `state` (full pipeline) | PipelineView, PipelineStatusViewer, PipelineStatusBar, ProgressTimeline                                 |

**Specific attention conflicts:**

1. **Cost displayed in 4 places simultaneously:**
   - CostMonitor panel (Column 1) — shows `$X.XXXX` spent + estimated remaining
   - MetricsPanel (Column 1) — shows "AI Cost: $X.XXXX"
   - AutonomousPipelinePanel (Column 2) — shows "Cost: $X.XXXX" inline
   - ProjectSummary (Column 3) — shows cost in summary stats

2. **Token counts displayed in 3 places simultaneously:**
   - TokenUsage panel (Column 1) — shows prompt/completion/total breakdown
   - MetricsPanel (Column 1) — shows total token count
   - AutonomousPipelinePanel (Column 2) — shows in session metadata

3. **Pipeline status displayed in 5 places simultaneously:**
   - Header badge (top of page) — shows `idle`/`running`/`completed`/`failed`
   - PipelineStatusBar (Column 1) — full status bar
   - PipelineView (Column 2) — card with status badge
   - PipelineStatusViewer (Column 1) — detailed status view
   - AutonomousPipelinePanel (Column 2) — internal status tracking

4. **Agent progress visible in 3 competing views:**
   - AgentBoard (Column 1) — shows agent cards with progress rings
   - GenerationStatusPanel (Column 1) — shows stage timeline with progress
   - AutonomousPipelinePanel (Column 2) — shows phase timeline

### Problem: No Visual Hierarchy Among Panels

All panels use the same `<Card>` wrapper component with identical styling:

- Same border treatment (`border-white/10`)
- Same background (`bg-slate-900/60` or card default)
- Same spacing (`space-y-4` between panels)
- Same rounded corners (from Card component)

**Result:** Every panel has equal visual weight. The most critical panel during generation (AgentBoard showing live AI execution) is a small card in Column 1 competing with 7 other cards of identical styling. There is no elevation, size differentiation, or prominence cue.

---

## 4. Information Overload — The 29-Panel Simultaneous Display

### Scroll Depth Analysis

At a standard 1080p viewport (1920×1080) with the AppLayout sidebar consuming ~240px and top padding:

- **Available viewport height:** ~900px (after header and padding)
- **Column 1 content height (estimated):** 8 panels × ~200px average = ~1,600px → requires 1.8× scroll
- **Column 2 content height (estimated):** 8 panels × ~250px average = ~2,000px → requires 2.2× scroll
- **Column 3 content height (estimated):** 9 panels × ~180px average = ~1,620px → requires 1.8× scroll

**Users must scroll 2× the viewport height to see all panels in any column.** Critical panels like StudioBridgePanel and ProjectSummary are buried at the bottom of Column 3 — invisible without scrolling.

### DOM Node Overhead

Each panel renders substantial DOM trees even when idle:

- GenerationStatusPanel: ~50+ nodes (stage list, progress bar, control buttons)
- LiveConsole: ~30+ nodes (search input, filter dropdown, 300-line container)
- AutonomousPipelinePanel: ~40+ nodes (textarea, buttons, phase timeline)
- StudioBridgePanel: ~60+ nodes (connection status, workflow stages, sync button)
- ProtocolMonitor: ~40+ nodes (stats grid, log entries, sync status)

**Conservative estimate:** 29 panels × 35 average nodes = **~1,000+ DOM nodes** rendered simultaneously in the workspace grid alone, before any actual data populates them.

---

## 5. Panels Lacking Workflow Context

### Panels With No Relevance During Certain Pipeline States

| Panel              | Relevant When                                | Rendered When | Wasted Screen Space                                                    |
| ------------------ | -------------------------------------------- | ------------- | ---------------------------------------------------------------------- |
| EconomyPanel       | After generation (economy analysis phase)    | Always        | Idle placeholder during Generate/Planning/Generation                   |
| SimulationPanel    | After generation (simulation phase)          | Always        | Idle placeholder during all pre-generation phases                      |
| PlaytestPanel      | After code generation (validation phase)     | Always        | Idle placeholder during Generate/Planning/Generation                   |
| StudioBridgePanel  | After generation + validation (export phase) | Always        | Full UI with disabled buttons during all pre-completion phases         |
| ProtocolMonitor    | Only when Studio is connected                | Always        | "Connect to Studio to see protocol activity" message when disconnected |
| ExportPreview      | After generation has artifacts               | Always        | Empty state when no artifacts exist                                    |
| ReviewSummaryPanel | After generation completes                   | Always        | Loading/empty state before any pipeline runs                           |
| AuditLogViewer     | After pipeline has run                       | Always        | Empty when no pipelineId                                               |

**8 out of 29 panels** (28%) are irrelevant during the most common user state (pre-generation/idle) but still render and occupy viewport space.

### Panels With Partial Self-Hiding

Only **2 panels** implement any form of conditional null-return:

1. `MetricsPanel` — returns `null` when `pipelineId` is null
2. `GenerationStatusPanel` — returns `null` when both `pipelineId` is null AND no stored status

All other 27 panels render their full card frame unconditionally.

---

## 6. Competing Real-Time Update Streams

### Active Polling Intervals (All Running Simultaneously)

| Component                   | Polling Target                         | Interval       | Condition                  |
| --------------------------- | -------------------------------------- | -------------- | -------------------------- |
| GenerationStatusPanel       | `getExperienceStatus()`                | 3,000ms        | When `pipelineId` is set   |
| MetricsPanel                | `getPipelineMetrics()`                 | 4,000ms        | When `pipelineId` is set   |
| StudioBridgePanel           | `getStudioStatus()`                    | 10,000ms       | Always (unconditional)     |
| ProtocolMonitor             | `getProtocolLog()` + `getSyncStatus()` | 5,000ms        | When `isConnected` is true |
| AutonomousPipelinePanel     | `getAutonomousStatus()`                | 2,000–10,000ms | When session is running    |
| StudioBridgePanel heartbeat | `sendHeartbeat()`                      | 15,000ms       | When `clientId` is set     |

### Socket.IO Event Handlers (Single Connection, Multiple Consumers)

The `usePipelineStream` hook registers **6 Socket.IO event listeners** that trigger state updates cascading to multiple panels:

```
pipeline.started  → updates state → AgentBoard, PipelineView, PipelineStatusBar, ProjectSummary re-render
step.started      → updates state → AgentBoard, CostMonitor, TokenUsage, MetricsPanel re-render
step.completed    → updates state → AgentBoard, CostMonitor, TokenUsage, MetricsPanel re-render
step.failed       → updates state → AgentBoard, PipelineView, GenerationStatusPanel re-render
pipeline.completed → updates state → ALL state-dependent panels re-render
pipeline.failed    → updates state → ALL state-dependent panels re-render
```

**During active generation:** A single `step.completed` event triggers re-renders in at minimum 4–6 panels simultaneously because derived state (`cost`, `tokens`, `agents`, `status`) flows to multiple consumers without memoization boundaries.

### Performance Concern: No Render Isolation

The `usePipelineStream` hook is called once at the `WorkspacePage` level. Its returned `state` object is a new reference on every update (via `setState`). This means:

- Every Socket.IO event causes the entire `WorkspacePage` to re-render
- All 29 child components receive new props on every pipeline event
- Only components wrapped in `memo()` (AgentBoard, LiveConsole, ActivityFeed, CostMonitor) avoid unnecessary re-renders
- **21 of 29 panels** are NOT memoized and re-render on every pipeline event

---

## 7. Missing UX Patterns

### No Progressive Disclosure

- ❌ No phase-based panel visibility
- ❌ No "show more" or expandable sections
- ❌ No tabbed or modal panel views
- ❌ No user-configurable panel visibility
- ❌ No "focus mode" that elevates a single panel

### No Context Awareness

- ❌ No properties panel that adapts to selection
- ❌ No "currently relevant" panel highlighting
- ❌ Clicking an agent in AgentBoard doesn't open a detail view elsewhere
- ❌ No panel-to-panel communication (e.g., selecting a pipeline stage doesn't filter LiveConsole)

### No Spatial Predictability

- ❌ Panels don't move or resize based on workflow state
- ❌ No "center stage" for the active task (e.g., AgentBoard during generation)
- ❌ No zone-based layout — all panels are equal-weight cards in a scrollable column
- ❌ No persistent always-visible command input area

### No Responsive Adaptation

- ❌ Below `xl` breakpoint: all 29 panels stack in a single vertical column
- ❌ No tablet-optimized layout
- ❌ No panel collapse/expand behavior
- ❌ No priority-based panel ordering for smaller viewports

---

## 8. State Management Pattern

### Current Pattern: Props-from-Parent

```
WorkspacePage (useState + usePipelineStream)
  ├── GenerateButton      ← receives projectId, pipelineStatus, callbacks
  ├── GenerationStatusPanel ← receives pipelineId, callbacks
  ├── AgentBoard          ← receives agents array
  ├── CostMonitor         ← receives computed cost value
  ├── TokenUsage          ← receives computed token values
  ├── LiveConsole         ← receives logs array
  ├── ActivityFeed        ← receives events array
  ├── MetricsPanel        ← receives pipelineId
  ├── SimulationPanel     ← receives projectId
  ├── EconomyPanel        ← receives projectId
  ├── PlaytestPanel       ← receives projectId
  └── ... (all 29 panels)
```

**Observations:**

- No Zustand, Redux, or Context-based global state
- All workspace state lives in a single component (`WorkspacePage`)
- Pipeline stream state is derived via `useMemo` at the page level
- Panels that need API data (SimulationPanel, EconomyPanel, PlaytestPanel, StudioBridgePanel) manage their own local fetch state independently
- No shared state between panels (no cross-panel communication)

### Implication for Fragmentation

Because there is no centralized state manager with selectors, there is no mechanism to:

- Track which "workflow phase" the user is in
- Determine which panels should be visible
- Coordinate panel visibility changes
- Persist user preferences about panel arrangement

---

## 9. Existing Partial Solutions (None Found)

After thorough examination of the codebase, **zero existing implementations** partially address Mission Control goals:

| Pattern                   | Present? | Evidence                                   |
| ------------------------- | -------- | ------------------------------------------ |
| Progressive disclosure    | ❌ No    | No conditional panel rendering             |
| Workflow phases           | ❌ No    | No phase state variable anywhere           |
| Context-aware panels      | ❌ No    | No selection-to-detail data flow           |
| Responsive panel behavior | ❌ No    | Only xl breakpoint toggle (3-col vs 1-col) |
| Panel priority/ordering   | ❌ No    | Hardcoded order in JSX                     |
| Lazy panel mounting       | ❌ No    | All panels mount immediately               |
| Zone-based layout         | ❌ No    | Flat 3-column grid                         |
| Collapsible panels        | ❌ No    | No collapse state or UI                    |
| Panel registry            | ❌ No    | Hardcoded imports and rendering            |

---

## 10. Summary of Fragmentation Issues

| Issue Category                             | Severity     | Impact                                          |
| ------------------------------------------ | ------------ | ----------------------------------------------- |
| All 29 panels render unconditionally       | **Critical** | Cognitive overload, performance waste           |
| No workflow phase awareness                | **Critical** | Users see irrelevant panels at every stage      |
| Duplicate data displayed in 3-5 panels     | **High**     | Attention fragmentation, wasted viewport        |
| No visual hierarchy between panels         | **High**     | Cannot quickly identify what matters now        |
| 8+ panels are empty/placeholder when idle  | **Medium**   | Wasted screen real estate                       |
| 21 of 29 panels not memoized               | **Medium**   | Unnecessary re-renders on every Socket.IO event |
| 6+ concurrent polling intervals            | **Medium**   | Network overhead, battery drain                 |
| AgentBoard (most critical) is a small card | **High**     | Primary real-time content has no prominence     |
| No responsive intermediate layout          | **Medium**   | Below xl = single column of 29 panels           |
| No panel-to-panel data flow                | **Medium**   | No contextual detail views                      |

---

## Appendix: File References

| File                                                | Role                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| `src/features/workspace/Workspace.tsx`              | Main workspace page — 29-panel grid layout                        |
| `src/features/workspace/hooks/usePipelineStream.ts` | Socket.IO hook — single pipeline state source                     |
| `src/features/workspace/types/index.ts`             | Type definitions for PipelineState, AgentState                    |
| `src/shared/events/index.ts`                        | Socket.IO event contracts (10 server-to-client events)            |
| `src/services/socket.ts`                            | Socket.IO singleton with auto-reconnect                           |
| `src/app/router/index.tsx`                          | Route definitions — workspace at `/projects/:id` within AppLayout |
