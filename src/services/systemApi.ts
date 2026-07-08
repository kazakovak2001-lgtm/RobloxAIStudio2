/**
 * System API — fetches platform status, agents, and pipeline info.
 */

export interface SystemStatus {
  status: string;
  version: string;
  agents: { total: number; list: string[] };
  prompts: { total: number; metrics: Record<string, number> };
  uptime: number;
  timestamp: number;
}

export interface AgentInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  capabilities: Record<string, boolean>;
}

export async function getSystemStatus(): Promise<SystemStatus | null> {
  try {
    const res = await fetch("/api/system/status");
    if (!res.ok) return null;
    const data = await res.json();
    return data.data ?? null;
  } catch {
    return null;
  }
}

export async function getAgents(): Promise<AgentInfo[]> {
  try {
    const res = await fetch("/api/system/agents");
    if (!res.ok) return [];
    const data = await res.json();
    return data.data ?? [];
  } catch {
    return [];
  }
}

export async function getAgent(id: string): Promise<AgentInfo | null> {
  try {
    const res = await fetch(`/api/system/agents/${id}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.data ?? null;
  } catch {
    return null;
  }
}
