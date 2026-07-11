/**
 * AI Engine Service — Frontend client for the Generation Pipeline.
 *
 * Uses the PipelineEngine v2 endpoint for generation.
 * Returns pipelineId (not executionId) for consistent status polling.
 */

export interface PipelineResult {
  success: boolean;
  executionId?: string;
  pipelineId?: string;
  status?: string;
  error?: string;
}

/**
 * Start a generation pipeline run via PipelineEngine v2.
 */
export async function runAgentPipeline(
  projectId: string,
): Promise<PipelineResult> {
  try {
    const response = await fetch("/api/concept/experience/generate-direct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      return {
        success: false,
        error:
          errorBody?.error ??
          errorBody?.message ??
          `Server returned ${response.status}`,
      };
    }

    const data = await response.json();
    const pipelineId = data.data?.pipelineId ?? data.pipelineId;
    return {
      success: true,
      executionId: pipelineId,
      pipelineId,
      status: data.data?.status ?? data.status,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/**
 * Get generation execution status (via concept pipeline status API).
 */
export async function getExecutionStatus(
  _projectId: string,
  pipelineId: string,
): Promise<unknown> {
  const response = await fetch(`/api/concept/experience/status/${pipelineId}`);
  if (!response.ok) return null;
  const data = await response.json();
  return data.data;
}

/**
 * Get active provider info from the server health endpoint.
 */
export async function getActiveProvider(): Promise<string> {
  try {
    const response = await fetch("/health");
    if (!response.ok) return "unknown";
    const data = await response.json();
    return data.llm ?? "stub";
  } catch {
    return "unavailable";
  }
}
