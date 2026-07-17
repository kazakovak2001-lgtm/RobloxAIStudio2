/**
 * Autonomous Pipeline API client — single-prompt to complete Roblox Experience.
 */

export type OrchestratorPhase =
  | "genre_detection"
  | "knowledge_search"
  | "blueprint"
  | "agent_collaboration"
  | "lua_generation"
  | "asset_generation"
  | "experience_assembly"
  | "playtest"
  | "repair"
  | "benchmark"
  | "studio_sync"
  | "completed"
  | "failed"
  | "paused"
  | "cancelled";

export type SessionStatus =
  "running" | "completed" | "paused" | "cancelled" | "failed";
export type PhaseStatus =
  "pending" | "running" | "completed" | "failed" | "skipped";

export interface ExecutionNode {
  id: string;
  phase: OrchestratorPhase;
  status: PhaseStatus;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  error?: string;
  skippedReason?: string;
}

export interface CostTracker {
  totalTokens: number;
  totalCost: number;
  totalTimeMs: number;
}

export interface OrchestratorSession {
  id: string;
  projectId: string;
  prompt: string;
  status: SessionStatus;
  currentPhase: OrchestratorPhase;
  phases: ExecutionNode[];
  cost: CostTracker;
  qualityScore: number;
  startedAt: number;
  finishedAt?: number;
  genre?: string;
  estimatedTimeMs?: number;
  estimatedCost?: number;
}

export async function startAutonomousRun(params: {
  prompt: string;
  projectId: string;
}): Promise<{
  success: boolean;
  data?: { sessionId: string; status: string; currentPhase: string };
  error?: string;
}> {
  try {
    const res = await fetch("/api/autonomous/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
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

export async function getAutonomousStatus(sessionId: string): Promise<{
  success: boolean;
  data?: OrchestratorSession;
  error?: string;
}> {
  try {
    const res = await fetch(`/api/autonomous/status/${sessionId}`);
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

export async function pauseAutonomous(
  sessionId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/autonomous/pause/${sessionId}`, {
      method: "POST",
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

export async function resumeAutonomous(
  sessionId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/autonomous/resume/${sessionId}`, {
      method: "POST",
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

export async function cancelAutonomous(
  sessionId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/autonomous/cancel/${sessionId}`, {
      method: "POST",
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
