# Design Document: Workspace UX Redesign V2 — AI Mission Control

## Overview

This design document defines the UX architecture for transforming the RobloxAiStudio-DevKit workspace from a flat 3-column panel grid into a professional "AI Mission Control" interface. The redesign introduces a 5-zone spatial layout, workflow-first navigation through 8 pipeline phases, progressive disclosure to manage 29+ panel components, and a responsive strategy for screens from 768px to 1920px+.

**Key Design Decisions:**

1. **Zone-based layout over grid**: Replaces the current `xl:grid-cols-[1fr_1.15fr_0.95fr]` with semantically meaningful zones (Command Bar, Project Explorer, Center Canvas, Properties Panel, AI Command Center) that provide spatial predictability.
2. **Workflow phases as primary navigation**: The generation pipeline (Generate → Planning → Generation → Validation → Simulation → Economy → Playtest → Export) becomes the workspace's primary organizational axis, replacing the current "show everything" approach.
3. **AgentBoard as visual centerpiece**: Elevates AgentBoard from a card in column 1 to the full Center Canvas during pipeline execution, making AI activity the focal point.
4. **Persistent AI Command Center**: The bottom zone provides always-available AI interaction regardless of active canvas mode, eliminating the need to scroll to find generation controls.
5. **Progressive disclosure via visibility matrix**: Each panel has defined visibility rules per workflow phase, capping simultaneous visible panels at 8 to prevent cognitive overload.

**Deliverable Scope:** This document is a documentation-only specification. No executable code is produced. All existing 29 panel components, 12 routes, and 7 navigation entries are preserved.

## Architecture

### Current State Analysis

The existing workspace (`WorkspacePage` at `/projects/:id`) renders all 29 panel components simultaneously in a 3-column CSS Grid layout:

- **Column 1** (1fr): GenerateButton, GenerationStatusPanel, PipelineStatusBar, PipelineStatusViewer, AgentBoard, CostMonitor, TokenUsage, MetricsPanel
- **Column 2** (1.15fr): PipelineView, LiveConsole, GameArchitectPanel, SimulationPanel, EconomyPanel, AutonomousPipelinePanel, ArtifactExplorer, ExportPreview
- **Column 3** (0.95fr): ReviewSummaryPanel, ActivityFeed, AuditLogViewer, ValidationResults, PlaytestPanel, GenerationHistoryPanel, StudioBridgePanel, ProtocolMonitor, ProjectSummary

**Problems identified:**

- All panels render regardless of current task, creating visual noise
- No workflow awareness — generation controls sit next to analytics next to playtest
- The AgentBoard (the most critical real-time element) is a small card competing with 7 other panels
- No progressive disclosure; users see 29 panels at once
- No contextual properties panel; configuration is scattered across individual panels
- Mobile/tablet experience is a vertical stack of 29 panels

### Target Architecture: 5-Zone Mission Control

```
┌─────────────────────────────────────────────────────────────┐
│                    COMMAND BAR (Zone 1)                       │
│  [Project] [Breadcrumbs] [Phase Selector] [Status] [User]   │
├──────────┬────────────────────────────────┬─────────────────┤
│ PROJECT  │                                │  PROPERTIES     │
│ EXPLORER │       CENTER CANVAS            │  PANEL          │
│ (Zone 2) │         (Zone 3)               │  (Zone 4)       │
│          │                                │                 │
│ File Tree│   [Build|Code|Sim|Pipe|Play|   │  Context-aware  │
│ Assets   │    Analytics]                  │  details        │
│ Modules  │                                │                 │
├──────────┴────────────────────────────────┴─────────────────┤
│                  AI COMMAND CENTER (Zone 5)                   │
│  [Prompt Input] [LiveConsole] [Agent Activity] [Controls]    │
└─────────────────────────────────────────────────────────────┘
```

### Layout Strategy

The architecture uses CSS Grid for the outer shell and Flexbox within each zone:

```
grid-template:
  "command  command   command"    48px
  "explorer canvas   properties" 1fr
  "ai-cmd   ai-cmd   ai-cmd"    auto
  / auto    1fr      auto
```

This ensures:

- Command Bar is always fixed height at top
- AI Command Center is always anchored at bottom with resizable height
- Explorer and Properties panels are collapsible side columns
- Center Canvas fills all remaining space

## Components and Interfaces

### Zone 1: Command Bar

**Purpose:** Global context, workflow navigation, and status indicators.

| Element                 | Content                               | Behavior                           |
| ----------------------- | ------------------------------------- | ---------------------------------- |
| Project Name            | Active project title from route param | Links to project settings          |
| Breadcrumbs             | App > Projects > [Project] > [Phase]  | Navigable path                     |
| Workflow Phase Selector | 8 phase pills/tabs                    | Drives canvas mode + visibility    |
| AI Status Indicator     | Socket.IO connection dot              | Green=connected, gray=disconnected |
| Roblox Connection       | StudioConnectionStatus data           | Shows bridge status                |
| Notifications           | Toast trigger + unread count          | Bell icon with dropdown            |
| User Menu               | Avatar + dropdown                     | Settings, logout                   |

**Dimensions:** Fixed height 48px. Full viewport width. z-index: 50.

### Zone 2: Project Explorer

**Purpose:** File/asset navigation and project structure.

| Section          | Source Component                     | Notes                       |
| ---------------- | ------------------------------------ | --------------------------- |
| File Tree        | New (uses existing TreeView pattern) | Project file structure      |
| Asset Browser    | ArtifactExplorer (adapted)           | Generated artifacts         |
| Module Navigator | New                                  | Pipeline phase shortcuts    |
| Search           | New                                  | Filter files/assets/modules |

