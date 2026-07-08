/**
 * Studio Bridge API client.
 */

export interface StudioStatusData {
  connected: boolean;
  clientCount: number;
  sessionCount: number;
  clients: Array<{
    clientId: string;
    studioVersion: string;
    projectId?: string;
    connectedAt: number;
    lastHeartbeat: number;
    status: string;
  }>;
}

export interface StudioConnectionData {
  clientId: string;
  sessionId: string;
  studioVersion: string;
  connectedAt: number;
  status: string;
}

/**
 * Get Studio Bridge connection status.
 */
export async function getStudioStatus(): Promise<{
  success: boolean;
  data?: StudioStatusData;
  error?: string;
}> {
  try {
    const res = await fetch("/api/studio/status");
    const json = await res.json();
    if (!res.ok)
      return { success: false, error: json.error ?? `HTTP ${res.status}` };
    return { success: true, data: json.data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/**
 * Connect to Roblox Studio (simulated for dev).
 */
export async function connectStudio(
  studioVersion: string,
  projectId?: string,
): Promise<{ success: boolean; data?: StudioConnectionData; error?: string }> {
  try {
    const res = await fetch("/api/studio/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studioVersion, projectId }),
    });
    const json = await res.json();
    if (!res.ok)
      return { success: false, error: json.error ?? `HTTP ${res.status}` };
    return { success: true, data: json.data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/**
 * Disconnect from Roblox Studio.
 */
export async function disconnectStudio(
  clientId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch("/api/studio/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    const json = await res.json();
    if (!res.ok)
      return { success: false, error: json.error ?? `HTTP ${res.status}` };
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/**
 * Send heartbeat to keep connection alive.
 */
export async function sendHeartbeat(
  clientId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch("/api/studio/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    const json = await res.json();
    if (!res.ok)
      return { success: false, error: json.error ?? `HTTP ${res.status}` };
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}
