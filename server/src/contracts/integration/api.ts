export type ProjectStatus =
  "draft" | "generating" | "testing" | "ready" | "published" | "archived";

export interface ProjectSummary {
  id: string;
  name: string;
  status: ProjectStatus;
  updatedAt: string;
}

export interface AutonomousRunRequest {
  projectId: string;
  prompt: string;
  goals?: string[];
}

export interface AutonomousRunResponse {
  success: true;
  data: {
    sessionId: string;
    status: string;
    currentPhase: string;
    executionMode: string;
    resultAuthority: string;
    productionCompleted: false;
    warning: string;
  };
}

export interface ProjectGenerationStartResponse {
  success: true;
  executionId: string;
  status: "generation_started";
}
