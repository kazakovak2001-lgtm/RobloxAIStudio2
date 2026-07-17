/**
 * Workspace UX Redesign V2 — AI Mission Control
 * Panel Registry and Module System Type Definitions
 *
 * These interfaces define the self-registration pattern for panel components,
 * enabling scalable module management (50+ panels) without visual overload.
 * The registry pattern allows new panels to declare their metadata and
 * the system determines visibility based on phase, mode, and priority.
 *
 * @see design.md — Data Models > Module Registry Model
 * @requirements 10.1
 */

import type { CanvasMode, WorkflowPhase } from "./workspace-state";
import type { PanelId } from "./panels";

export type { PanelId };

/**
 * Self-registration metadata for a single panel component.
 * Each panel declares where it belongs, when it's relevant, and its sizing constraints.
 */
export interface PanelRegistration {
  /** Unique identifier for this panel */
  id: PanelId;
  /** Human-readable panel name */
  name: string;
  /** Which zone this panel prefers to render in */
  preferredZone: "explorer" | "canvas" | "properties" | "ai-command";
  /** Canvas modes where this panel can appear */
  supportedCanvasModes: CanvasMode[];
  /** Workflow phases where this panel is relevant */
  supportedPhases: WorkflowPhase[];
  /** Display priority (1–100, higher = more important). Used for overflow decisions. */
  priority: number;
  /** Minimum dimensions required to render this panel meaningfully */
  minSize: { width: number; height: number };
  /** Functional category for grouping in overflow menus and search */
  category: "generation" | "monitoring" | "validation" | "export" | "analytics";
}

/**
 * Central registry allowing dynamic panel management at scale.
 * Supports 50+ modules without visual overload by computing visibility
 * from phase, mode, and priority metadata.
 */
export interface ModuleRegistry {
  /** All registered panels indexed by their unique ID */
  panels: Map<PanelId, PanelRegistration>;

  /** Register a new panel component with its metadata */
  register(panel: PanelRegistration): void;

  /**
   * Get panels that should be visible for the given phase and mode.
   * Respects the max 8 simultaneous visible panels constraint.
   */
  getVisiblePanels(phase: WorkflowPhase, mode: CanvasMode): PanelRegistration[];

  /**
   * Get panels available on-demand (shown in "More" menu / panel drawer)
   * for the given phase and mode.
   */
  getOverflowPanels(
    phase: WorkflowPhase,
    mode: CanvasMode,
  ): PanelRegistration[];
}
