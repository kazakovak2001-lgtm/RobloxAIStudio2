/**
 * Workspace UX Redesign V2 — AI Mission Control
 * Type Definitions Barrel File
 *
 * This file re-exports all TypeScript type definitions used throughout
 * the specification. These interfaces serve as formal type contracts
 * for future implementation of the Mission Control workspace.
 */

// Core workspace state types
export type {
  WorkspaceState,
  WorkflowPhase,
  CanvasMode,
  ZoneState,
  PropertiesContext,
  ModeState,
} from "./workspace-state";

// Panel registry and module system types
export type {
  PanelId,
  PanelRegistration,
  ModuleRegistry,
} from "./panel-registry";

// User preferences and layout customization types
export type { WorkspacePreferences, WorkspaceLayout } from "./user-preferences";

// Responsive breakpoint configuration types
export type { BreakpointConfig } from "./breakpoint-config";

// Panel component enumeration and metadata
export type { PanelMetadata } from "./panels";
