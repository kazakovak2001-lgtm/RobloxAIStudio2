/**
 * Studio Bridge service — communicates with the backend Studio integration layer.
 */

const API_BASE = "/api/v1";

export interface StudioSession {
  sessionId: string;
  studioId: string;
  projectId: string;
  status:
    "idle" | "preparing" | "validating" | "syncing" | "completed" | "failed";
  connectedAt?: number;
  lastSyncAt?: number;
  syncCount?: number;
  version?: number;
}

export interface SyncResult {
  success: boolean;
  itemsSynced: number;
  totalSize: number;
  durationMs: number;
  error?: string;
}

export async function getStudioStatus(
  projectId: string,
): Promise<StudioSession | null> {
  try {
    const res = await fetch(
      `${API_BASE}/studio/status?projectId=${encodeURIComponent(projectId)}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.data ?? null;
  } catch {
    return null;
  }
}

export async function syncToStudio(projectId: string): Promise<SyncResult> {
  try {
    const res = await fetch(`${API_BASE}/studio/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    if (!res.ok) {
      return {
        success: false,
        itemsSynced: 0,
        totalSize: 0,
        durationMs: 0,
        error: `HTTP ${res.status}`,
      };
    }
    const data = await res.json();
    return data.data ?? data;
  } catch (err) {
    return {
      success: false,
      itemsSynced: 0,
      totalSize: 0,
      durationMs: 0,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}
