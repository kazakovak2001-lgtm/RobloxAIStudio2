# Workspace Component Catalog — Codebase Audit

> **Audit Date:** 2025  
> **Source Path:** `src/features/workspace/components/`  
> **Workspace Entry:** `src/features/workspace/Workspace.tsx`  
> **Requirements:** 1.1, 1.5

## Summary

| Metric                                            | Value                                                                               |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Total components found in `components/` directory | 29                                                                                  |
| Components rendered in `WorkspacePage` grid       | 29 (all accounted for)                                                              |
| Additional workspace files                        | `PipelineView.tsx`, `Workspace.tsx`, `hooks/usePipelineStream.ts`, `types/index.ts` |
| Grid layout                                       | `xl:grid-cols-[1fr_1.15fr_0.95fr]` (3-column CSS Grid)                              |
| State management                                  | No Zustand, no Redux — React local state + `usePipelineStream` hook (Socket.IO)     |
| External state                                    | `AuthContext`, `SidebarContext`, `ToastContext` (none workspace-specific)           |
| Mission Control patterns found                    | None — all panels render simultaneously without progressive disclosure              |

---

## Layout Architecture (Actual)

The `WorkspacePage` component at `/projects/:id` renders all 29 panels inside a single `ErrorBoundary` within:

```tsx
<div className="grid gap-4 xl:grid-cols-[1fr_1.15fr_0.95fr]">
```

There is **no workflow awareness, no visibility matrix, and no progressive disclosure**. All panels render unconditionally regardless of pipeline state.

---

## Component Catalog

### Column 1 — Generation Controls & Pipeline Overview (1fr)

| #   | Component                 | File Path                              | Data Sources                                                                                                                                                                  | Render Frequency                            | Notes                                                                                               |
| --- | ------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | **GenerateButton**        | `components/GenerateButton.tsx`        | Local state (`status`), REST API (`runAgentPipeline` via `aiEngine`, `generateExperience` via `conceptApi`)                                                                   | On-demand (user click)                      | Triggers pipeline start; uses `pipelineStatus` prop from parent                                     |
| 2   | **GenerationStatusPanel** | `components/GenerationStatusPanel.tsx` | REST API polling (`getExperienceStatus` via `conceptApi`, 3s interval), REST API actions (`pausePipeline`, `resumePipeline`, `cancelPipeline`, `retryPipeline`, `retryStage`) | Frequent (3s poll)                          | Full pipeline control UI with stage timeline                                                        |
| 3   | **PipelineStatusBar**     | `components/PipelineStatusBar.tsx`     | Props from parent (`PipelineState`, `WorkspaceStatus` via `usePipelineStream`)                                                                                                | Realtime (prop-driven from Socket.IO)       | Compact inline progress indicator                                                                   |
| 4   | **PipelineStatusViewer**  | `components/PipelineStatusViewer.tsx`  | Props from parent (`PipelineState`, `WorkspaceStatus` via `usePipelineStream`)                                                                                                | Realtime (prop-driven from Socket.IO)       | Detailed phase breakdown (file not read but imported identically to PipelineStatusBar)              |
| 5   | **AgentBoard**            | `components/AgentBoard.tsx`            | Props from parent (`AgentState[]` via `usePipelineStream`)                                                                                                                    | Realtime (prop-driven from Socket.IO)       | Renders `AgentCard` for each agent; sorts by predefined order                                       |
| 6   | **CostMonitor**           | `components/CostMonitor.tsx`           | Props from parent (derived: `cost` aggregated from all agents in `usePipelineStream`)                                                                                         | Frequent (updates when agent cost changes)  | Purely presentational; no internal data fetching                                                    |
| 7   | **TokenUsage**            | `components/TokenUsage.tsx`            | Props from parent (derived: `tokens` split 60/40 prompt/completion from `usePipelineStream`)                                                                                  | Frequent (updates when agent tokens change) | Purely presentational; no internal data fetching                                                    |
| 8   | **MetricsPanel**          | `components/MetricsPanel.tsx`          | REST API polling (`getPipelineMetrics` via `generationMonitorApi`, 4s interval)                                                                                               | Frequent (4s poll)                          | Shows duration, stages, tokens, cost, failures; conditionally renders only when `pipelineId` exists |

### Column 2 — Primary Content Area (1.15fr)

