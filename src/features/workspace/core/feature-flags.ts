/**
 * workspace/core/feature-flags.ts
 *
 * Feature flags for workspace experience mode.
 * Stored in localStorage for per-user toggling.
 */

export type WorkspaceExperience = "legacy" | "mission-control";

const STORAGE_KEY = "roblox-ai-studio:workspace-experience";

const DEFAULT_EXPERIENCE: WorkspaceExperience = "legacy";

/** Get the current workspace experience mode */
export function getWorkspaceExperience(): WorkspaceExperience {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "mission-control") return "mission-control";
    return DEFAULT_EXPERIENCE;
  } catch {
    return DEFAULT_EXPERIENCE;
  }
}

/** Set the workspace experience mode */
export function setWorkspaceExperience(mode: WorkspaceExperience): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Storage unavailable
  }
}

/** Check if Mission Control is enabled */
export function isMissionControlEnabled(): boolean {
  return getWorkspaceExperience() === "mission-control";
}
