import { memo, useCallback } from "react";
import { useWorkspace, getZoneDefaults } from "../core";
import { useBreakpoint } from "@/shared/hooks";
import { CommandBar } from "./CommandBar";
import { ExplorerZone } from "./ExplorerZone";
import { CanvasZone } from "./CanvasZone";
import { PropertiesZone } from "./PropertiesZone";
import { AICommandZone } from "./AICommandZone";
import { useWorkspaceShortcuts } from "./hooks/useWorkspaceShortcuts";
import type { CanvasMode } from "../core";
import type { PipelineData } from "./types";

interface MissionControlShellProps {
  projectId?: string;
  pipelineData?: PipelineData;
  children?: React.ReactNode;
}

/**
 * Mission Control 5-zone layout shell.
 *
 * STRUCTURAL STABILITY GUARANTEE:
 * All 5 zone components are ALWAYS mounted as direct children regardless of
 * breakpoint. Visibility is controlled via CSS (display/width/position), never
 * by mounting/unmounting. This ensures:
 * - No React reconciliation errors (insertBefore)
 * - No parent identity changes
 * - No state loss during responsive transitions
 * - No duplicate component instances
 */
export const MissionControlShell = memo(function MissionControlShell({
  projectId,
  pipelineData,
  children,
}: MissionControlShellProps) {
  const breakpoint = useBreakpoint();
  const { state, setCanvasMode, setZoneState, setAICommandState } =
    useWorkspace();
  const zoneDefaults = getZoneDefaults(breakpoint);

  const isDesktop = breakpoint === "desktop";
  const isMobile = breakpoint === "mobile";

  // Keyboard shortcut handlers
  const handleModeChange = useCallback(
    (mode: CanvasMode) => {
      setCanvasMode(mode);
    },
    [setCanvasMode],
  );

  const handleToggleAICommand = useCallback(() => {
    const current = state.aiCommandState.height;
    setAICommandState({
      height: current === "collapsed" ? "default" : "collapsed",
    });
  }, [state.aiCommandState.height, setAICommandState]);

  const handleToggleExplorer = useCallback(() => {
    setZoneState("explorer", { collapsed: !state.zones.explorer.collapsed });
  }, [state.zones.explorer.collapsed, setZoneState]);

  const handleToggleProperties = useCallback(() => {
    setZoneState("properties", {
      collapsed: !state.zones.properties.collapsed,
    });
  }, [state.zones.properties.collapsed, setZoneState]);

  useWorkspaceShortcuts({
    onModeChange: handleModeChange,
    onToggleAICommand: handleToggleAICommand,
    onToggleExplorer: handleToggleExplorer,
    onToggleProperties: handleToggleProperties,
  });

  // Close overlay zones
  const closeOverlays = useCallback(() => {
    setZoneState("explorer", { collapsed: true });
    setZoneState("properties", { collapsed: true });
  }, [setZoneState]);

  // Explorer visibility: inline on desktop, overlay on tablet, hidden on mobile
  const explorerIsOverlay = !isDesktop;
  const explorerVisible = isDesktop || !state.zones.explorer.collapsed;

  // Properties visibility: inline on desktop, overlay on tablet, hidden on mobile
  const propertiesIsOverlay = !isDesktop;
  const propertiesVisible = isDesktop || !state.zones.properties.collapsed;

  // Show backdrop when any overlay panel is open on non-desktop
  const showBackdrop =
    explorerIsOverlay && (explorerVisible || propertiesVisible) && !isMobile;

  // Grid layout always includes all areas — zones control their own visibility via CSS
  const gridTemplate = isDesktop
    ? {
        gridTemplateAreas: `
          "command   command    command"
          "explorer  canvas     properties"
          "ai-cmd    ai-cmd     ai-cmd"
        `,
        gridTemplateRows: "auto 1fr auto",
        gridTemplateColumns: `auto 1fr auto`,
      }
    : {
        gridTemplateAreas: `
          "command  command  command"
          "canvas   canvas   canvas"
          "ai-cmd   ai-cmd   ai-cmd"
        `,
        gridTemplateRows: "auto 1fr auto",
        gridTemplateColumns: "1fr",
      };

  // Explorer zone style — always rendered, CSS-hidden when not desktop
  const explorerStyle: React.CSSProperties = {
    gridArea: isDesktop ? "explorer" : undefined,
    width: isDesktop
      ? state.zones.explorer.collapsed
        ? 48
        : (state.zones.explorer.width ?? zoneDefaults.explorerWidth)
      : undefined,
    // On non-desktop: render as fixed overlay
    ...(explorerIsOverlay
      ? {
          position: "fixed" as const,
          top: 0,
          bottom: 0,
          left: 0,
          zIndex: 50,
          width: 256,
          transform: explorerVisible ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 200ms ease-out",
          pointerEvents: explorerVisible
            ? ("auto" as const)
            : ("none" as const),
        }
      : {}),
  };

  // Properties zone style — always rendered, CSS-hidden when not desktop
  const propertiesStyle: React.CSSProperties = {
    gridArea: isDesktop ? "properties" : undefined,
    width: isDesktop
      ? state.zones.properties.collapsed
        ? 0
        : (state.zones.properties.width ?? zoneDefaults.propertiesWidth)
      : undefined,
    overflow: "hidden" as const,
    // On non-desktop: render as fixed overlay
    ...(propertiesIsOverlay
      ? {
          position: "fixed" as const,
          top: 0,
          bottom: 0,
          right: 0,
          zIndex: 50,
          width: 288,
          transform: propertiesVisible ? "translateX(0)" : "translateX(100%)",
          transition: "transform 200ms ease-out",
          pointerEvents: propertiesVisible
            ? ("auto" as const)
            : ("none" as const),
        }
      : {}),
  };

  return (
    <div
      className="relative h-full w-full overflow-hidden bg-slate-950"
      style={{ display: "grid", ...gridTemplate }}
    >
      {/* Zone 1: Command Bar — always visible */}
      <div style={{ gridArea: "command" }}>
        <CommandBar
          activeProject={projectId ?? state.projectId ?? undefined}
          aiStatus="online"
          robloxConnectionStatus="disconnected"
        />
      </div>

      {/* Zone 2: Explorer — always mounted, visibility via CSS transform */}
      <div style={explorerStyle}>
        <ExplorerZone />
      </div>

      {/* Zone 3: Canvas — always visible, always mounted */}
      <div style={{ gridArea: "canvas", overflow: "hidden", minWidth: 0 }}>
        <CanvasZone pipelineData={pipelineData} />
      </div>

      {/* Zone 4: Properties — always mounted, visibility via CSS transform/width */}
      <div style={propertiesStyle}>
        <PropertiesZone pipelineData={pipelineData} />
      </div>

      {/* Zone 5: AI Command — always visible */}
      <div style={{ gridArea: "ai-cmd" }}>
        <AICommandZone pipelineData={pipelineData} />
      </div>

      {/* Overlay backdrop for tablet side panels */}
      {showBackdrop && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200"
          onClick={closeOverlays}
          aria-hidden="true"
        />
      )}

      {children}
    </div>
  );
});
