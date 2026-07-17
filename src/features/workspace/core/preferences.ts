/**
 * workspace/core/preferences.ts
 *
 * User workspace preferences persisted to localStorage.
 * Handles load/save with fallback to sensible defaults.
 */

import type { CanvasMode, WorkflowPhase } from "./types";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WorkspacePreferences {
  pinnedPanels: string[];
  zoneDefaults: {
    explorerWidth: number;
    propertiesWidth: number;
    aiCommandHeight: number;
  };
  defaultPhase: WorkflowPhase;
  defaultCanvasMode: CanvasMode;
  reducedMotion: boolean;
  highContrast: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY = "roblox-ai-studio:workspace-preferences";

export const DEFAULT_PREFERENCES: WorkspacePreferences = {
  pinnedPanels: [],
  zoneDefaults: {
    explorerWidth: 240,
    propertiesWidth: 300,
    aiCommandHeight: 200,
  },
  defaultPhase: "generate",
  defaultCanvasMode: "build",
  reducedMotion: false,
  highContrast: false,
};

// ─── Persistence ────────────────────────────────────────────────────────────

/**
 * Load workspace preferences from localStorage.
 * Returns DEFAULT_PREFERENCES if nothing is stored or parsing fails.
 */
export function loadPreferences(): WorkspacePreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object")
      return { ...DEFAULT_PREFERENCES };

    // Merge with defaults to handle missing fields from older versions
    return {
      ...DEFAULT_PREFERENCES,
      ...(parsed as Partial<WorkspacePreferences>),
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

/**
 * Save workspace preferences to localStorage.
 * Silently fails if storage is unavailable (e.g., private browsing quota).
 */
export function savePreferences(prefs: WorkspacePreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage full or unavailable — fail silently
  }
}