**Dimensions:**

- Default: 240px width
- Collapsed: 48px (icon-only rail)
- Min: 200px, Max: 360px
- Collapsible via toggle button or responsive breakpoint

### Zone 3: Center Canvas

**Purpose:** Primary content area with 6 mutually exclusive display modes.

| Mode       | Primary Components                                                                     | Triggered By            |
| ---------- | -------------------------------------------------------------------------------------- | ----------------------- |
| Build      | GameArchitectPanel                                                                     | Generate/Planning phase |
| Code       | ArtifactExplorer, ExportPreview (adapted as code viewer)                               | Code review tasks       |
| Simulation | SimulationPanel, EconomyPanel                                                          | Simulation phase        |
| Pipeline   | AgentBoard (expanded), AutonomousPipelinePanel, PipelineStatusViewer, ProgressTimeline | Generation phase        |
| Playtest   | PlaytestPanel, ValidationResults                                                       | Playtest phase          |
| Analytics  | MetricsPanel, CostMonitor, TokenUsage, GenerationHistoryPanel                          | On-demand               |

**Mode Switcher:** Tab bar at top of canvas zone with icons + labels. Keyboard shortcuts: Ctrl+1 through Ctrl+6.

**State Preservation:** Each mode maintains independent scroll position, form state, and selection. Inactive modes do not render DOM nodes (lazy mount on first activation, unmount after 60s of inactivity to free memory).

### Zone 4: Properties Panel

**Purpose:** Context-sensitive detail view based on canvas mode and user selection.

| Context                 | Properties Content                                              |
| ----------------------- | --------------------------------------------------------------- |
| Build mode              | Game architecture props, genre config, mechanics                |
| Code mode               | File metadata, AI suggestions, diff stats                       |
| Simulation mode         | Simulation metrics, grade breakdown, engagement                 |
| Pipeline mode           | Per-agent details (CostMonitor, TokenUsage per agent)           |
| Playtest mode           | Test results, performance data, validation details              |
| Analytics mode          | Chart configuration, date ranges, export options                |
| Agent selected          | Agent status, progress, model, provider, tokens, cost, duration |
| Pipeline phase selected | Phase execution details, duration, errors, artifacts            |

**Priority System:**

1. Explicit user selection (clicking an agent/element)
2. Active Canvas Mode default content
3. Current Workflow Phase fallback

**Dimensions:**

- Default: 300px width
- Collapsed: 0px (hidden)
- Min: 260px, Max: 420px
- Sections stack vertically with collapsible headers (max 3 stacked sections)

### Zone 5: AI Command Center

**Purpose:** Persistent AI interaction point — prompt input, live output, generation controls.

| Section             | Source Component                         | Position             |
| ------------------- | ---------------------------------------- | -------------------- |
| Prompt Input        | New (multi-line, syntax highlighting)    | Left 60%             |
| Generation Controls | GenerateButton, pause/resume/cancel      | Right of prompt      |
| Output Area         | LiveConsole, ActivityFeed (tabbed)       | Below prompt         |
| Status Bar          | PipelineStatusBar, GenerationStatusPanel | Inline with controls |

**Height States:**

- Collapsed: 44px (single-line prompt visible, expand button)
- Default: 200px (prompt + 4 lines output)
- Expanded: up to 40% viewport height (full console view)

**Resize:** Drag handle at top border. Double-click handle to toggle default/expanded.

**Persistence:** Remains visible and interactive across all canvas mode transitions. Output history preserved. Input state (draft text) maintained.

---

### Workflow Phase Definitions

| #   | Phase      | Primary Canvas Mode | Key Panels Visible                                 | Properties Content                  | AI Command Center State              |
| --- | ---------- | ------------------- | -------------------------------------------------- | ----------------------------------- | ------------------------------------ |
| 1   | Generate   | Build               | GameArchitectPanel, prompt builder                 | Generation options, templates       | Prompt focused, expanded             |
| 2   | Planning   | Build               | GameArchitectPanel (planning view)                 | Architecture properties             | Prompt + planning output             |
| 3   | Generation | Pipeline            | AgentBoard (expanded), AutonomousPipelinePanel     | Per-agent details, CostMonitor      | LiveConsole active, controls visible |
| 4   | Validation | Playtest            | ValidationResults, ReviewSummaryPanel              | Validation metrics, error list      | Validation output                    |
| 5   | Simulation | Simulation          | SimulationPanel, EconomyPanel                      | Simulation metrics, grades          | Simulation logs                      |
| 6   | Economy    | Simulation          | EconomyPanel (focused)                             | Economy balance data                | Economy analysis output              |
| 7   | Playtest   | Playtest            | PlaytestPanel, ValidationResults                   | Performance data                    | Playtest output                      |
| 8   | Export     | Code                | ArtifactExplorer, ExportPreview, StudioBridgePanel | Export config, Roblox Studio bridge | Export status, sync output           |

### Phase Transition Rules

- **Forward sequential:** Always allowed (phase N → phase N+1)
- **Jump-back to completed:** Allowed without confirmation (return to review previous work)
- **Skip forward:** Allowed with confirmation dialog ("Phase X has not been completed. Skip?")
- **Locked phases:** Phases requiring prerequisite data show disabled state with tooltip explaining the requirement

### Phase Selector UI (Command Bar)