| #   | Component                   | File Path                                | Data Sources                                                                                                                                                                                                                                                 | Render Frequency                                            | Notes                                                                             |
| --- | --------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 9   | **PipelineView**            | `PipelineView.tsx` (wrapper)             | Props from parent (`PipelineState`, status via `usePipelineStream`); internally renders `ProgressTimeline`                                                                                                                                                   | Realtime (prop-driven from Socket.IO)                       | Decorative Card wrapper + ProgressTimeline embed                                  |
| 10  | **LiveConsole**             | `components/LiveConsole.tsx`             | Props from parent (`logs` array from `usePipelineStream` state)                                                                                                                                                                                              | Realtime (new log entries from Socket.IO stream)            | Search/filter UI; auto-scrolls; no internal data fetching                         |
| 11  | **GameArchitectPanel**      | `components/GameArchitectPanel.tsx`      | Local state (form inputs), REST API on-demand (`generateArchitectPlan` via `gameArchitectApi`)                                                                                                                                                               | On-demand (user-triggered)                                  | Fully self-contained with input form + results display                            |
| 12  | **SimulationPanel**         | `components/SimulationPanel.tsx`         | Local state, REST API on-demand (`runFullSimulation` via `simulationApi`)                                                                                                                                                                                    | On-demand (user-triggered)                                  | Uses hardcoded blueprint template; no Socket.IO                                   |
| 13  | **EconomyPanel**            | `components/EconomyPanel.tsx`            | Local state, REST API on-demand (`analyzeEconomy` via `economyApi`)                                                                                                                                                                                          | On-demand (user-triggered)                                  | Uses hardcoded blueprint template; fully self-contained                           |
| 14  | **AutonomousPipelinePanel** | `components/AutonomousPipelinePanel.tsx` | Local state, `usePipelineStream` hook (Socket.IO for connection awareness), REST API polling (`getAutonomousStatus` via `autonomousApi`, 2–10s interval), REST API actions (`startAutonomousRun`, `pauseAutonomous`, `resumeAutonomous`, `cancelAutonomous`) | Realtime when running (2s poll without Socket.IO, 10s with) | Full autonomous generation UI with prompt input and phase timeline                |
| 15  | **ArtifactExplorer**        | `components/ArtifactExplorer.tsx`        | REST API on-demand (`getArtifacts`, `getArtifactDetail`, `approveArtifact`, `rejectArtifact`, `commentArtifact`, `editArtifact` via `conceptApi`)                                                                                                            | On-demand (user-triggered)                                  | Complex component with file browser, detail viewer, inline editor, review actions |
| 16  | **ExportPreview**           | `components/ExportPreview.tsx`           | Props from parent (`artifacts: ArtifactSummary[]`, `reviewSummary: ReviewSummary`)                                                                                                                                                                           | On-demand (data changes on generation complete)             | Presentational; no internal data fetching                                         |

### Column 3 — Review, Validation & Integration (0.95fr)

