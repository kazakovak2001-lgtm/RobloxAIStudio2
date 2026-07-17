/**
 * Workspace UX Redesign V2 — AI Mission Control
 * Core Workspace State Type Definitions
 *
 * These interfaces define the runtime state model for the Mission Control
 * workspace, including workflow phase tracking, canvas mode management,
 * zone collapse states, and per-mode preserved state.
 *
 * @see design.md — Data Models > Workspace State Model
 * @requirements 2.6, 9.1, 9.2, 9.3, 9.4
 */

import type { PanelId } from "./panels";

/**
 * The 8 sequential workflow phases that drive the generation pipeline.
 * Each phase determines panel visibility, properties content, and AI Command Center state.
 */
export type WorkflowPhase =
  | "generate"
  | "planning"
  | "generation"
  | "validation"
  | "simulation"
  | "economy"
  | "playtest"
  | "export";

/**
 * The 6 mutually exclusive display modes for the Center Canvas zone.
 * Each mode presents a different primary view and set of panel components.
 */
export type CanvasMode =
  "build" | "code" | "simulation" | "pipeline" | "playtest" | "analytics";

/**
 * Collapse and dimension state for a single zone.
 * Side zones (explorer, properties) use `width`; bottom zone (aiCommand) uses `height`.
 */
export interface ZoneState {
  collapsed: boolean;
  /** Current width in pixels (for side zones: explorer, properties) */
  width?: number;
  /** Current height in pixels (for AI Command Center) */
  height?: number;
}

/**
 * Describes the source of current Properties Panel content and any
 * explicitly selected entity driving the context.
 *
 * Priority system:
 *   1. Explicit user selection (clicking an agent/element)
 *   2. Active Canvas Mode default content
 *   3. Current Workflow Phase fallback
 */
export interface PropertiesContext {
  source: "selection" | "canvas-mode" | "workflow-phase";
  selectedEntity?: {
    type: "agent" | "pipeline-phase" | "artifact" | "file";
    id: string;
  };
}

/**
 * Per-mode preserved state ensuring that switching Canvas Modes does not
 * lose scroll position, form data, or selection. Inactive modes maintain
 * this state in memory (unmounted from DOM after 60s of inactivity).
 */
export interface ModeState {
  scrollPosition: { x: number; y: number };
  formState: Record<string, unknown>;
  selection: string | null;
  /** Timestamp (ms) of last activation — used for 60s inactivity cleanup */
  lastActivated: number;
}

/**
 * Top-level workspace state driving the entire Mission Control interface.
 * Combines workflow tracking, canvas mode, zone dimensions, panel overrides,
 * properties context, and per-mode preserved state.
 */
export interface WorkspaceState {
  /** Current workflow phase (drives visibility matrix) */
  currentPhase: WorkflowPhase;
  /** Phases the user has completed (allows jump-back without confirmation) */
  completedPhases: WorkflowPhase[];

  /** Canvas mode (may differ from phase-default if user manually switched) */
  activeCanvasMode: CanvasMode;

  /** Zone collapse and dimension states */
  zones: {
    explorer: ZoneState;
    properties: ZoneState;
    aiCommand: ZoneState;
  };

  /** Panels the user manually revealed via "More" menu or search */
  manuallyRevealedPanels: PanelId[];
  /** Panels the user manually hidden */
  manuallyHiddenPanels: PanelId[];

  /** Properties panel context (what's driving current content) */
  propertiesContext: PropertiesContext;

  /** Per-mode preserved state (scroll, form, selection) */
  modeStates: Record<CanvasMode, ModeState>;
}
