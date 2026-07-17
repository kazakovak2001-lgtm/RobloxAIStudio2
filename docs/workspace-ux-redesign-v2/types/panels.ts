/**
 * Workspace UX Redesign V2 — Panel Component Enumeration and Metadata
 *
 * This file enumerates all 29 panel components in the current workspace
 * and defines metadata describing each panel's purpose, data sources,
 * grid position, and render frequency. These serve as documentation-only
 * type contracts for the Mission Control migration.
 *
 * @see Requirements 1.1 (catalog all 29 panels), 1.5 (data dependencies),
 *      11.1 (migration table mapping)
 */

// ---------------------------------------------------------------------------
// Panel Identifier Union Type
// ---------------------------------------------------------------------------

/**
 * Union type enumerating all 29 panel components present in the current
 * workspace at `/projects/:id`. Each panel is a distinct UI module with
 * its own data sources and rendering lifecycle.
 */
export type PanelId =
  /** AI agent execution board — real-time pipeline agent status and progress */
  | "AgentBoard"
  /** Live console output — streaming logs from AI agents and system events */
  | "LiveConsole"
  /** Cost monitoring — cumulative API cost tracking across providers */
  | "CostMonitor"
  /** Token usage — per-model token consumption breakdown */
  | "TokenUsage"
  /** Project summary — high-level project metadata and generation stats */
  | "ProjectSummary"
  /** Activity feed — chronological stream of workspace events */
  | "ActivityFeed"
  /** Generate button — primary action to initiate AI generation pipeline */
  | "GenerateButton"
  /** Generation status — current generation state and progress indicator */
  | "GenerationStatusPanel"
  /** Generation history — list of past generation runs with outcomes */
  | "GenerationHistoryPanel"
  /** Artifact explorer — file browser for AI-generated code artifacts */
  | "ArtifactExplorer"
  /** Export preview — preview of artifacts formatted for Roblox Studio export */
  | "ExportPreview"
  /** Review summary — AI-generated code review with quality scores */
  | "ReviewSummaryPanel"
  /** Validation results — automated test and lint check outcomes */
  | "ValidationResults"
  /** Pipeline status bar — compact inline progress for the active pipeline */
  | "PipelineStatusBar"
  /** Pipeline status viewer — detailed phase-by-phase pipeline breakdown */
  | "PipelineStatusViewer"
  /** Studio bridge — Roblox Studio connection management and sync controls */
  | "StudioBridgePanel"
  /** Protocol monitor — low-level protocol message inspector for debugging */
  | "ProtocolMonitor"
  /** Game architect — game structure planning with genre and mechanics config */
  | "GameArchitectPanel"
  /** Simulation — gameplay simulation metrics and grade visualization */
  | "SimulationPanel"
  /** Playtest — automated playtest execution and performance reporting */
  | "PlaytestPanel"
  /** Economy — in-game economy balance analysis and stability charts */
  | "EconomyPanel"
  /** Autonomous pipeline — full pipeline orchestration with pause/resume controls */
  | "AutonomousPipelinePanel"
  /** Metrics — aggregated performance and quality metrics dashboard */
  | "MetricsPanel"
  /** Audit log viewer — detailed audit trail of all system actions */
  | "AuditLogViewer"
  /** Progress timeline — visual timeline of pipeline phase progression */
  | "ProgressTimeline"
  /** Publish workflow — step-by-step publishing flow to Roblox platform */
  | "PublishWorkflow"
  /** Studio connection status — real-time Roblox Studio link status indicator */
  | "StudioConnectionStatus"
  /** Sync button — one-click sync of generated assets to Roblox Studio */
  | "SyncButton"
  /** Agent card — compact individual agent status card within the board */
  | "AgentCard";

// ---------------------------------------------------------------------------
// Supporting Types
// ---------------------------------------------------------------------------

/**
 * Identifies the column position in the current 3-column CSS Grid layout:
 * `xl:grid-cols-[1fr_1.15fr_0.95fr]`
 */
export type GridColumn = "column-1" | "column-2" | "column-3";

/**
 * Render frequency classification indicating how often a panel updates
 * its DOM during active use.
 */
