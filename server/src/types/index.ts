export interface AgentInput {
  [key: string]: unknown;
}

export interface AgentOutput {
  [key: string]: unknown;
}

export interface AgentSchema {
  type: "object";
  properties: Record<string, { type: string; description?: string }>;
  required?: string[];
}

export interface AgentConfig {
  name: string;
  description: string;
  inputSchema: AgentSchema;
  outputSchema: AgentSchema;
  maxRetries?: number;
  timeout?: number;
}

export interface AgentResult<T = AgentOutput> {
  success: boolean;
  data?: T;
  error?: string;
  attempts: number;
  duration: number;
  timestamp: Date;
}

export interface PipelineContext {
  projectId: string;
  userId: string;
  input: AgentInput;
  results: Map<string, AgentResult>;
  metadata: Record<string, unknown>;
}

export interface LLMProvider {
  generate(prompt: string, options?: LLMOptions): Promise<string>;
  stream?(prompt: string, onChunk: (chunk: string) => void): Promise<void>;
}

export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
}

export type AgentStatus = "idle" | "running" | "completed" | "failed" | "retrying";

export type AgentType =
  | "orchestrator"
  | "requirements"
  | "planner"
  | "game_designer"
  | "roblox_architect"
  | "lua_generator"
  | "ui_generator"
  | "asset_planner"
  | "database_designer"
  | "documentation"
  | "tester"
  | "debugger"
  | "performance";
