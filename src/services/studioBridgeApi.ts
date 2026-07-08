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

export interface ProtocolLogEntry {
  messageId: string;
  direction: "client_to_server" | "server_to_client";
  type: string;
  status: "ok" | "error" | "pending";
  timestamp: number;
  roundTripMs?: number;
  payloadSize: number;
  sessionId: string;
}

export interface ProtocolInfo {
  protocolVersion: string;
  supportedTypes: string[];
  maxPayloadSize: number;
  messageTimeoutMs: number;
}

/**
 * Get protocol message log.
 */
export async function getProtocolLog(
  limit = 50,
): Promise<{ success: boolean; data?: ProtocolLogEntry[]; error?: string }> {
  try {
    const res = await fetch(`/api/studio/protocol/log?limit=${limit}`);
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
 * Get protocol info (version, supported types).
 */
export async function getProtocolInfo(): Promise<{
  success: boolean;
  data?: ProtocolInfo;
  error?: string;
}> {
  try {
    const res = await fetch("/api/studio/protocol/info");
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
 * Send a protocol message (for testing/debugging).
 */
export async function sendProtocolMessage(
  message: Record<string, unknown>,
): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}> {
  try {
    const res = await fetch("/api/studio/protocol/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
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

// ─── Sync Layer API ─────────────────────────────────────────────────────────

export interface ProjectSnapshot {
  projectId: string;
  version: string;
  artifacts: Array<{
    id: string;
    type: string;
    name: string;
    stage: string;
    size: number;
    hash: string;
    version: number;
    createdAt: number;
    reviewStatus: string;
  }>;
  generatedAt: number;
  artifactCount: number;
}

export interface SyncStatusData {
  lastSyncTimestamp: number | null;
  pendingChanges: number;
  conflictCount: number;
  currentVersion: string;
  projectId: string | null;
}

export interface ArtifactTransferResult {
  artifacts: Array<{
    id: string;
    type: string;
    name: string;
    stage: string;
    size: number;
    createdAt: number;
    reviewStatus: string;
    content: unknown;
  }>;
  missing: string[];
  totalSize: number;
  payloadExceeded: boolean;
}

/**
 * Get project snapshot for sync.
 */
export async function requestProjectSync(
  projectId: string,
): Promise<{ success: boolean; data?: ProjectSnapshot; error?: string }> {
  try {
    const res = await fetch("/api/studio/sync/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
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
 * Request specific artifacts for transfer.
 */
export async function requestArtifacts(
  artifactIds: string[],
): Promise<{
  success: boolean;
  data?: ArtifactTransferResult;
  error?: string;
}> {
  try {
    const res = await fetch("/api/studio/sync/artifacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artifactIds }),
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
 * Get sync status.
 */
export async function getSyncStatus(
  projectId?: string,
): Promise<{ success: boolean; data?: SyncStatusData; error?: string }> {
  try {
    const url = projectId
      ? `/api/studio/sync/status?projectId=${projectId}`
      : "/api/studio/sync/status";
    const res = await fetch(url);
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