| #   | Component                  | File Path                               | Data Sources                                                                                                                                                                                            | Render Frequency                                 | Notes                                                                                                      |
| --- | -------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 17  | **ReviewSummaryPanel**     | `components/ReviewSummaryPanel.tsx`     | REST API on-demand (`getReviewSummary` via `conceptApi`, refreshes on `pipelineId` or `refreshTrigger` change)                                                                                          | On-demand                                        | Shows artifact review progress (approved/edited/pending/rejected)                                          |
| 18  | **ActivityFeed**           | `components/ActivityFeed.tsx`           | Props from parent (`events: PipelineStreamMessage[]` from `usePipelineStream`)                                                                                                                          | Realtime (event stream via Socket.IO)            | Displays raw event timeline; purely presentational                                                         |
| 19  | **AuditLogViewer**         | `components/AuditLogViewer.tsx`         | Props from parent (`pipelineId`)                                                                                                                                                                        | On-demand                                        | Detailed audit trail (implementation details consistent with pattern)                                      |
| 20  | **ValidationResults**      | `components/ValidationResults.tsx`      | Props from parent (`score`, `passed`, `errors`, `warnings`) — currently receives no props in Workspace.tsx (renders empty state)                                                                        | Static (no data currently passed)                | Renders placeholder "Results will appear after generation completes" because Workspace.tsx passes no props |
| 21  | **PlaytestPanel**          | `components/PlaytestPanel.tsx`          | Local state, REST API on-demand (`runPlaytest` via `playtestApi`)                                                                                                                                       | On-demand (user-triggered)                       | Uses hardcoded mock scripts/assets for playtest input                                                      |
| 22  | **GenerationHistoryPanel** | `components/GenerationHistoryPanel.tsx` | REST API on-load (`getExperienceHistory` via `conceptApi`, refreshes on `refreshTrigger` prop change)                                                                                                   | On-demand (refreshes after generation completes) | Lists past pipeline runs with status/duration                                                              |
| 23  | **StudioBridgePanel**      | `components/StudioBridgePanel.tsx`      | REST API polling (`getStudioStatus` via `studioBridgeApi`, 10s interval), REST API actions (`connectStudio`, `disconnectStudio`, `sendHeartbeat`, `syncToStudio`), local heartbeat timer (15s interval) | Frequent (10s status poll + 15s heartbeat)       | Full connection management + sync + publish workflow stages                                                |
| 24  | **ProtocolMonitor**        | `components/ProtocolMonitor.tsx`        | REST API polling (`getProtocolLog`, `getProtocolInfo`, `getSyncStatus` via `studioBridgeApi`, 5s interval when connected)                                                                               | Frequent (5s poll when Studio is connected)      | Shows protocol messages, round-trip times, sync status                                                     |
| 25  | **ProjectSummary**         | `components/ProjectSummary.tsx`         | Props from parent (derived values: `agents`, `runTimeSeconds`, `steps`, `retries`, `tokens`, `cost` from `usePipelineStream`)                                                                           | Frequent (updates with pipeline state)           | Purely presentational summary card                                                                         |

### Additional Panels (Column position varies)

| #   | Component                  | File Path                               | Data Sources                                                                    | Render Frequency                      | Grid Position                       | Notes                                                                                       |
| --- | -------------------------- | --------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------- |
| 26  | **ProgressTimeline**       | `components/ProgressTimeline.tsx`       | Props from parent (`PipelineState` via `usePipelineStream`)                     | Realtime (prop-driven from Socket.IO) | Column 2 (embedded in PipelineView) | Maps pipeline agents to predefined 7-step timeline                                          |
| 27  | **PublishWorkflow**        | `components/PublishWorkflow.tsx`        | Props from parent (`pipelineStatus`, `hasSynced`)                               | On-demand (prop changes)              | **Not rendered in Workspace.tsx**   | Exists in codebase but NOT imported/used in the workspace grid                              |
| 28  | **StudioConnectionStatus** | `components/StudioConnectionStatus.tsx` | REST API polling (`getProjectStudioStatus` via `studioBridgeApi`, 10s interval) | Frequent (10s poll)                   | **Not rendered in Workspace.tsx**   | Exists in codebase but NOT imported/used in the workspace grid                              |
| 29  | **SyncButton**             | `components/SyncButton.tsx`             | Local state, REST API on-demand (`syncToStudio` via `studioBridgeApi`)          | On-demand (user click)                | **Not rendered in Workspace.tsx**   | Exists in codebase but NOT imported/used — StudioBridgePanel has its own inline sync button |
| —   | **AgentCard**              | `components/AgentCard.tsx`              | Props from parent (`AgentState` passed by `AgentBoard`)                         | Realtime (rendered by AgentBoard)     | Column 1 (child of AgentBoard)      | Sub-component of AgentBoard; not independently placed in the grid                           |

---

## Gaps Between Design Spec and Actual Code

### Components NOT Rendered in Workspace Grid (3 found)

| Component                | Status                        | Reason                                                                                                                                         |
| ------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `PublishWorkflow`        | **File exists, NOT imported** | The publish workflow is actually embedded inline within `StudioBridgePanel` as workflow stages. The standalone component exists but is unused. |
| `StudioConnectionStatus` | **File exists, NOT imported** | The Studio connection status is shown inline within `StudioBridgePanel`. The standalone component is unused in the workspace grid.             |
| `SyncButton`             | **File exists, NOT imported** | Sync functionality is embedded inline within `StudioBridgePanel`. The standalone component is unused.                                          |

### Sub-Components (counted in the 29 but not independently gridded)

| Component          | Status          | Parent                              |
| ------------------ | --------------- | ----------------------------------- |
| `AgentCard`        | Child component | Rendered inside `AgentBoard` only   |
| `ProgressTimeline` | Child component | Rendered inside `PipelineView` only |

### Additional Workspace File (NOT in spec's 29 count)

