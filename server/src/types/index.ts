export interface AgentInput {
  [key: string]: unknown;
}

// Re-export GameDesignSeed for agent convenience
export type { GameDesignSeed } from "./gameDesignSeed";

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

export { LLMError } from "./llm";
export type { LLMOptions, LLMProvider, LLMResponse } from "./llm";

export type AgentStatus =
  "idle" | "running" | "completed" | "failed" | "retrying";

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
