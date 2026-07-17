/**
 * workspace/core/constants.ts
 *
 * Default values and static configuration for the workspace architecture.
 * All constants are immutable and can be used across the application.
 */

import type {
  WorkflowPhase,
  CanvasMode,
  WorkspaceState,
  ModeState,
} from "./types";

// ─── Ordered Phase & Mode Arrays ────────────────────────────────────────────

/** All 8 workflow phases in sequential order */
export const WORKFLOW_PHASES: readonly WorkflowPhase[] = [
  "generate",
  "planning",
  "generation",
  "validation",
  "simulation",
  "economy",
  "playtest",
  "export",
] as const;

/** All 6 canvas display modes */
export const CANVAS_MODES: readonly CanvasMode[] = [
  "build",
  "code",
  "simulation",
  "pipeline",
  "playtest",
  "analytics",
] as const;

// ─── Phase → Default Canvas Mode ───────────────────────────────────────────

/** Maps each workflow phase to its default canvas mode */
export const PHASE_TO_DEFAULT_MODE: Record<WorkflowPhase, CanvasMode> = {
  generate: "build",
  planning: "pipeline",
  generation: "code",
  validation: "pipeline",
  simulation: "simulation",
  economy: "analytics",
  playtest: "playtest",
  export: "build",
} as const;

// ─── Zone Default Dimensions ────────────────────────────────────────────────

/** Default zone dimensions keyed by breakpoint */
export const ZONE_DEFAULTS = {
  desktop: {
    explorerWidth: 240,
    propertiesWidth: 300,
    aiCommandHeight: 200,
  },
  tablet: {
    explorerWidth: 48,
    propertiesWidth: 0,
    aiCommandHeight: 44,
  },
  mobile: {
    explorerWidth: 0,
    propertiesWidth: 0,
    aiCommandHeight: 44,
  },
} as const;

// ─── Default Mode State ─────────────────────────────────────────────────────

function createDefaultModeState(): ModeState {
  return {
    scrollPosition: { x: 0, y: 0 },
    formState: {},
    selection: null,
    lastActivated: 0,
  };
}

/** Initial mode states for all canvas modes */
function createDefaultModeStates(): Record<CanvasMode, ModeState> {
  return {
    build: createDefaultModeState(),
    code: createDefaultModeState(),
    simulation: createDefaultModeState(),
    pipeline: createDefaultModeState(),
    playtest: createDefaultModeState(),
    analytics: createDefaultModeState(),
  };
}

// ─── Default Workspace State ────────────────────────────────────────────────

/** Initial state for a fresh workspace instance */
export const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  projectId: null,
  currentPhase: "generate",
  completedPhases: [],
  activeCanvasMode: "build",
  zones: {
    explorer: { collapsed: false, width: ZONE_DEFAULTS.desktop.explorerWidth },
    properties: {
      collapsed: false,
      width: ZONE_DEFAULTS.desktop.propertiesWidth,
    },
    aiCommand: {
      collapsed: false,
      height: ZONE_DEFAULTS.desktop.aiCommandHeight,
    },
  },
  propertiesContext: {
    source: "workflow-phase",
  },
  aiCommandState: {
    height: "default",
    activeTab: "console",
    draftPrompt: "",
    outputHistory: [],
  },
  manuallyRevealedPanels: [],
  manuallyHiddenPanels: [],
  modeStates: createDefaultModeStates(),
} as const;