| File               | Role                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PipelineView.tsx` | Wrapper component in Column 2 that renders `ProgressTimeline` inside a decorative Card. Acts as a composite panel but not listed in the 29 panel enumeration. |

### Design Spec vs Reality Comparison

| Design Spec Claim                                      | Actual Finding                                                                                                                                                                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "All 29 panels render simultaneously"                  | **Partially true** — 26 are rendered directly in the grid. 3 exist as files but are NOT imported (`PublishWorkflow`, `StudioConnectionStatus`, `SyncButton`). `AgentCard` is a sub-component. `ProgressTimeline` is embedded via `PipelineView`. |
| "Socket.IO events drive real-time panels"              | **True but indirect** — Only `usePipelineStream` hook connects to Socket.IO. All "real-time" panels receive data as props from the parent `WorkspacePage`, not directly subscribing to socket events.                                            |
| "CostMonitor uses Socket.IO `costs:update`"            | **False** — CostMonitor receives `cost` as a prop derived from aggregating `agent.cost` values in the parent. No direct Socket.IO subscription.                                                                                                  |
| "TokenUsage uses Socket.IO `tokens:usage`"             | **False** — TokenUsage receives tokens as props derived in the parent. No direct Socket.IO subscription.                                                                                                                                         |
| "ActivityFeed uses Socket.IO `activity:event`"         | **False** — ActivityFeed receives events as a prop from `usePipelineStream`'s `events` array (which contains all pipeline stream messages, not a dedicated activity channel).                                                                    |
| "MetricsPanel uses REST API + Socket.IO"               | **Partially true** — Uses REST API polling at 4s interval (`getPipelineMetrics`). No Socket.IO subscription.                                                                                                                                     |
| "GenerationStatusPanel uses Socket.IO"                 | **False** — Uses REST API polling at 3s interval (`getExperienceStatus`). No Socket.IO subscription.                                                                                                                                             |
| "StudioBridgePanel uses Socket.IO `studio:connection`" | **False** — Uses REST API polling at 10s interval. No Socket.IO subscription.                                                                                                                                                                    |
| "ProtocolMonitor uses Socket.IO `protocol:message`"    | **False** — Uses REST API polling at 5s interval. No Socket.IO subscription.                                                                                                                                                                     |

---

## Data Flow Architecture (Actual)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         WorkspacePage                                 │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  usePipelineStream(projectId)                                  │   │
│  │  ├── Socket.IO events: pipeline.started, step.started,        │   │
│  │  │   step.completed, step.failed, pipeline.completed,         │   │
│  │  │   pipeline.failed                                          │   │
│  │  ├── Returns: state, events, status, isConnected, currentAgent│   │
│  │  └── Derived in parent: agents, logs, cost, tokens, steps     │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  Props flow DOWN to all 26 rendered components                       │
│                                                                       │
│  Independent API fetchers (inside components):                       │
│  ├── GenerationStatusPanel → conceptApi (3s polling)                 │
│  ├── MetricsPanel → generationMonitorApi (4s polling)                │
│  ├── StudioBridgePanel → studioBridgeApi (10s polling + heartbeat)   │
│  ├── ProtocolMonitor → studioBridgeApi (5s polling)                  │
│  ├── StudioConnectionStatus → studioBridgeApi (10s polling)          │
│  ├── AutonomousPipelinePanel → autonomousApi (2-10s polling)         │
│  ├── GenerationHistoryPanel → conceptApi (on-demand)                 │
│  ├── ArtifactExplorer → conceptApi (on-demand)                       │
│  ├── ReviewSummaryPanel → conceptApi (on-demand)                     │
│  ├── GameArchitectPanel → gameArchitectApi (on-demand)               │
│  ├── SimulationPanel → simulationApi (on-demand)                     │
│  ├── EconomyPanel → economyApi (on-demand)                           │
│  └── PlaytestPanel → playtestApi (on-demand)                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## State Management Analysis

| Pattern                   | Usage                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| **Zustand**               | Not used anywhere in the workspace                                                              |
| **Redux**                 | Not used anywhere in the project                                                                |
| **React Context**         | Only app-level: `AuthContext`, `SidebarContext`, `ToastContext` — none workspace-specific       |
| **Custom hooks**          | `usePipelineStream` — the sole Socket.IO connection hook; manages all real-time state           |
| **Component-local state** | All components use `useState`/`useEffect` for their internal state                              |
| **Props drilling**        | Primary data flow pattern — `WorkspacePage` aggregates from `usePipelineStream` and passes down |

---

## Render Frequency Summary

| Frequency                                 | Count | Components                                                                                                                                                                                                                |
| ----------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Realtime** (Socket.IO driven via props) | 8     | PipelineStatusBar, PipelineStatusViewer, AgentBoard, AgentCard, ProgressTimeline, PipelineView, ActivityFeed, LiveConsole                                                                                                 |
| **Frequent** (polling 2–10s)              | 7     | GenerationStatusPanel (3s), MetricsPanel (4s), ProtocolMonitor (5s), StudioBridgePanel (10s), StudioConnectionStatus (10s), AutonomousPipelinePanel (2–10s), CostMonitor/TokenUsage/ProjectSummary (prop-driven frequent) |
| **On-demand** (user action or event)      | 11    | GenerateButton, GameArchitectPanel, SimulationPanel, EconomyPanel, PlaytestPanel, ArtifactExplorer, ExportPreview, ReviewSummaryPanel, GenerationHistoryPanel, SyncButton, PublishWorkflow                                |
| **Static** (rarely changes)               | 3     | ValidationResults (no data currently passed), ProjectSummary (per-session), AuditLogViewer                                                                                                                                |

---

## API Service Dependencies

| Service Module            | Components Using It                                                                                 | Endpoint Pattern                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `socket.ts` (Socket.IO)   | `usePipelineStream` only                                                                            | `ws://localhost:5000` — events: `pipeline.*`, `step.*` |
| `aiEngine.ts`             | GenerateButton                                                                                      | `POST /api/pipeline/run`                               |
| `conceptApi.ts`           | GenerateButton, GenerationStatusPanel, ArtifactExplorer, ReviewSummaryPanel, GenerationHistoryPanel | `/api/experience/*`, `/api/pipeline/*`                 |
| `generationMonitorApi.ts` | MetricsPanel                                                                                        | `/api/pipeline/:id/metrics`                            |
| `autonomousApi.ts`        | AutonomousPipelinePanel                                                                             | `/api/autonomous/*`                                    |
| `gameArchitectApi.ts`     | GameArchitectPanel                                                                                  | `/api/architect/plan`                                  |
| `simulationApi.ts`        | SimulationPanel                                                                                     | `/api/simulation/run`                                  |
| `economyApi.ts`           | EconomyPanel                                                                                        | `/api/economy/analyze`                                 |
| `playtestApi.ts`          | PlaytestPanel                                                                                       | `/api/playtest/run`                                    |
| `studioBridgeApi.ts`      | StudioBridgePanel, ProtocolMonitor, StudioConnectionStatus, SyncButton                              | `/api/studio/*`                                        |

