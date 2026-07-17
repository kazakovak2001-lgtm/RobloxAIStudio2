/**
 * workspace/core/responsive.ts
 *
 * Responsive configuration for zone dimensions across breakpoints.
 * Provides defaults that the layout system uses to size zones based
 * on the current viewport.
 */

import type { Breakpoint } from "@/shared/hooks/useBreakpoint";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ZoneDefaults {
  explorerWidth: number;
  propertiesWidth: number;
  aiCommandHeight: number;
}

export interface ResponsiveBreakpointConfig extends ZoneDefaults {
  /** Whether all side zones are visible simultaneously */
  allZonesVisible?: boolean;
  /** Whether split-view canvas is available */
  splitViewAvailable?: boolean;
  /** Whether split-view is disabled */
  splitView?: boolean;
  /** Whether canvas takes full width (no side zones) */
  canvasFullWidth?: boolean;
}

// ─── Configuration ──────────────────────────────────────────────────────────

/**
 * Responsive zone configuration per breakpoint.
 * Values represent default pixel dimensions.
 */
export const RESPONSIVE_CONFIG: Record<string, ResponsiveBreakpointConfig> = {
  desktop: {
    explorerWidth: 240,
    propertiesWidth: 300,
    aiCommandHeight: 200,
    allZonesVisible: true,
  },
  laptop: {
    explorerWidth: 48,
    propertiesWidth: 0,
    aiCommandHeight: 44,
    splitView: false,
  },
  tablet: {
    explorerWidth: 0,
    propertiesWidth: 0,
    aiCommandHeight: 44,
    canvasFullWidth: true,
  },
  largeMonitor: {
    explorerWidth: 280,
    propertiesWidth: 360,
    aiCommandHeight: 240,
    splitViewAvailable: true,
  },
} as const;

// ─── Accessor ───────────────────────────────────────────────────────────────

/**
 * Get zone dimension defaults for a given breakpoint.
 * Maps the app's Breakpoint type to our responsive config.
 */
export function getZoneDefaults(breakpoint: Breakpoint): ZoneDefaults {
  switch (breakpoint) {
    case "desktop":
      return {
        explorerWidth: RESPONSIVE_CONFIG.desktop.explorerWidth,
        propertiesWidth: RESPONSIVE_CONFIG.desktop.propertiesWidth,
        aiCommandHeight: RESPONSIVE_CONFIG.desktop.aiCommandHeight,
      };
    case "tablet":
      return {
        explorerWidth: RESPONSIVE_CONFIG.tablet.explorerWidth,
        propertiesWidth: RESPONSIVE_CONFIG.tablet.propertiesWidth,
        aiCommandHeight: RESPONSIVE_CONFIG.tablet.aiCommandHeight,
      };
    case "mobile":
      return {
        explorerWidth: 0,
        propertiesWidth: 0,
        aiCommandHeight: 44,
      };
  }
}
