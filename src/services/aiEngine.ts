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

/**
 * Lua code generation result.
 */
export interface LuaGenerationResult {
  success: boolean;
  data?: {
    projectId: string;
    gameName: string;
    genre: string;
    scripts: Array<{
      name: string;
      path: string;
      content: string;
      size: number;
      type: string;
    }>;
    totalScripts: number;
    totalSizeBytes: number;
    generationTimeMs: number;
    validationPassed: boolean;
  };
  error?: string;
}

/**
 * Generate Lua code from a natural language prompt via /api/lua/generate.
 */
export async function generateLuaCode(params: {
  prompt: string;
  projectId?: string;
  genre?: string;
  systems?: string[];
}): Promise<LuaGenerationResult> {
  try {
    const response = await fetch("/api/lua/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: params.projectId ?? "ai-studio-session",
        gameName: params.prompt,
        genre: params.genre ?? "adventure",
        systems: params.systems ?? [],
        features: [params.prompt],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      return {
        success: false,
        error: errorBody?.error ?? `Server returned ${response.status}`,
      };
    }

    const json = await response.json();
    const rawData = json.data;
    const rawScripts = rawData.scripts ?? rawData.artifacts ?? [];
    const scripts = rawScripts.map((script: Record<string, unknown>) => ({
      name: String(script.name ?? script.path ?? "GeneratedScript.lua"),
      path: String(script.path ?? script.name ?? "GeneratedScript.lua"),
      content: String(script.content ?? ""),
      size: Number(
        script.size ?? script.sizeBytes ?? String(script.content ?? "").length,
      ),
      type: String(script.type ?? script.scriptType ?? "server"),
    }));
    return {
      success: true,
      data: {
        projectId: rawData.projectId,
        gameName: params.prompt,
        genre: params.genre ?? "adventure",
        scripts,
        totalScripts: Number(rawData.totalScripts ?? scripts.length),
        totalSizeBytes: Number(
          rawData.totalSizeBytes ??
            scripts.reduce(
              (total: number, script: { size: number }) => total + script.size,
              0,
            ),
        ),
        generationTimeMs: rawData.generationTimeMs,
        validationPassed: rawData.validationPassed,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}
