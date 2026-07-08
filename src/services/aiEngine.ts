/**
 * AI Engine Service — Frontend client for the Compiler API.
 *
 * Previously imported legacy agent implementations directly.
 * Now delegates all execution to the backend server via HTTP API.
 * Agents run server-side with full LLM, evaluation, memory, and governance.
 */

const API_BASE = "/api/projects";

export interface PipelineResult {
  success: boolean;
  executionId?: string;
  status?: string;
  error?: string;
}

/**
 * Start a generation pipeline run via the backend API.
 */
export async function runAgentPipeline(
  projectId: string,
  blueprintId?: string,
  userId = "default-user",
): Promise<PipelineResult> {
  try {
    const response = await fetch(`${API_BASE}/${projectId}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blueprintId: blueprintId ?? projectId, userId }),
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
    return {
      success: true,
      executionId: data.executionId,
      status: data.status,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/**
 * Get generation execution status.
 */
export async function getExecutionStatus(
  projectId: string,
  executionId: string,
): Promise<unknown> {
  const response = await fetch(
    `${API_BASE}/${projectId}/generation/${executionId}/status`,
  );
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
