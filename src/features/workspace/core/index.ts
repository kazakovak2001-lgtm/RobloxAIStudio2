/**
 * workspace/core/index.ts
 *
 * Barrel export for the workspace core architecture layer.
 * This module provides the foundation for workspace state management,
 * panel registration, responsive layout, and user preferences.
 */

// ─── Core Types ─────────────────────────────────────────────────────────────

export type {
  WorkflowPhase,
  CanvasMode,
  ZoneId,
  PanelVisibility,
  ZoneState,
  PropertiesContext,
  ModeState,
  AICommandState,
  WorkspaceState,
} from "./types";

// ─── Constants ──────────────────────────────────────────────────────────────

export {
  WORKFLOW_PHASES,
  CANVAS_MODES,
  PHASE_TO_DEFAULT_MODE,
  ZONE_DEFAULTS,
  DEFAULT_WORKSPACE_STATE,
} from "./constants";

// ─── Provider & Hook ────────────────────────────────────────────────────────

export { WorkspaceProvider, useWorkspace } from "./WorkspaceProvider";

// ─── Panel Registry ─────────────────────────────────────────────────────────

export type { PanelRegistration, PanelCategory } from "./panel-registry";
export {
  registerPanel,
  getPanel,
  getPanelsForZone,
  getVisiblePanels,
  getOnDemandPanels,
  getAllPanelIds,
  clearRegistry,
} from "./panel-registry";

// ─── Selectors ──────────────────────────────────────────────────────────────

export {
  selectCurrentPhase,
  selectActiveMode,
  selectVisiblePanels,
  selectZoneState,
  selectPropertiesContent,
} from "./selectors";

// ─── Preferences ────────────────────────────────────────────────────────────

export type { WorkspacePreferences } from "./preferences";
export {
  loadPreferences,
  savePreferences,
  DEFAULT_PREFERENCES,
} from "./preferences";

// ─── Responsive ─────────────────────────────────────────────────────────────

export type { ZoneDefaults, ResponsiveBreakpointConfig } from "./responsive";
export { RESPONSIVE_CONFIG, getZoneDefaults } from "./responsive";

// ─── Hooks ──────────────────────────────────────────────────────────────────

export { useWorkspacePanel } from "./hooks/useWorkspacePanel";

// ─── Feature Flags ──────────────────────────────────────────────────────────

export type { WorkspaceExperience } from "./feature-flags";
export {
  getWorkspaceExperience,
  setWorkspaceExperience,
  isMissionControlEnabled,
} from "./feature-flags";
