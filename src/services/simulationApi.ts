/**
 * Simulation API client — frontend service for game simulation & playtesting.
 */

export interface GameplayMetrics {
  blueprintId: string;
  completionRate: number;
  dropOffTick: number | null;
  loopEngagementScore: number;
  economyStability: number;
  npcInteractionFrequency: number;
  mechanicsDiscoveryRate: number;
  totalEvents: number;
  averageEventsPerTick: number;
  sessionLength: number;
}

export interface SimulationResponse {
  simulation: { ticks: number; completed: boolean };
  report: { engagementScore: number; issues: number; suggestions: string[] };
  metrics: GameplayMetrics;
  feedback: {
    grade: "A" | "B" | "C" | "D" | "F";
    shouldRegenerate: boolean;
    items: number;
  };
}

export async function runFullSimulation(
  blueprint: {
    id: string;
    title?: string;
    genre?: string;
    mechanics?: string[];
    npcs?: Array<{ id: string }>;
  },
  ticks = 100,
): Promise<{ success: boolean; data?: SimulationResponse; error?: string }> {
  try {
    const res = await fetch("/api/simulate/game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blueprint, ticks }),
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

export async function getSimulationMetrics(gameId: string): Promise<{
  success: boolean;
  data?: GameplayMetrics;
  error?: string;
}> {
  try {
    const res = await fetch(`/api/simulate/metrics/${gameId}`);
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