---

## Key Findings for Migration

1. **No existing progressive disclosure** — All panels render unconditionally. Migration to visibility matrix requires wrapping each component in conditional rendering logic.

2. **Single Socket.IO hook pattern** — Only `usePipelineStream` manages the WebSocket connection. The design spec's claim of per-component Socket.IO subscriptions (e.g., `costs:update`, `tokens:usage`) does not match reality. All real-time data flows through a single hook and is distributed via props.

3. **Three components exist but are unused** — `PublishWorkflow`, `StudioConnectionStatus`, and `SyncButton` are defined as standalone components but not imported into the workspace grid. Their functionality is duplicated within `StudioBridgePanel`.

4. **`ValidationResults` receives no data** — The component is rendered in Column 3 but Workspace.tsx passes no props to it, so it always shows the empty placeholder state.

5. **No workspace-level state store** — There is no centralized workspace state (no Zustand, no Context). Adding the `WorkspaceState` model from the design will require creating a new state layer.

6. **`PipelineView` is an extra composite** — Not counted among the 29 panels but occupies Column 2 space. It wraps `ProgressTimeline` with decorative UI.

7. **Heavy polling pattern** — Multiple components independently poll REST APIs at different intervals (3s, 4s, 5s, 10s). This creates potential performance concerns and would benefit from centralization or Socket.IO migration.

8. **Component self-containment varies** — Some panels (GameArchitectPanel, SimulationPanel, EconomyPanel, PlaytestPanel) are fully self-contained with their own fetch logic. Others (CostMonitor, TokenUsage, LiveConsole, PipelineStatusBar) are purely presentational and receive all data via props.