```
[ Generate ] → [ Planning ] → [ Generation ] → [ Validation ] → [ Simulation ] → [ Economy ] → [ Playtest ] → [ Export ]
     ●              ●              ◉               ○                ○               ○             ○             ○
  completed      completed       current         available         locked          locked        locked        locked
```

Visual indicators:

- Current: highlighted background (brand-500), bold label
- Completed: checkmark icon, subtle green accent
- Available: default style, clickable
- Locked: gray, disabled, tooltip on hover

### Progressive Disclosure — Visibility Matrix

| Panel Component         | Generate    | Planning    | Generation  | Validation  | Simulation  | Economy     | Playtest    | Export      |
| ----------------------- | ----------- | ----------- | ----------- | ----------- | ----------- | ----------- | ----------- | ----------- |
| AgentBoard              | hidden      | hidden      | **visible** | on-demand   | hidden      | hidden      | hidden      | hidden      |
| LiveConsole             | on-demand   | on-demand   | **visible** | on-demand   | on-demand   | on-demand   | on-demand   | on-demand   |
| CostMonitor             | hidden      | hidden      | **visible** | hidden      | hidden      | hidden      | hidden      | on-demand   |
| TokenUsage              | hidden      | hidden      | **visible** | hidden      | hidden      | hidden      | hidden      | on-demand   |
| ProjectSummary          | **visible** | **visible** | hidden      | hidden      | hidden      | hidden      | hidden      | **visible** |
| ActivityFeed            | on-demand   | on-demand   | **visible** | on-demand   | hidden      | hidden      | hidden      | hidden      |
| GenerateButton          | **visible** | **visible** | hidden      | hidden      | hidden      | hidden      | hidden      | hidden      |
| GenerationStatusPanel   | **visible** | **visible** | **visible** | hidden      | hidden      | hidden      | hidden      | hidden      |
| GenerationHistoryPanel  | on-demand   | on-demand   | on-demand   | on-demand   | on-demand   | on-demand   | on-demand   | **visible** |
| ArtifactExplorer        | hidden      | hidden      | on-demand   | **visible** | hidden      | hidden      | hidden      | **visible** |
| ExportPreview           | hidden      | hidden      | hidden      | hidden      | hidden      | hidden      | hidden      | **visible** |
| ReviewSummaryPanel      | hidden      | hidden      | hidden      | **visible** | hidden      | hidden      | hidden      | on-demand   |
| ValidationResults       | hidden      | hidden      | hidden      | **visible** | hidden      | hidden      | **visible** | hidden      |
| PipelineStatusBar       | hidden      | hidden      | **visible** | hidden      | hidden      | hidden      | hidden      | hidden      |
| PipelineStatusViewer    | hidden      | hidden      | **visible** | hidden      | hidden      | hidden      | hidden      | hidden      |
| StudioBridgePanel       | hidden      | hidden      | hidden      | hidden      | hidden      | hidden      | hidden      | **visible** |
| ProtocolMonitor         | hidden      | hidden      | on-demand   | hidden      | hidden      | hidden      | hidden      | on-demand   |
| GameArchitectPanel      | **visible** | **visible** | hidden      | hidden      | hidden      | hidden      | hidden      | hidden      |
| SimulationPanel         | hidden      | hidden      | hidden      | hidden      | **visible** | on-demand   | hidden      | hidden      |
| PlaytestPanel           | hidden      | hidden      | hidden      | hidden      | hidden      | hidden      | **visible** | hidden      |
| EconomyPanel            | hidden      | hidden      | hidden      | hidden      | on-demand   | **visible** | hidden      | hidden      |
| AutonomousPipelinePanel | hidden      | hidden      | **visible** | hidden      | hidden      | hidden      | hidden      | hidden      |
| MetricsPanel            | on-demand   | on-demand   | on-demand   | on-demand   | **visible** | on-demand   | on-demand   | on-demand   |
| AuditLogViewer          | hidden      | hidden      | on-demand   | on-demand   | hidden      | hidden      | hidden      | on-demand   |
| ProgressTimeline        | hidden      | hidden      | **visible** | hidden      | hidden      | hidden      | hidden      | hidden      |
| PublishWorkflow         | hidden      | hidden      | hidden      | hidden      | hidden      | hidden      | hidden      | **visible** |
| StudioConnectionStatus  | on-demand   | on-demand   | on-demand   | on-demand   | on-demand   | on-demand   | on-demand   | **visible** |
| SyncButton              | hidden      | hidden      | hidden      | hidden      | hidden      | hidden      | hidden      | **visible** |
| AgentCard               | hidden      | hidden      | **visible** | hidden      | hidden      | hidden      | hidden      | hidden      |

**Maximum simultaneous visible panels per phase: 8** (enforced by the matrix above)

**Manual override rule:** When a user manually reveals a hidden panel (via "More" menu or search), it remains visible until:

- The user explicitly hides it, OR
- The user transitions to a phase where the panel is marked "hidden" (not "on-demand")

### AgentBoard Expanded Specification

**Compact Mode** (current): Right-column card showing agent list with status badges.

**Expanded Mode** (Pipeline Canvas Mode): Full Center Canvas content showing:

```
┌─────────────────────────────────────────────────────────────────┐
│  Pipeline Timeline                                               │
│                                                                   │
│  [Genre]──→[Planner]──→[Designer]──→[LuaGen]──→[Asset]──→       │
│    ✓          ✓           ◉           ○          ○               │
│   0.12$      0.08$       running      idle       idle            │
│                                                                   │
│  ──→[Economy]──→[Simulation]──→[Playtest]──→[Review]──→[Sync]   │
│       ○            ○              ○            ○          ○       │
│      idle         idle           idle         idle       idle     │
│                                                                   │
│  ─── Connection lines show execution flow direction              │
│  ─── Animated particles on active connections                    │
└─────────────────────────────────────────────────────────────────┘
```

**Agent Node Visual States:**

- Idle: `bg-slate-700` border, gray text
- Running: Animated `border-brand-400` pulse (2s ease-in-out), progress ring
- Completed: `border-success-400`, checkmark overlay, green glow
- Failed: `border-error-400`, alert icon, red glow, error tooltip
- Paused: `border-warning-400`, pause icon, amber glow

**Real-time data per node** (from `usePipelineStream`):

- Progress percentage (circular progress indicator)
- Token count (below node)
- Cost accumulation (below node)
- Duration elapsed/total

**Transition:** Compact ↔ Expanded triggered by Canvas Mode switch to/from Pipeline. Animation: scale + fade, 300ms ease-out.

### Sidebar Coexistence Strategy

The existing 7 Sidebar navigation items remain unchanged for app-level navigation:

| Sidebar Item   | Scope     | Conflict Resolution                         |
| -------------- | --------- | ------------------------------------------- |
| Dashboard      | App-level | No conflict — navigates away from workspace |
| AI Studio      | App-level | No conflict — separate page                 |
| Projects       | App-level | No conflict — project list                  |
| Plugin Manager | App-level | No conflict — separate page                 |
| Analytics      | App-level | No conflict — global analytics              |
| Knowledge Base | App-level | No conflict — separate page                 |
| Settings       | App-level | No conflict — separate page                 |

**Key principle:** Sidebar = app-level navigation (between pages). Command Bar Phase Selector = workspace-internal navigation (within the workspace page). These are orthogonal concerns with no overlap.

When inside the workspace (`/projects/:id`), the Sidebar collapses to icon-only mode by default to maximize canvas space. Users can expand it to navigate away.

## Data Models

### Workspace State Model

```typescript
interface WorkspaceState {
  // Current workflow phase (drives visibility matrix)
  currentPhase: WorkflowPhase;
  completedPhases: WorkflowPhase[];

  // Canvas mode (may differ from phase-default if user manually switched)
  activeCanvasMode: CanvasMode;

  // Zone collapse states
  zones: {
    explorer: ZoneState;
    properties: ZoneState;
    aiCommand: ZoneState;
  };

  // User overrides for panel visibility
  manuallyRevealedPanels: PanelId[];
  manuallyHiddenPanels: PanelId[];

  // Properties panel context
  propertiesContext: PropertiesContext;

  // Per-mode preserved state
  modeStates: Record<CanvasMode, ModeState>;
}

type WorkflowPhase =
  | "generate"
  | "planning"
  | "generation"
  | "validation"
  | "simulation"
  | "economy"
  | "playtest"
  | "export";

type CanvasMode =
  "build" | "code" | "simulation" | "pipeline" | "playtest" | "analytics";

interface ZoneState {
  collapsed: boolean;
  width?: number; // For side zones
  height?: number; // For AI Command Center
}

interface PropertiesContext {
  source: "selection" | "canvas-mode" | "workflow-phase";
  selectedEntity?: {
    type: "agent" | "pipeline-phase" | "artifact" | "file";
    id: string;
  };
}

interface ModeState {
  scrollPosition: { x: number; y: number };
  formState: Record<string, unknown>;
  selection: string | null;
  lastActivated: number; // timestamp for cleanup
}
```

### Module Registry Model (Scalability)

```typescript
interface PanelRegistration {
  id: PanelId;
  name: string;
  preferredZone: "explorer" | "canvas" | "properties" | "ai-command";
  supportedCanvasModes: CanvasMode[];
  supportedPhases: WorkflowPhase[];
  priority: number; // 1-100, higher = more important
  minSize: { width: number; height: number };
  category: "generation" | "monitoring" | "validation" | "export" | "analytics";
}

// Registry allows 50+ modules without visual overload
interface ModuleRegistry {
  panels: Map<PanelId, PanelRegistration>;
  register(panel: PanelRegistration): void;
  getVisiblePanels(phase: WorkflowPhase, mode: CanvasMode): PanelRegistration[];
  getOverflowPanels(
    phase: WorkflowPhase,
    mode: CanvasMode,
  ): PanelRegistration[];
}
```

### User Preferences Model

```typescript
interface WorkspacePreferences {
  // Saved layouts
  layouts: WorkspaceLayout[];
  activeLayoutId: string;

  // Per-user customizations
  pinnedPanels: PanelId[];
  zoneDefaults: {
    explorerWidth: number;
    propertiesWidth: number;
    aiCommandHeight: number;
  };

  // Accessibility
  reducedMotion: boolean;
  highContrast: boolean;
}

interface WorkspaceLayout {
  id: string;
  name: string;
  zones: WorkspaceState["zones"];
  pinnedPanels: PanelId[];
  defaultPhase: WorkflowPhase;
}
```

### Responsive Breakpoint Configuration

