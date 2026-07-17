/**
 * workspace/core/types.ts
 *
 * Core type definitions for the workspace architecture layer.
 * Defines the shape of workspace state, zone layout, and panel visibility.
 *
 * NO implementations — types only.
 */

// ─── Workflow & Canvas ──────────────────────────────────────────────────────

/** Sequential pipeline phases (8 stages from concept to export) */
export type WorkflowPhase =
  | "generate"
  | "planning"
  | "generation"
  | "validation"
  | "simulation"
  | "economy"
  | "playtest"
  | "export";

/** Canvas display modes (what the main canvas area renders) */
export type CanvasMode =
  "build" | "code" | "simulation" | "pipeline" | "playtest" | "analytics";

// ─── Zones & Panels ─────────────────────────────────────────────────────────

/** Identifiers for the 5 workspace zones */
export type ZoneId =
  "command-bar" | "explorer" | "canvas" | "properties" | "ai-command";

/** Panel visibility states within a phase */
export type PanelVisibility = "visible" | "hidden" | "on-demand";

/** Collapse/size state for a resizable zone */
export interface ZoneState {
  collapsed: boolean;
  /** Width in px (for side zones: explorer, properties) */
  width?: number;
  /** Height in px (for bottom zone: ai-command) */
  height?: number;
}

// ─── Properties Panel ───────────────────────────────────────────────────────

/** What drives the current properties panel content */
export interface PropertiesContext {
  source: "selection" | "canvas-mode" | "workflow-phase";
  selectedEntity?: {
    type: "agent" | "pipeline-phase" | "artifact" | "file";
    id: string;
  };
}

// ─── Per-Mode State ─────────────────────────────────────────────────────────

/** Preserved state for each canvas mode (survives mode switching) */
export interface ModeState {
  scrollPosition: { x: number; y: number };
  formState: Record<string, unknown>;
  selection: string | null;
  lastActivated: number;
}

// ─── AI Command Center ──────────────────────────────────────────────────────

/** State for the bottom AI Command panel */
export interface AICommandState {
  height: "collapsed" | "default" | "expanded";
  activeTab: "console" | "activity";
  draftPrompt: string;
  outputHistory: string[];
}

// ─── Main Workspace State ───────────────────────────────────────────────────

/** Complete workspace state shape managed by WorkspaceProvider */
export interface WorkspaceState {
  projectId: string | null;
  currentPhase: WorkflowPhase;
  completedPhases: WorkflowPhase[];
  activeCanvasMode: CanvasMode;
  zones: {
    explorer: ZoneState;
    properties: ZoneState;
    aiCommand: ZoneState;
  };
  propertiesContext: PropertiesContext;
  aiCommandState: AICommandState;
  manuallyRevealedPanels: string[];
  manuallyHiddenPanels: string[];
  modeStates: Record<CanvasMode, ModeState>;
}
