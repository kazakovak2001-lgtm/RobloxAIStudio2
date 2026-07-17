/**
 * workspace/core/hooks/useWorkspacePanel.ts
 *
 * Per-panel hook for checking visibility and render status.
 * Allows individual panels to conditionally render without
 * needing to know about the broader workspace state machine.
 */

import { useMemo } from "react";
import type { ZoneId } from "../types";
import { useWorkspace } from "../WorkspaceProvider";
import {
  getPanel,
  getVisiblePanels,
  getOnDemandPanels,
} from "../panel-registry";

interface WorkspacePanelInfo {
  /** Whether the panel should be shown based on phase+mode+overrides */
  isVisible: boolean;
  /** Whether the panel is available on-demand (can be revealed) */
  isOnDemand: boolean;
  /** The zone this panel belongs to */
  zone: ZoneId;
  /** Whether the panel component should render at all (visible OR lazy-preloaded) */
  shouldRender: boolean;
}

/**
 * Hook for individual panels to determine their visibility state.
 *
 * @param panelId - The unique panel identifier from the registry
 * @returns Panel visibility info for conditional rendering
 *
 * @example
 * ```tsx
 * function MyPanel() {
 *   const { isVisible, shouldRender } = useWorkspacePanel("my-panel");
 *   if (!shouldRender) return null;
 *   return <div style={{ display: isVisible ? "block" : "none" }}>...</div>;
 * }
 * ```
 */
export function useWorkspacePanel(panelId: string): WorkspacePanelInfo {
  const { state } = useWorkspace();
  const {
    currentPhase,
    activeCanvasMode,
    manuallyRevealedPanels,
    manuallyHiddenPanels,
  } = state;

  return useMemo(() => {
    const registration = getPanel(panelId);

    // Panel not registered — treat as hidden
    if (!registration) {
      return {
        isVisible: false,
        isOnDemand: false,
        zone: "canvas" as ZoneId,
        shouldRender: false,
      };
    }

    const zone = registration.zone;

    // Check if panel is in the default visible set
    const visiblePanels = getVisiblePanels(currentPhase, activeCanvasMode);
    const isDefaultVisible = visiblePanels.some((p) => p.id === panelId);

    // Check if panel is in the on-demand set
    const onDemandPanels = getOnDemandPanels(currentPhase, activeCanvasMode);
    const isOnDemand = onDemandPanels.some((p) => p.id === panelId);

    // Compute final visibility with manual overrides
    const isManuallyRevealed = manuallyRevealedPanels.includes(panelId);
    const isManuallyHidden = manuallyHiddenPanels.includes(panelId);

    let isVisible = isDefaultVisible;
    if (isOnDemand && isManuallyRevealed) {
      isVisible = true;
    }
    if (isManuallyHidden) {
      isVisible = false;
    }

    // shouldRender: render if visible, or if it's on-demand and lazy (keep in DOM for faster reveal)
    const shouldRender =
      isVisible || (isOnDemand && registration.lazy === true);

    return {
      isVisible,
      isOnDemand,
      zone,
      shouldRender,
    };
  }, [
    panelId,
    currentPhase,
    activeCanvasMode,
    manuallyRevealedPanels,
    manuallyHiddenPanels,
  ]);
}
