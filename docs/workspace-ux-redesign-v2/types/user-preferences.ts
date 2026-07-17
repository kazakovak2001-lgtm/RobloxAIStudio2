/**
 * Workspace UX Redesign V2 — AI Mission Control
 * User Preferences and Layout Customization Type Definitions
 *
 * These interfaces define the user-customizable aspects of the workspace:
 * saved layouts, pinned panels, zone dimension defaults, and accessibility
 * preferences. Users can save and switch between workspace layout presets.
 *
 * @see design.md — Data Models > User Preferences Model
 * @requirements 10.1
 */

import type { PanelId } from "./panels";
import type { WorkflowPhase, WorkspaceState } from "./workspace-state";

/**
 * A saved workspace layout preset that users can create, name, and switch between.
 * Stores zone configurations, pinned panels, and the default phase to enter.
 */
export interface WorkspaceLayout {
  /** Unique identifier for this layout preset */
  id: string;
  /** User-provided name (e.g., "Development Focus", "Review Mode") */
  name: string;
  /** Saved zone collapse and dimension states */
  zones: WorkspaceState["zones"];
  /** Panels pinned in this layout (always visible regardless of phase) */
  pinnedPanels: PanelId[];
  /** Default workflow phase when activating this layout */
  defaultPhase: WorkflowPhase;
}

/**
 * Per-user workspace preferences encompassing saved layouts,
 * panel pins, zone defaults, and accessibility settings.
 */
export interface WorkspacePreferences {
  /** Collection of saved layout presets */
  layouts: WorkspaceLayout[];
  /** ID of the currently active layout */
  activeLayoutId: string;

  /** Panels the user has pinned (always visible across phases) */
  pinnedPanels: PanelId[];

  /** Default zone dimensions applied when no layout override is active */
  zoneDefaults: {
    /** Default Project Explorer width in pixels */
    explorerWidth: number;
    /** Default Properties Panel width in pixels */
    propertiesWidth: number;
    /** Default AI Command Center height in pixels */
    aiCommandHeight: number;
  };

  /** Accessibility preferences */
  reducedMotion: boolean;
  highContrast: boolean;
}