```typescript
interface BreakpointConfig {
  desktop: {
    // 1440–1919px
    explorerDefault: 240;
    explorerCollapsed: 48;
    propertiesDefault: 300;
    propertiesCollapsed: 0;
    aiCommandDefault: 200;
    aiCommandCollapsed: 44;
    allZonesVisible: true;
  };
  laptop: {
    // 1024–1439px
    explorerDefault: 48; // Auto-collapsed to icons
    propertiesDefault: 0; // Auto-collapsed
    aiCommandDefault: 44; // Collapsed to single-line
    splitView: false;
  };
  tablet: {
    // 768–1023px
    explorerDefault: 0; // Hidden, overlay access
    propertiesDefault: 0; // Hidden, overlay access
    aiCommandDefault: 44; // Bottom sheet
    canvasFullWidth: true;
  };
  largeMonitor: {
    // ≥1920px
    explorerDefault: 280;
    propertiesDefault: 360;
    aiCommandDefault: 240;
    splitViewAvailable: true; // Side-by-side canvas modes
  };
}
```

<!-- Correctness Properties: Omitted. Property-based testing is not applicable to this feature.
     This is a documentation-only deliverable (UX architecture specification) with no executable
     code, pure functions, or data transformations to validate via generated inputs.
     Verification is performed through design review and specification completeness audits. -->

## Error Handling

### Layout Error Scenarios

| Scenario                                                     | Handling Strategy                                                                                                             |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Zone resize below minimum                                    | Snap to minimum dimension, show resize cursor                                                                                 |
| Zone resize conflict (explorer + properties exceed viewport) | Properties panel auto-collapses first, then explorer                                                                          |
| Canvas mode component fails to load                          | ErrorBoundary per mode with "Retry" action and fallback to last working mode                                                  |
| Socket.IO disconnection during Generation phase              | AI Command Center shows disconnection warning, AgentBoard shows stale data indicator, auto-reconnect with exponential backoff |
| Phase transition with unsaved form state                     | Confirmation dialog: "You have unsaved changes in [Mode]. Save before switching?"                                             |
| Panel registration conflict (same ID)                        | Last-registered wins with console warning in development                                                                      |
| Responsive breakpoint during drag resize                     | Cancel active resize, animate to new breakpoint defaults                                                                      |

### Recovery Patterns

- **Workspace state corruption:** Reset to default layout via user menu action
- **Performance degradation:** Auto-collapse non-essential zones, throttle Socket.IO updates to 1/second
- **Component crash:** Per-zone ErrorBoundary isolates failures; crashed zone shows "Something went wrong" with restore action; other zones remain functional

### Notification Patterns

| Event Type             | Notification Style                          | Duration                      | Priority |
| ---------------------- | ------------------------------------------- | ----------------------------- | -------- |
| Pipeline completion    | Success toast                               | 5s auto-dismiss               | Normal   |
| Agent failure          | Error toast + alert badge on Pipeline tab   | Persistent until acknowledged | High     |
| Cost threshold warning | Warning toast + banner in AI Command Center | 10s auto-dismiss              | Medium   |
| Socket.IO reconnection | Info toast                                  | 3s auto-dismiss               | Low      |
| Export ready           | Success toast + badge on Export phase       | Persistent until viewed       | Normal   |

## Testing Strategy

Since this is a documentation-only deliverable (no executable code), traditional unit and integration testing do not apply. The testing strategy focuses on specification validation and future implementation verification.

### Specification Validation (Pre-Implementation)

1. **Completeness audit**: Verify all 29 panel components appear in the migration table with zone assignment, canvas mode, and phase visibility defined
2. **Consistency check**: Cross-reference visibility matrix rows against phase definitions — ensure no phase exceeds 8 visible panels
3. **Responsive arithmetic**: Verify zone dimension constraints are achievable at each breakpoint (explorer + canvas + properties ≤ viewport width)
4. **Accessibility review**: Confirm all zones specify ARIA landmarks, keyboard navigation paths, and focus management rules
5. **Data dependency mapping**: Verify all Socket.IO events and API endpoints referenced by panels are documented

### Implementation Verification (Post-Implementation)

When this design is eventually implemented, the following test categories apply:

**Unit Tests:**

- Visibility matrix logic: given a phase and mode, correct panels are returned
- Zone dimension calculations: min/max constraints respected at each breakpoint
- Phase transition validation: allowed/blocked transitions enforced correctly
- Properties context priority resolution: selection > canvas-mode > workflow-phase

**Integration Tests:**

- Canvas mode switching preserves state (scroll position, form data)
- Zone collapse/expand triggers correct CSS grid recalculation
- Socket.IO events update AgentBoard nodes correctly during Pipeline mode
- Responsive breakpoint changes trigger correct zone auto-collapse behavior

**Visual Regression Tests:**

- Zone layouts at each breakpoint match wireframe descriptions
- AgentBoard expanded timeline matches specified node states
- Phase selector correctly shows completed/current/available/locked states

**Accessibility Tests:**

- Tab order follows zone hierarchy (Command Bar → Explorer → Canvas → Properties → AI Command)
- Screen reader announces zone landmarks
- All interactive elements have visible focus indicators
- Reduced-motion preference disables animations

### Performance Budgets (Implementation Targets)

| Metric                                   | Budget   |
| ---------------------------------------- | -------- |
| Initial workspace render                 | < 200ms  |
| Canvas mode switch                       | < 150ms  |
| Simultaneous re-renders per action       | ≤ 3      |
| Memory growth per hour                   | < 5MB    |
| Inactive mode cleanup threshold          | 60s      |
| Socket.IO update throttle (non-critical) | 4fps max |

---

## Appendix A: Component Migration Table

