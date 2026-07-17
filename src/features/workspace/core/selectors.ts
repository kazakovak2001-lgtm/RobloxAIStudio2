/**
 * workspace/core/selectors.ts
 *
 * Pure selector functions for deriving values from WorkspaceState.
 * These can be used with React.useMemo for render isolation — components
 * only re-render when their specific slice of state changes.
 *
 * All functions are pure (no side effects) and deterministic.
 */

import type {
  CanvasMode,
  PropertiesContext,
  WorkflowPhase,
  WorkspaceState,
  ZoneId,
  ZoneState,
} from "./types";
import { getVisiblePanels, getOnDemandPanels } from "./panel-registry";

/** Select the current workflow phase */
export function selectCurrentPhase(state: WorkspaceState): WorkflowPhase {
  return state.currentPhase;
}

/** Select the active canvas mode */
export function selectActiveMode(state: WorkspaceState): CanvasMode {
  return state.activeCanvasMode;
}

/**
 * Compute visible panel IDs for the current phase, mode, and manual overrides.
 * Logic:
 *  1. Start with panels marked "visible" for current phase+mode
 *  2. Add manually revealed panels (on-demand panels the user opened)
 *  3. Remove manually hidden panels
 */
export function selectVisiblePanels(state: WorkspaceState): string[] {
  const {
    currentPhase,
    activeCanvasMode,
    manuallyRevealedPanels,
    manuallyHiddenPanels,
  } = state;

  // Panels visible by default for this phase+mode
  const defaultVisible = getVisiblePanels(currentPhase, activeCanvasMode);
  const visibleIds = defaultVisible.map((p) => p.id);

  // On-demand panels that the user has manually revealed
  const onDemand = getOnDemandPanels(currentPhase, activeCanvasMode);
  const onDemandIds = onDemand.map((p) => p.id);

  for (const revealed of manuallyRevealedPanels) {
    if (onDemandIds.includes(revealed) && !visibleIds.includes(revealed)) {
      visibleIds.push(revealed);
    }
  }

  // Remove manually hidden panels
  return visibleIds.filter((id) => !manuallyHiddenPanels.includes(id));
}

/** Select zone state by zone ID */
export function selectZoneState(
  state: WorkspaceState,
  zone: ZoneId,
): ZoneState {
  switch (zone) {
    case "explorer":
      return state.zones.explorer;
    case "properties":
      return state.zones.properties;
    case "ai-command":
      return state.zones.aiCommand;
    case "command-bar":
      // Command bar does not have collapse state — return default
      return { collapsed: false };
    case "canvas":
      // Canvas is always visible — return default
      return { collapsed: false };
  }
}

/** Select the current properties panel context */
export function selectPropertiesContent(
  state: WorkspaceState,
): PropertiesContext {
  return state.propertiesContext;
}