export type RenderFrequency =
  /** Real-time: updates via Socket.IO or streaming at sub-second intervals */
  | "realtime"
  /** Frequent: updates every 1–5 seconds (polling or periodic refresh) */
  | "frequent"
  /** On-demand: updates only in response to user action or discrete events */
  | "on-demand"
  /** Static: renders once and rarely changes during a session */
  | "static";

/**
 * Describes a data source that a panel depends on for rendering.
 */
export interface PanelDataSource {
  /** Type of data source */
  readonly type: "socket-io" | "rest-api" | "local-state" | "derived";
  /** Identifier (event name, endpoint path, or state slice key) */
  readonly identifier: string;
  /** Human-readable description of what this source provides */
  readonly description: string;
}

// ---------------------------------------------------------------------------
// Panel Metadata Type
// ---------------------------------------------------------------------------

/**
 * Metadata describing a single panel component's role, data dependencies,
 * layout position, and update characteristics. Used for migration planning
 * and the progressive disclosure visibility matrix.
 */
export interface PanelMetadata {
  /** Unique panel identifier matching the PanelId union */
  readonly id: PanelId;
  /** Human-readable display name */
  readonly name: string;
  /** Brief description of the panel's purpose */
  readonly description: string;
  /** Data sources this panel reads from during operation */
  readonly dataSources: readonly PanelDataSource[];
  /** Current grid column in the existing 3-column layout */
  readonly currentGridColumn: GridColumn;
  /** How frequently this panel re-renders during active use */
  readonly renderFrequency: RenderFrequency;
}

// ---------------------------------------------------------------------------
// Panel Metadata Registry (const documentation)
// ---------------------------------------------------------------------------

/**
 * Complete metadata catalog for all 29 workspace panel components.
 * This serves as the authoritative reference for migration planning,
 * documenting each panel's current position, data dependencies, and
 * update frequency.
 *
 * **Column 1 (1fr):** Generation controls, pipeline overview, cost tracking
 * **Column 2 (1.15fr):** Primary content — console, simulation, pipeline view
 * **Column 3 (0.95fr):** Review, validation, history, and Roblox integration
 */
