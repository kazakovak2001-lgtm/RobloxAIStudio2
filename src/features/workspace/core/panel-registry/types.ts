/**
 * workspace/core/panel-registry/types.ts
 *
 * Type definitions for the panel registration system.
 * Each panel declares its zone, supported phases/modes, and visibility rules.
 */

import type {
  CanvasMode,
  PanelVisibility,
  WorkflowPhase,
  ZoneId,
} from "../types";

/** Category of panel functionality */
export type PanelCategory =
  | "generation"
  | "monitoring"
  | "validation"
  | "export"
  | "analytics"
  | "navigation";

/** Registration metadata for a workspace panel */
export interface PanelRegistration {
  /** Unique panel identifier */
  id: string;
  /** Human-readable panel name */
  name: string;
  /** Which zone this panel renders in */
  zone: ZoneId;
  /** Canvas modes where this panel is available */
  supportedModes: CanvasMode[];
  /** Workflow phases where this panel is available */
  supportedPhases: WorkflowPhase[];
  /** Visibility state per workflow phase */
  visibility: Record<WorkflowPhase, PanelVisibility>;
  /** Render priority within its zone (1-100, lower = higher priority) */
  priority: number;
  /** Functional category for grouping */
  category: PanelCategory;
  /** Required permissions to view this panel */
  permissions?: string[];
  /** Whether the panel supports React.lazy loading */
  lazy?: boolean;
  /** Whether the panel should be wrapped in React.memo */
  memo?: boolean;
}