| #   | Component               | Current Column              | New Zone                         | Canvas Mode     | Modifications                              |
| --- | ----------------------- | --------------------------- | -------------------------------- | --------------- | ------------------------------------------ |
| 1   | AgentBoard              | Col 1                       | Center Canvas                    | Pipeline        | Expand to timeline view, add node states   |
| 2   | AgentCard               | Col 1 (child of AgentBoard) | Center Canvas                    | Pipeline        | Enhanced with progress ring, cost display  |
| 3   | LiveConsole             | Col 2                       | AI Command Center                | All (tabbed)    | Add tab interface for multi-source output  |
| 4   | CostMonitor             | Col 1                       | Properties Panel                 | Pipeline        | Context: agent selected or phase summary   |
| 5   | TokenUsage              | Col 1                       | Properties Panel                 | Pipeline        | Context: agent selected or phase summary   |
| 6   | ProjectSummary          | Col 3                       | Properties Panel                 | Build           | Reuse as-is in properties context          |
| 7   | ActivityFeed            | Col 3                       | AI Command Center                | All (tabbed)    | Tab alongside LiveConsole                  |
| 8   | GenerateButton          | Col 1                       | AI Command Center                | All             | Persistent beside prompt input             |
| 9   | GenerationStatusPanel   | Col 1                       | AI Command Center                | All             | Inline status indicator                    |
| 10  | GenerationHistoryPanel  | Col 3                       | Properties Panel                 | Analytics       | History browser in properties              |
| 11  | ArtifactExplorer        | Col 2                       | Project Explorer + Center Canvas | Code            | Split: tree in explorer, content in canvas |
| 12  | ExportPreview           | Col 2                       | Center Canvas                    | Code            | Full-width code preview                    |
| 13  | ReviewSummaryPanel      | Col 3                       | Properties Panel                 | Playtest        | Context: validation phase                  |
| 14  | ValidationResults       | Col 3                       | Center Canvas                    | Playtest        | Primary content in playtest mode           |
| 15  | PipelineStatusBar       | Col 1                       | AI Command Center                | All             | Inline with generation controls            |
| 16  | PipelineStatusViewer    | Col 1                       | Center Canvas                    | Pipeline        | Alongside AgentBoard                       |
| 17  | StudioBridgePanel       | Col 3                       | Properties Panel                 | Code/Export     | Context: export phase                      |
| 18  | ProtocolMonitor         | Col 3                       | Properties Panel                 | Pipeline/Export | On-demand diagnostic view                  |
| 19  | GameArchitectPanel      | Col 2                       | Center Canvas                    | Build           | Primary content in build mode              |
| 20  | SimulationPanel         | Col 2                       | Center Canvas                    | Simulation      | Primary content in simulation mode         |
| 21  | PlaytestPanel           | Col 3                       | Center Canvas                    | Playtest        | Primary content in playtest mode           |
| 22  | EconomyPanel            | Col 2                       | Center Canvas                    | Simulation      | Simulation sub-view (economy focus)        |
| 23  | AutonomousPipelinePanel | Col 2                       | Center Canvas                    | Pipeline        | Controls alongside AgentBoard              |
| 24  | MetricsPanel            | Col 1                       | Center Canvas                    | Analytics       | Dashboard layout component                 |
| 25  | AuditLogViewer          | Col 3                       | Properties Panel                 | Pipeline        | On-demand audit detail                     |
| 26  | ProgressTimeline        | (via PipelineView)          | Center Canvas                    | Pipeline        | Timeline visualization                     |
| 27  | PublishWorkflow         | N/A (new)                   | Center Canvas                    | Code/Export     | Export workflow steps                      |
| 28  | StudioConnectionStatus  | (via TopBar/StatusBar)      | Command Bar                      | All             | Status indicator in command bar            |
| 29  | SyncButton              | Col 3                       | Command Bar                      | Export          | Action button in export phase              |

### Migration Phases

**Phase 1 — Layout Shell + Zone Containers** (Foundation)

- Implement 5-zone CSS Grid shell replacing the 3-column grid
- Create zone container components with collapse/expand logic
- Wire responsive breakpoint detection
- Rollback criteria: Layout renders at all 4 breakpoints without overflow

**Phase 2 — Component Placement + Mode Switching** (Core)

- Move each panel into its designated zone per migration table
- Implement Canvas Mode tab switching (6 modes)
- Wire Workflow Phase selector in Command Bar
- Rollback criteria: All 29 components render in their new locations; mode switching works

**Phase 3 — Progressive Disclosure + Context Awareness** (Intelligence)

- Implement visibility matrix logic (phase × mode → visible panels)
- Wire Properties Panel context system (selection > mode > phase)
- Implement AI Command Center persistence across mode transitions
- Rollback criteria: Correct panels show/hide per phase; properties update on selection

**Phase 4 — Responsive Adaptation + Polish** (Quality)

- Implement breakpoint-specific zone collapse behavior
- Add animations, transitions, keyboard shortcuts
- Implement user preferences (saved layouts, pinned panels)
- Accessibility audit and compliance
- Rollback criteria: WCAG 2.1 AA compliance; no performance regression beyond budgets

## Appendix B: Interaction Model

### Keyboard Navigation