export const PANEL_METADATA: readonly PanelMetadata[] = [
  // =========================================================================
  // Column 1 — Generation Controls & Pipeline Overview (1fr)
  // =========================================================================

  /**
   * GenerateButton
   * Primary action trigger for the AI generation pipeline.
   * Data: Local generation state (idle/running), project configuration.
   */
  {
    id: "GenerateButton",
    name: "Generate Button",
    description:
      "Primary call-to-action initiating the AI generation pipeline. Disabled during active runs.",
    dataSources: [
      {
        type: "local-state",
        identifier: "generationStatus",
        description: "Current pipeline execution state (idle, running, paused)",
      },
    ],
    currentGridColumn: "column-1",
    renderFrequency: "on-demand",
  },

  /**
   * GenerationStatusPanel
   * Displays the current generation phase, elapsed time, and progress bar.
   * Data: Socket.IO `generation:status` events streaming phase transitions.
   */
  {
    id: "GenerationStatusPanel",
    name: "Generation Status",
    description:
      "Real-time generation progress indicator showing active phase, elapsed time, and completion percentage.",
    dataSources: [
      {
        type: "socket-io",
        identifier: "generation:status",
        description:
          "Streaming generation phase transitions and progress updates",
      },
      {
        type: "local-state",
        identifier: "generationStatus",
        description: "Local generation state for UI synchronization",
      },
    ],
    currentGridColumn: "column-1",
    renderFrequency: "realtime",
  },

  /**
   * PipelineStatusBar
   * Compact horizontal progress bar summarizing overall pipeline completion.
   * Data: Socket.IO `pipeline:progress` with percentage and phase index.
   */
  {
    id: "PipelineStatusBar",
    name: "Pipeline Status Bar",
    description:
      "Compact inline progress indicator for the active pipeline showing overall completion percentage.",
    dataSources: [
      {
        type: "socket-io",
        identifier: "pipeline:progress",
        description: "Pipeline completion percentage and active phase index",
      },
    ],
    currentGridColumn: "column-1",
    renderFrequency: "realtime",
  },

  /**
   * PipelineStatusViewer
   * Detailed phase-by-phase breakdown of the pipeline execution.
   * Data: Socket.IO `pipeline:phases` providing per-phase status objects.
   */
  {
    id: "PipelineStatusViewer",
    name: "Pipeline Status Viewer",
    description:
      "Detailed breakdown of each pipeline phase showing status, duration, and output for every stage.",
    dataSources: [
      {
        type: "socket-io",
        identifier: "pipeline:phases",
        description: "Per-phase status objects with timing and error details",
      },
    ],
    currentGridColumn: "column-1",
    renderFrequency: "realtime",
  },

  /**
   * AgentBoard
   * Core real-time display of all AI agents in the pipeline.
   * Data: Socket.IO `agents:state` streaming agent list with status per agent.
   * Also uses `usePipelineStream` hook for progress, tokens, and cost.
   */
  {
    id: "AgentBoard",
    name: "Agent Board",
    description:
      "Real-time AI agent execution board displaying all pipeline agents with live status, progress, token usage, and cost.",
    dataSources: [
      {
        type: "socket-io",
        identifier: "agents:state",
        description:
          "Live agent status updates (idle, running, completed, failed)",
      },
      {
        type: "socket-io",
        identifier: "pipeline:stream",
        description:
          "Streaming progress, token counts, and cost via usePipelineStream",
      },
    ],
    currentGridColumn: "column-1",
    renderFrequency: "realtime",
  },

  /**
   * CostMonitor
   * Tracks cumulative API costs across all AI providers.
   * Data: Socket.IO `costs:update` with running totals per provider/model.
   */
  {
    id: "CostMonitor",
    name: "Cost Monitor",
    description:
      "Cumulative API cost tracker showing spend per provider, per model, and total session cost.",
    dataSources: [
      {
        type: "socket-io",
        identifier: "costs:update",
        description: "Running cost totals per provider and model",
      },
    ],
    currentGridColumn: "column-1",
    renderFrequency: "frequent",
  },

  /**
   * TokenUsage
   * Per-model token consumption breakdown (prompt + completion tokens).
   * Data: Socket.IO `tokens:usage` with per-agent token counts.
   */
  {
    id: "TokenUsage",
    name: "Token Usage",
    description:
      "Per-model token consumption breakdown showing prompt tokens, completion tokens, and total across agents.",
    dataSources: [
      {
        type: "socket-io",
        identifier: "tokens:usage",
        description: "Per-agent and per-model token consumption data",
      },
    ],
    currentGridColumn: "column-1",
    renderFrequency: "frequent",
  },

  /**
   * MetricsPanel
   * Aggregated quality and performance metrics dashboard.
   * Data: REST API `/api/metrics` for historical data; Socket.IO for live updates.
   */
  {
    id: "MetricsPanel",
    name: "Metrics Panel",
    description:
      "Aggregated performance and quality metrics dashboard showing generation success rates, average durations, and trend data.",
    dataSources: [
      {
        type: "rest-api",
        identifier: "/api/projects/:id/metrics",
        description:
          "Historical metrics data (success rates, durations, quality scores)",
      },
      {
        type: "socket-io",
        identifier: "metrics:live",
        description: "Live metric updates during active generation",
      },
    ],
    currentGridColumn: "column-1",
    renderFrequency: "frequent",
  },

  // =========================================================================
  // Column 2 — Primary Content Area (1.15fr)
  // =========================================================================

  /**
   * LiveConsole
   * Streaming log output from AI agents and system processes.
   * Data: Socket.IO `console:output` with log lines, levels, and timestamps.
   */
  {
    id: "LiveConsole",
    name: "Live Console",
    description:
      "Real-time streaming console displaying log output from AI agents, system events, and error traces.",
    dataSources: [
      {
        type: "socket-io",
        identifier: "console:output",
        description: "Streaming log lines with severity level and source agent",
      },
    ],
    currentGridColumn: "column-2",
    renderFrequency: "realtime",
  },

  /**
   * GameArchitectPanel
   * Game structure planning interface with genre selection and mechanics config.
   * Data: REST API for game templates; local state for user configuration.
   */
  {
    id: "GameArchitectPanel",
    name: "Game Architect",
    description:
      "Game structure planning interface for genre selection, mechanics configuration, and architecture visualization.",
    dataSources: [
      {
        type: "rest-api",
        identifier: "/api/templates/genres",
        description: "Available game genre templates and mechanics catalogs",
      },
      {
        type: "local-state",
        identifier: "gameConfig",
        description: "User-configured game architecture settings",
      },
    ],
    currentGridColumn: "column-2",
    renderFrequency: "on-demand",
  },

  /**
   * SimulationPanel
   * Gameplay simulation results with metrics, grades, and engagement scores.
   * Data: REST API `/api/simulation/results`; Socket.IO for live simulation runs.
   */
  {
    id: "SimulationPanel",
    name: "Simulation Panel",
    description:
      "Gameplay simulation visualization showing quality grades, engagement scores, and balance metrics.",
    dataSources: [
      {
        type: "rest-api",
        identifier: "/api/projects/:id/simulation",
        description:
          "Simulation result data with grades and engagement metrics",
      },
      {
        type: "socket-io",
        identifier: "simulation:progress",
        description: "Live simulation execution progress during active runs",
      },
    ],
    currentGridColumn: "column-2",
    renderFrequency: "frequent",
  },

  /**
   * EconomyPanel
   * In-game economy balance analysis with stability charts and recommendations.
   * Data: REST API `/api/simulation/economy`; derived from simulation results.
   */
  {
    id: "EconomyPanel",
    name: "Economy Panel",
    description:
      "In-game economy balance analysis showing currency flow, item pricing stability, and economic health indicators.",
    dataSources: [
      {
        type: "rest-api",
        identifier: "/api/projects/:id/economy",
        description:
          "Economy simulation data with balance scores and recommendations",
      },
      {
        type: "derived",
        identifier: "simulationResults",
        description: "Derived from SimulationPanel results for economic subset",
      },
    ],
    currentGridColumn: "column-2",
    renderFrequency: "on-demand",
  },

  /**
   * AutonomousPipelinePanel
   * Full pipeline orchestration controls with pause, resume, and cancel.
   * Data: Socket.IO `pipeline:control` for state; local state for user actions.
   */
  {
    id: "AutonomousPipelinePanel",
    name: "Autonomous Pipeline",
    description:
      "Full pipeline orchestration panel with start/pause/resume/cancel controls and phase-level management.",
    dataSources: [
      {
        type: "socket-io",
        identifier: "pipeline:control",
        description: "Pipeline execution control state and available actions",
      },
      {
        type: "local-state",
        identifier: "pipelineActions",
        description: "User-initiated pipeline control actions",
      },
    ],
    currentGridColumn: "column-2",
    renderFrequency: "realtime",
  },

  /**
   * ArtifactExplorer
   * File browser for AI-generated Lua scripts, assets, and configurations.
   * Data: REST API `/api/artifacts`; refreshes after each generation phase.
   */
  {
    id: "ArtifactExplorer",
    name: "Artifact Explorer",
    description:
      "File browser for AI-generated code artifacts (Lua scripts, JSON configs, asset manifests) with preview and download.",
    dataSources: [
      {
        type: "rest-api",
        identifier: "/api/projects/:id/artifacts",
        description:
          "Generated artifact file listing with metadata and content",
      },
    ],
    currentGridColumn: "column-2",
    renderFrequency: "on-demand",
  },

  /**
   * ExportPreview
   * Preview of generated artifacts formatted for Roblox Studio compatibility.
   * Data: Derived from ArtifactExplorer content; local formatting state.
   */
  {
    id: "ExportPreview",
    name: "Export Preview",
    description:
      "Preview of artifacts formatted for Roblox Studio export, showing file structure and compatibility notes.",
    dataSources: [
      {
        type: "derived",
        identifier: "artifactContent",
        description: "Derived from ArtifactExplorer for export formatting",
      },
      {
        type: "local-state",
        identifier: "exportConfig",
        description: "User export configuration (target format, options)",
      },
    ],
    currentGridColumn: "column-2",
    renderFrequency: "on-demand",
  },

  // =========================================================================
  // Column 3 — Review, Validation & Integration (0.95fr)
  // =========================================================================

  /**
   * ReviewSummaryPanel
   * AI-generated code review with quality scores and improvement suggestions.
   * Data: REST API `/api/reviews`; generated after validation phase completes.
   */
  {
    id: "ReviewSummaryPanel",
    name: "Review Summary",
    description:
      "AI-generated code review summary with quality scores, issue counts, and improvement suggestions.",
    dataSources: [
      {
        type: "rest-api",
        identifier: "/api/projects/:id/reviews",
        description: "Code review results with scores and annotated issues",
      },
    ],
    currentGridColumn: "column-3",
    renderFrequency: "on-demand",
  },

  /**
   * ActivityFeed
   * Chronological stream of workspace events (generations, errors, completions).
   * Data: Socket.IO `activity:event` for real-time; REST API for history.
   */
  {
    id: "ActivityFeed",
    name: "Activity Feed",
    description:
      "Chronological event stream showing generation starts, completions, errors, and user actions.",
    dataSources: [
      {
        type: "socket-io",
        identifier: "activity:event",
        description: "Real-time workspace activity events",
      },
      {
        type: "rest-api",
        identifier: "/api/projects/:id/activity",
        description: "Historical activity feed for session reconstruction",
      },
    ],
    currentGridColumn: "column-3",
    renderFrequency: "realtime",
  },

  /**
   * AuditLogViewer
   * Detailed audit trail of all system actions for debugging and compliance.
   * Data: REST API `/api/audit-log` with pagination and filtering.
   */
  {
    id: "AuditLogViewer",
    name: "Audit Log Viewer",
    description:
      "Detailed audit trail showing all system actions, API calls, and state changes with timestamps and metadata.",
    dataSources: [
      {
        type: "rest-api",
        identifier: "/api/projects/:id/audit-log",
        description: "Paginated audit log entries with filtering support",
      },
    ],
    currentGridColumn: "column-3",
    renderFrequency: "on-demand",
  },

  /**
   * ValidationResults
   * Automated test, lint, and quality check outcomes.
   * Data: REST API `/api/validation`; generated after validation phase.
   */
  {
    id: "ValidationResults",
    name: "Validation Results",
    description:
      "Automated validation outcomes showing lint errors, test results, type check status, and quality gates.",
    dataSources: [
      {
        type: "rest-api",
        identifier: "/api/projects/:id/validation",
        description: "Validation results with per-check pass/fail and details",
      },
    ],
    currentGridColumn: "column-3",
    renderFrequency: "on-demand",
  },

  /**
   * PlaytestPanel
   * Automated playtest execution and performance reporting.
   * Data: Socket.IO `playtest:progress` during runs; REST API for results.
   */
  {
    id: "PlaytestPanel",
    name: "Playtest Panel",
    description:
      "Automated playtest execution interface showing test progress, performance metrics, and pass/fail outcomes.",
    dataSources: [
      {
        type: "socket-io",
        identifier: "playtest:progress",
        description: "Live playtest execution progress and interim results",
      },
      {
        type: "rest-api",
        identifier: "/api/projects/:id/playtest",
        description: "Completed playtest results with performance data",
      },
    ],
    currentGridColumn: "column-3",
    renderFrequency: "frequent",
  },

  /**
   * GenerationHistoryPanel
   * List of past generation runs with outcomes, durations, and cost.
   * Data: REST API `/api/generations` with pagination.
   */
  {
    id: "GenerationHistoryPanel",
    name: "Generation History",
    description:
      "Historical list of past generation runs showing prompts, outcomes, durations, cost, and artifact links.",
    dataSources: [
      {
        type: "rest-api",
        identifier: "/api/projects/:id/generations",
        description: "Paginated generation history with outcome metadata",
      },
    ],
    currentGridColumn: "column-3",
    renderFrequency: "on-demand",
  },

  /**
   * StudioBridgePanel
   * Roblox Studio connection management — connect, disconnect, sync status.
   * Data: Socket.IO `studio:connection` for real-time bridge state.
   */
  {
    id: "StudioBridgePanel",
    name: "Studio Bridge",
    description:
      "Roblox Studio connection management panel with connect/disconnect controls, sync history, and error diagnostics.",
    dataSources: [
      {
        type: "socket-io",
        identifier: "studio:connection",
        description: "Real-time Roblox Studio bridge connection state",
      },
    ],
    currentGridColumn: "column-3",
    renderFrequency: "frequent",
  },

  /**
   * ProtocolMonitor
   * Low-level protocol message inspector for debugging bridge communication.
   * Data: Socket.IO `protocol:message` with raw message payloads.
   */
  {
    id: "ProtocolMonitor",
    name: "Protocol Monitor",
    description:
      "Low-level protocol message inspector for debugging Roblox Studio bridge communication and Socket.IO traffic.",
    dataSources: [
      {
        type: "socket-io",
        identifier: "protocol:message",
        description: "Raw protocol messages between client and Studio bridge",
      },
    ],
    currentGridColumn: "column-3",
    renderFrequency: "realtime",
  },

  /**
   * ProjectSummary
   * High-level project metadata: name, genre, generation count, last activity.
   * Data: REST API `/api/projects/:id`; refreshes on project state changes.
   */
  {
    id: "ProjectSummary",
    name: "Project Summary",
    description:
      "High-level project overview showing name, genre, generation count, last activity, and quick stats.",
    dataSources: [
      {
        type: "rest-api",
        identifier: "/api/projects/:id",
        description: "Project metadata including name, genre, and stats",
      },
    ],
    currentGridColumn: "column-3",
    renderFrequency: "static",
  },

  // =========================================================================
  // Additional Panels (present in workspace, positioned contextually)
  // =========================================================================

  /**
   * ProgressTimeline
   * Visual timeline showing pipeline phase progression with timing data.
   * Data: Derived from pipeline phase events; Socket.IO `pipeline:phases`.
   */
  {
    id: "ProgressTimeline",
    name: "Progress Timeline",
    description:
      "Visual timeline of pipeline phase progression showing duration, overlap, and completion status per phase.",
    dataSources: [
      {
        type: "socket-io",
        identifier: "pipeline:phases",
        description:
          "Phase timing and completion data for timeline visualization",
      },
    ],
    currentGridColumn: "column-1",
    renderFrequency: "realtime",
  },

  /**
   * PublishWorkflow
   * Step-by-step publishing flow to the Roblox platform.
   * Data: REST API `/api/publish`; local workflow state tracking.
   */
  {
    id: "PublishWorkflow",
    name: "Publish Workflow",
    description:
      "Step-by-step publishing workflow guiding users through validation, packaging, and deployment to Roblox.",
    dataSources: [
      {
        type: "rest-api",
        identifier: "/api/projects/:id/publish",
        description:
          "Publishing state, available targets, and deployment status",
      },
      {
        type: "local-state",
        identifier: "publishStep",
        description: "Current step in the multi-step publish workflow",
      },
    ],
    currentGridColumn: "column-3",
    renderFrequency: "on-demand",
  },

  /**
   * StudioConnectionStatus
   * Compact indicator showing real-time Roblox Studio link status.
   * Data: Socket.IO `studio:connection` (same as StudioBridgePanel).
   */
  {
    id: "StudioConnectionStatus",
    name: "Studio Connection Status",
    description:
      "Compact status indicator showing Roblox Studio connection state (connected, disconnected, reconnecting).",
    dataSources: [
      {
        type: "socket-io",
        identifier: "studio:connection",
        description: "Real-time Studio bridge connection state",
      },
    ],
    currentGridColumn: "column-3",
    renderFrequency: "frequent",
  },

  /**
   * SyncButton
   * One-click sync of generated assets to the connected Roblox Studio instance.
   * Data: Local state (sync available based on artifacts + connection).
   */
  {
    id: "SyncButton",
    name: "Sync Button",
    description:
      "One-click action to synchronize generated artifacts to the connected Roblox Studio instance.",
    dataSources: [
      {
        type: "local-state",
        identifier: "syncAvailability",
        description:
          "Whether sync is available (requires artifacts + active connection)",
      },
      {
        type: "derived",
        identifier: "studioConnection",
        description:
          "Derived from StudioConnectionStatus for availability check",
      },
    ],
    currentGridColumn: "column-3",
    renderFrequency: "on-demand",
  },

  /**
   * AgentCard
   * Compact individual agent status card rendered within the AgentBoard.
   * Data: Socket.IO `agents:state` (subset for a single agent).
   */
  {
    id: "AgentCard",
    name: "Agent Card",
    description:
      "Compact card displaying a single agent's status, progress percentage, model name, and accumulated cost.",
    dataSources: [
      {
        type: "socket-io",
        identifier: "agents:state",
        description: "Per-agent state update (progress, status, tokens, cost)",
      },
    ],
    currentGridColumn: "column-1",
    renderFrequency: "realtime",
  },
] as const;
