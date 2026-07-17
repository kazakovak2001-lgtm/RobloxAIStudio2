/**
 * Economy API client — frontend service for economy analysis & balancing.
 */

export interface EconomyModelSummary {
  currency: string;
  stability: number;
  netFlow: number;
}

export interface EconomySimulationSummary {
  ticks: number;
  finalBalance: number;
  growthRate: number;
}

export interface ImbalanceReportSummary {
  healthScore: number;
  imbalances: number;
  critical: number;
}

export interface BalancePatchSummary {
  adjustments: number;
  confidence: number;
}

export interface EconomyAnalysisResponse {
  model: EconomyModelSummary;
  simulation: EconomySimulationSummary;
  report: ImbalanceReportSummary;
  patch: BalancePatchSummary;
}

export async function analyzeEconomy(
  blueprint: {
    id: string;
    title?: string;
    genre?: string;
    mechanics?: string[];
    npcs?: Array<{ id: string }>;
    economy?: { currency: string; sources: string[]; sinks: string[] };
  },
  ticks = 200,
): Promise<{
  success: boolean;
  data?: EconomyAnalysisResponse;
  error?: string;
}> {
  try {
    const res = await fetch("/api/economy/analyze", {
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

export async function simulateEconomy(
  blueprint: {
    id: string;
    economy?: { currency: string; sources: string[]; sinks: string[] };
  },
  ticks = 200,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const res = await fetch("/api/economy/simulate", {
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