| Shortcut                          | Action                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| Ctrl+K                            | Focus AI Command Center prompt                                                        |
| Ctrl+1 through Ctrl+6             | Switch Canvas Mode (Build, Code, Simulation, Pipeline, Playtest, Analytics)           |
| Ctrl+B                            | Toggle Project Explorer                                                               |
| Ctrl+Shift+P                      | Toggle Properties Panel                                                               |
| Ctrl+`                            | Toggle AI Command Center (expand/collapse)                                            |
| Tab                               | Cycle focus between zones (Command Bar → Explorer → Canvas → Properties → AI Command) |
| Escape                            | Collapse expanded overlays, exit focus trap                                           |
| Ctrl+Shift+1 through Ctrl+Shift+8 | Jump to Workflow Phase                                                                |

### Drag-and-Drop Interactions

- **Zone boundary resize:** Drag handles between explorer/canvas, canvas/properties, and canvas/AI-command
- **Panel reorder within zone:** Drag panel headers to reorder stacked panels in Properties Panel
- **No cross-zone drag:** Panels cannot be moved between zones via drag (preserves layout integrity)

### AI Streaming Visual States

| State      | Visual Treatment                             | Location                                   |
| ---------- | -------------------------------------------- | ------------------------------------------ |
| Thinking   | Pulsing brand-400 dot + elapsed time counter | AI Command Center + AgentBoard node        |
| Generating | Progress bar with token count incrementing   | AgentBoard node + AI Command Center status |
| Reviewing  | Completion ring filling + quality score      | AgentBoard node                            |
| Idle       | Subtle ambient pulse (2px brand-400 glow)    | AgentBoard node border                     |

### Transition Animations

| Transition                            | Duration | Easing      | Choreography                                                       |
| ------------------------------------- | -------- | ----------- | ------------------------------------------------------------------ |
| Canvas mode switch                    | 200ms    | ease-out    | Fade out current (100ms) → fade in next (100ms)                    |
| Phase transition                      | 300ms    | ease-in-out | Phase selector animates → canvas content swaps → properties update |
| Zone collapse                         | 250ms    | ease-out    | Width/height animates to collapsed value                           |
| Zone expand                           | 300ms    | ease-out    | Width/height animates to target, content fades in (50ms delay)     |
| Panel reveal (progressive disclosure) | 200ms    | ease-out    | Slide-down + fade-in                                               |
| Panel hide                            | 150ms    | ease-in     | Fade-out + slide-up                                                |

**Reduced motion:** All animations replaced with instant transitions (0ms). Pulsing indicators become static colored dots. Progress bars remain (informational, not decorative).

### Touch Interactions (Tablet: 768–1023px)

- **Swipe right from left edge:** Reveal Project Explorer overlay
- **Swipe left from right edge:** Reveal Properties Panel overlay
- **Swipe up from bottom:** Expand AI Command Center
- **Long-press on panel header:** Show context menu (pin, hide, details)
- **Pinch-to-zoom on AgentBoard timeline:** Zoom in/out on timeline nodes

## Appendix C: Visual Hierarchy

### 3-Tier Attention System

| Tier      | Elements                                             | Treatment                                               |
| --------- | ---------------------------------------------------- | ------------------------------------------------------- |
| Primary   | Active canvas content, running agent node, AI prompt | Full brightness, largest type scale, foreground z-index |
| Secondary | Properties panel content, AI Command Center output   | 85% brightness, medium type scale                       |
| Tertiary  | Status indicators, navigation, collapsed panels      | 60% brightness, small type scale, muted colors          |

### Color System Extensions

Building on existing design tokens (`brand`, `success`, `error`, `warning`, `info`):

| Purpose                | Token                  | Value Guidance                   |
| ---------------------- | ---------------------- | -------------------------------- |
| Zone border (active)   | `zone-border-active`   | brand-400/30 (subtle brand tint) |
| Zone border (inactive) | `zone-border-inactive` | white/10 (existing pattern)      |
| Phase completed        | `phase-complete`       | success-400                      |
| Phase current          | `phase-current`        | brand-500                        |
| Phase available        | `phase-available`      | slate-300                        |
| Phase locked           | `phase-locked`         | slate-600                        |
| Agent running glow     | `agent-glow-running`   | brand-400/50 box-shadow          |
| Agent failed glow      | `agent-glow-failed`    | error-400/50 box-shadow          |

### Typography Scale (consistent with Tailwind config)

| Element                             | Class                              | Size |
| ----------------------------------- | ---------------------------------- | ---- |
| Zone header (e.g., "Center Canvas") | Not rendered (implicit)            | —    |
| Panel title                         | `text-sm font-semibold`            | 14px |
| Data value (tokens, cost)           | `text-lg font-mono font-bold`      | 18px |
| Label                               | `text-xs uppercase tracking-wider` | 12px |
| Status text                         | `text-xs`                          | 12px |
| Prompt input                        | `text-base`                        | 16px |

### Depth and Layering

| Layer          | z-index | Elements                                  |
| -------------- | ------- | ----------------------------------------- |
| Base           | 0       | Canvas content, inline panels             |
| Zones          | 10      | Zone containers                           |
| Resize handles | 20      | Drag handles between zones                |
| Sidebar        | 30      | App sidebar (existing)                    |
| Command Bar    | 40      | Fixed top bar                             |
| Overlays       | 50      | Tablet panel overlays, expanded panels    |
| Modals         | 60      | Confirmation dialogs, phase skip warning  |
| Toasts         | 70      | Notification toasts                       |
| Tooltips       | 80      | Hover tooltips, phase locked explanations |

### Ambient Atmosphere

- **Background:** Solid `slate-950` base with subtle radial gradient (brand-900/5 center glow) — dark-mode only
- **AI activity indicator:** Faint particle mesh effect (CSS-only, using multiple box-shadows) on AI Command Center border during generation — disabled with `prefers-reduced-motion`
- **Active zone glow:** 1px brand-400/20 box-shadow on the zone the user is interacting with
- **Idle state:** Minimal ambient animation — subtle border color cycle on AgentBoard nodes (8s period) — disabled with `prefers-reduced-motion`

## Appendix D: Risk Analysis

### Technical Risks

| Risk                                                     | Impact                            | Probability | Mitigation                                                                                                   | Effort |
| -------------------------------------------------------- | --------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------ | ------ |
| Socket.IO event volume during 11-agent pipeline          | High frame drops, UI lag          | Medium      | Throttle non-critical updates to 4fps; batch DOM updates; virtualize ActivityFeed                            | Medium |
| Render performance with 29+ registered panels            | Slow mode switching               | Medium      | Lazy mount/unmount; React.memo on stable panels; visibility matrix prevents >8 simultaneous renders          | Low    |
| State management complexity for context-aware visibility | Bugs in panel show/hide           | High        | Centralized WorkspaceState with clear reducer pattern; exhaustive unit tests on visibility matrix            | Medium |
| Responsive layout edge cases                             | Broken layouts at boundary widths | Medium      | Define explicit breakpoint behavior (no gaps); test at exact breakpoint values; CSS Grid min/max constraints | Medium |
| Canvas mode state preservation on unmount                | Lost scroll/form state            | Low         | Persist mode state to WorkspaceState before unmount; restore on re-mount                                     | Low    |

### UX Risks

| Risk                                                   | Impact                                   | Probability | Mitigation                                                                                               | Effort |
| ------------------------------------------------------ | ---------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------- | ------ |
| Cognitive load from 6 canvas modes                     | Users confused about where content lives | Medium      | Strong visual mode indicator; keyboard shortcuts; mode labels always visible; guided first-use tour      | Low    |
| Discoverability of hidden panels                       | Users can't find panels they remember    | High        | "More" menu in each zone showing available panels; global search (Ctrl+K) finds panels by name           | Medium |
| Loss of spatial memory when panels move between phases | Disorientation on phase change           | Medium      | Smooth transitions (not instant swaps); breadcrumb trail; "you are here" indicator in phase selector     | Low    |
| Learning curve for workflow-first navigation           | New users don't understand phases        | Medium      | Optional "classic view" toggle showing all panels (migration Phase 1 compatibility); onboarding tooltips | Medium |

### Project Risks

| Risk                                                  | Impact                            | Probability | Mitigation                                                                                                    | Effort |
| ----------------------------------------------------- | --------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------- | ------ |
| Scope creep from customization features (Req 10)      | Delayed delivery                  | High        | Implement customization in Phase 4 only; ship Phases 1-3 first with hardcoded defaults                        | —      |
| Migration breaking existing functionality             | Regression in generation pipeline | Medium      | Per-phase rollback criteria; feature flag to toggle old/new layout; integration tests before/after            | Medium |
| Responsive adaptation requiring per-component testing | Testing burden                    | High        | Limit initial responsive support to Desktop + Laptop; Tablet in Phase 4; shared responsive wrapper component  | Medium |
| Accessibility compliance effort                       | Delayed launch                    | Medium      | Integrate a11y testing from Phase 1; use existing ARIA patterns from Sidebar/AppShell; automated a11y linting | Medium |

### Hard Constraints

1. **No code implementation** — This spec produces documentation only
2. **All existing features preserved** — All 29 panels remain functional; no panel is deleted
3. **Existing component APIs maintained** — Panel props/interfaces unchanged where possible; new wrapper components for zone integration
4. **Design system compliance** — 95% adherence to existing Tailwind config, color tokens, and component patterns
5. **Route structure unchanged** — `/projects/:id` remains the workspace route; no URL changes

## Appendix E: Future Scalability

### Module Registry Pattern

New panels self-register with metadata:

```typescript
// Example: A future "Collaborative Editor" panel
registerPanel({
  id: "collaborative-editor",
  name: "Collaborative Editor",
  preferredZone: "canvas",
  supportedCanvasModes: ["code"],
  supportedPhases: ["generation", "validation", "export"],
  priority: 60,
  minSize: { width: 400, height: 300 },
  category: "generation",
});
```

### Overflow Behavior (>8 panels available)

When more panels are available than the 8-panel maximum:

1. Top 8 by priority render normally
2. Remaining panels appear in a "More panels" dropdown menu at the bottom of their target zone
3. Users can pin panels (pinned panels always count toward the 8 visible)
4. A "Panel Drawer" (slide-out from right) provides a searchable grid of all available panels

### Plugin Integration Point

Third-party or future modules register through the same registry:

- Plugin Manager extensions appear in their declared zone/phase
- Collaborative features (F-12) register for the Code canvas mode
- Domain-specific tools declare their own phases (extensible enum)
- No layout modifications required — the registry + visibility matrix handles placement

### Render Limits Per Zone

| Zone              | Limit                        | Rationale                                        |
| ----------------- | ---------------------------- | ------------------------------------------------ |
| Project Explorer  | 1 active tree view           | Tree rendering is expensive with large file sets |
| Center Canvas     | 1 active mode (lazy content) | Only active mode renders; others unmounted       |
| Properties Panel  | 3 stacked sections           | Beyond 3, sections collapse to headers only      |
| AI Command Center | 2 concurrent output streams  | LiveConsole + ActivityFeed; others tabbed        |
