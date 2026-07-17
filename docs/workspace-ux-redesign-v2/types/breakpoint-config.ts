/**
 * Workspace UX Redesign V2 — AI Mission Control
 * Responsive Breakpoint Configuration Type Definitions
 *
 * Defines the layout behavior at each of the 4 responsive breakpoints.
 * Each breakpoint specifies zone dimensions, collapse behavior, and
 * available layout features (e.g., split-view on large monitors).
 *
 * Breakpoints:
 *   - Desktop:       1440–1919px
 *   - Laptop:        1024–1439px
 *   - Tablet:        768–1023px
 *   - Large Monitor: ≥1920px
 *
 * @see design.md — Data Models > Responsive Breakpoint Configuration
 * @requirements 9.1, 9.2, 9.3, 9.4
 */

/**
 * Complete responsive breakpoint configuration for the Mission Control layout.
 * Each property defines zone dimensions and feature availability at that breakpoint.
 */
export interface BreakpointConfig {
  /** Desktop layout (1440–1919px): all zones visible with standard dimensions */
  desktop: {
    /** Project Explorer default width in pixels */
    explorerDefault: 240;
    /** Project Explorer collapsed width (icon-only rail) in pixels */
    explorerCollapsed: 48;
    /** Properties Panel default width in pixels */
    propertiesDefault: 300;
    /** Properties Panel collapsed width (fully hidden) in pixels */
    propertiesCollapsed: 0;
    /** AI Command Center default height in pixels */
    aiCommandDefault: 200;
    /** AI Command Center collapsed height (single-line prompt) in pixels */
    aiCommandCollapsed: 44;
    /** Whether all 5 zones are visible simultaneously */
    allZonesVisible: true;
  };

  /** Laptop layout (1024–1439px): side panels auto-collapsed, AI command minimized */
  laptop: {
    /** Project Explorer default width (auto-collapsed to icon-only) in pixels */
    explorerDefault: 48;
    /** Properties Panel default width (auto-collapsed/hidden) in pixels */
    propertiesDefault: 0;
    /** AI Command Center default height (collapsed to single-line) in pixels */
    aiCommandDefault: 44;
    /** Whether split-view canvas modes are available */
    splitView: false;
  };

  /** Tablet layout (768–1023px): side panels hidden with overlay access */
  tablet: {
    /** Project Explorer default width (hidden, overlay access) in pixels */
    explorerDefault: 0;
    /** Properties Panel default width (hidden, overlay access) in pixels */
    propertiesDefault: 0;
    /** AI Command Center default height (bottom sheet) in pixels */
    aiCommandDefault: 44;
    /** Whether Center Canvas occupies full viewport width */
    canvasFullWidth: true;
  };

  /** Large Monitor layout (≥1920px): expanded zones with optional split-view */
  largeMonitor: {
    /** Project Explorer default width in pixels */
    explorerDefault: 280;
    /** Properties Panel default width in pixels */
    propertiesDefault: 360;
    /** AI Command Center default height in pixels */
    aiCommandDefault: 240;
    /** Whether side-by-side canvas modes are available */
    splitViewAvailable: true;
  };
}
