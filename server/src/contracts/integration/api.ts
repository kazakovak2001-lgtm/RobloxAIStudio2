export interface ProjectSummary {
  id: string;
  name: string;
  status: "draft" | "running" | "ready";
}

export interface CreateGenerationRequest {
  projectId: string;
  prompt: string;
}

export interface GenerationResponse {
  pipelineId: string;
  projectId: string;
  status: string;
}
