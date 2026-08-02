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
  status: "queued" | "running" | "completed" | "failed";
}

export interface ProjectLifecycleResponse {
  projectId: string;
  status: ProjectSummary["status"];
  updatedAt: string;
}
