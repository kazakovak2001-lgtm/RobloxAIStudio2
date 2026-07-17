/**
 * workspace/core/panel-registry/registry.ts
 *
 * Panel registry implementation.
 * A simple Map-based registry for panel metadata lookup and filtering.
 * Panels self-register their metadata here; the registry does not hold
 * component references to keep it decoupled from React rendering.
 */

import type { CanvasMode, WorkflowPhase, ZoneId } from "../types";
import type { PanelRegistration } from "./types";

/** Internal registry store */
const panelRegistry = new Map<string, PanelRegistration>();

/**
 * Register a panel's metadata.
 * Throws if a panel with the same ID is already registered.
 */
export function registerPanel(panel: PanelRegistration): void {
  if (panelRegistry.has(panel.id)) {
    throw new Error(
      `Panel "${panel.id}" is already registered. Each panel must have a unique ID.`,
    );
  }
  panelRegistry.set(panel.id, panel);
}

/** Retrieve a panel registration by ID */
export function getPanel(id: string): PanelRegistration | undefined {
  return panelRegistry.get(id);
}

/** Get all panels assigned to a specific zone */
export function getPanelsForZone(zone: ZoneId): PanelRegistration[] {
  const panels: PanelRegistration[] = [];
  for (const panel of panelRegistry.values()) {
    if (panel.zone === zone) {
      panels.push(panel);
    }
  }
  return panels.sort((a, b) => a.priority - b.priority);
}

/**
 * Get panels that should be visible for the given phase and mode.
 * A panel is visible when:
 *  1. Its visibility for the phase is "visible"
 *  2. The current mode is in its supportedModes
 *  3. The current phase is in its supportedPhases
 */
export function getVisiblePanels(
  phase: WorkflowPhase,
  mode: CanvasMode,
): PanelRegistration[] {
  const panels: PanelRegistration[] = [];
  for (const panel of panelRegistry.values()) {
    if (
      panel.visibility[phase] === "visible" &&
      panel.supportedModes.includes(mode) &&
      panel.supportedPhases.includes(phase)
    ) {
      panels.push(panel);
    }
  }
  return panels.sort((a, b) => a.priority - b.priority);
}

/**
 * Get panels available on-demand for the given phase and mode.
 * These panels can be revealed by user action but are not shown by default.
 */
export function getOnDemandPanels(
  phase: WorkflowPhase,
  mode: CanvasMode,
): PanelRegistration[] {
  const panels: PanelRegistration[] = [];
  for (const panel of panelRegistry.values()) {
    if (
      panel.visibility[phase] === "on-demand" &&
      panel.supportedModes.includes(mode) &&
      panel.supportedPhases.includes(phase)
    ) {
      panels.push(panel);
    }
  }
  return panels.sort((a, b) => a.priority - b.priority);
}

/** Get all registered panel IDs (useful for debugging) */
export function getAllPanelIds(): string[] {
  return Array.from(panelRegistry.keys());
}

/** Clear the registry (useful for testing) */
export function clearRegistry(): void {
  panelRegistry.clear();
}
