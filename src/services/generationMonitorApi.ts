/**
 * Generation Monitor API — Frontend service for pipeline observability.
 */

export interface PipelineMetricsData {
  pipelineId: string;
  duration: number;
  stagesCompleted: number;
  stagesTotal: number;
  failures: number;
  retryCount: number;
  tokenUsage: number;
  aiCost: number;
  startedAt: number;
  finishedAt?: number;
}

export interface AuditLogEntry {
  id: string;
  pipelineId: string;
  timestamp: string;
  eventType: string;
  stage?: string;
  message: string;
  metadata?: unknown;
}

/**
 * Get pipeline metrics (duration, tokens, cost).
 */
export async function getPipelineMetrics(
  pipelineId: string,
): Promise<{ success: boolean; data?: PipelineMetricsData; error?: string }> {
  try {
    const res = await fetch(`/api/concept/experience/${pipelineId}/metrics`);
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
 * Get pipeline audit history (event log).
 */
export async function getPipelineAuditLog(
  pipelineId: string,
): Promise<{ success: boolean; data?: AuditLogEntry[]; error?: string }> {
  try {
    const res = await fetch(`/api/concept/experience/${pipelineId}/audit`);
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
