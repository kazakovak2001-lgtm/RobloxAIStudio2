export type JsonObject = Record<string, unknown>;

export interface ModelRequest {
  prompt: string;
  systemPrompt?: string;
  context?: JsonObject;
}

export interface ModelResponse {
  text: string;
  structuredData?: JsonObject;
}

export interface ModelProvider {
  name: string;
  complete(request: ModelRequest): Promise<ModelResponse>;
}

export interface AgentContext {
  prompt: string;
  sharedState: JsonObject;
  artifacts: JsonObject;
  previousOutputs: JsonObject;
  metadata?: JsonObject;
}

export interface ValidationResult {
  valid: boolean;
  issues: string[];
}

export interface AgentExecutionResult<TOutput> {
  agentName: string;
  success: boolean;
  output?: TOutput;
  validation: ValidationResult;
  attempts: number;
  durationMs: number;
  error?: string;
}

export interface OrchestratorLogEntry {
  agentName: string;
  status: "started" | "succeeded" | "failed" | "retried";
  message: string;
  timestamp: string;
}

export interface PipelineResult<TOutput> {
  success: boolean;
  context: AgentContext;
  results: AgentExecutionResult<TOutput>[];
  logs: OrchestratorLogEntry[];
}

export interface SchemaDefinition {
  type: "object";
  properties: JsonObject;
  required?: string[];
}
