export interface AIProvider {
  initialize(): Promise<void>;
  generate(prompt: string, options: AIRequestOptions): Promise<AIResponse>;
  stream?(prompt: string, options: AIRequestOptions, onChunk: (chunk: string) => void): Promise<void>;
  healthCheck(): Promise<boolean>;
  estimateCost(promptTokens: number, completionTokens: number): number;
  tokenUsage?(response: AIResponse): TokenUsage;
}

export interface AIRequestOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  systemPrompt?: string;
}

export interface AIResponse {
  content: string;
  model: string;
  finishReason?: string;
  raw?: unknown;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
  timestamp?: Date;
}

export interface AIConversation {
  id: string;
  projectId: string;
  messages: AIMessage[];
  metadata: Record<string, unknown>;
}

export interface PromptTemplate {
  id: string;
  agentType: string;
  system: string;
  user: string;
  variables: string[];
}

export interface AgentMemoryEntry {
  projectId: string;
  agentType: string;
  key: string;
  value: unknown;
  createdAt: Date;
}

export interface AIProviderHealth {
  provider: string;
  healthy: boolean;
  latencyMs?: number;
  checkedAt: Date;
}

export interface AIRoutingRule {
  agentType: string;
  preferredProvider: string;
  preferredModel: string;
  fallbackProvider?: string;
  fallbackModel?: string;
}

export interface AIUsageLog {
  id: string;
  projectId?: string;
  agentType?: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  latencyMs: number;
  success: boolean;
  error?: string;
  createdAt: Date;
}

export interface AIProviderConfig {
  id: string;
  type: "openai" | "anthropic" | "gemini" | "ollama";
  apiKey?: string;
  baseUrl?: string;
  models?: string[];
  enabled?: boolean;
}
