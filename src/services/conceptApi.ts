/**
 * Concept & Experience generation API client.
 */

export interface GameConcept {
  conceptId: string;
  title: string;
  description: string;
  genre: string;
  gameplayLoop: string;
  features: string[];
  assetsPlan: string[];
  systemsPlan: string[];
  uiPlan: string[];
  technicalPlan: {
    architecture: string;
    requiredAgents: string[];
    estimatedStages: number;
  };
}

export interface ExperienceResult {
  pipelineId: string;
  status: string;
  completedStages: string[];
  failedStages: string[];
  durationMs: number;
  stageCount: number;
}

export async function generateConcept(params: {
  gameDescription: string;
  genre?: string;
  style?: string;
  targetAudience?: string;
  additionalRequirements?: string;
}): Promise<{ success: boolean; data?: GameConcept; error?: string }> {
  try {
    const res = await fetch("/api/concept/generate", {
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

export async function generateExperience(
  conceptId: string,
): Promise<{ success: boolean; data?: ExperienceResult; error?: string }> {
  try {
    const res = await fetch("/api/concept/experience/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conceptId }),
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

export interface PipelineStageStatus {
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  agentId: string | null;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  error?: string;
}

export interface PipelineStatus {
  pipelineId: string;
  projectId: string;
  currentStage: string | null;
  completedStages: string[];
  failedStages: string[];
  stages: PipelineStageStatus[];
  status: "pending" | "running" | "completed" | "failed" | "recovering";
  startedAt: number;
  finishedAt?: number;
}

export interface GenerationHistoryEntry {
  pipelineId: string;
  projectId: string;
  status: string;
  startedAt: number;
  finishedAt?: number;
  completedStages: string[];
  failedStages: string[];
  stageCount: number;
}

/**
 * Poll pipeline status by ID.
 */
export async function getExperienceStatus(
  pipelineId: string,
): Promise<{ success: boolean; data?: PipelineStatus; error?: string }> {
  try {
    const res = await fetch(`/api/concept/experience/status/${pipelineId}`);
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
 * Fetch generation history (all pipeline runs).
 */
export async function getExperienceHistory(): Promise<{
  success: boolean;
  data?: GenerationHistoryEntry[];
  error?: string;
}> {
  try {
    const res = await fetch("/api/concept/experience/history");
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

export type ArtifactType =
  | "json"
  | "lua"
  | "markdown"
  | "text"
  | "manifest"
  | "ui-layout"
  | "asset-plan";

export interface ArtifactSummary {
  id: string;
  pipelineId: string;
  stage: string;
  agent: string | null;
  type: ArtifactType;
  name: string;
  createdAt: number;
  sizeBytes: number;
  validated: boolean;
}

export interface ArtifactDetail extends ArtifactSummary {
  content: unknown;
}

/**
 * Fetch all artifacts for a pipeline (summary without content).
 */
export async function getArtifacts(
  pipelineId: string,
): Promise<{ success: boolean; data?: ArtifactSummary[]; error?: string }> {
  try {
    const res = await fetch(`/api/concept/experience/${pipelineId}/artifacts`);
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
 * Fetch a single artifact with full content.
 */
export async function getArtifactDetail(
  artifactId: string,
): Promise<{ success: boolean; data?: ArtifactDetail; error?: string }> {
  try {
    const res = await fetch(`/api/concept/experience/artifact/${artifactId}`);
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
