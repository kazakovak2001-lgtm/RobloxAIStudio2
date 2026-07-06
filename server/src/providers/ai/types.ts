/**
 * AI Provider Integration types (v2.8)
 */

export type ProviderType = "openai" | "anthropic" | "google" | "local" | "mock";
export type ProviderStatus =
  "available" | "degraded" | "unavailable" | "disabled";

export interface ProviderCapability {
  textGeneration: boolean;
  structuredJSON: boolean;
  reasoning: boolean;
  codeGeneration: boolean;
  streaming: boolean;
  imageCapability: boolean;
  maxTokens: number;
}

export interface ProviderConfig {
  type: ProviderType;
  enabled: boolean;
  priority: number;
  timeout: number;
  maxRetries: number;
  models: string[];
  defaultModel: string;
}

export interface ProviderRequest {
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: "text" | "json";
  context?: Record<string, unknown>;
}

export interface ProviderResponse {
  content: string;
  model: string;
  provider: ProviderType;
  tokensUsed: number;
  durationMs: number;
  finishReason: "complete" | "length" | "error";
}

export interface NormalizedResponse {
  success: boolean;
  content: string;
  json?: unknown;
  provider: ProviderType;
  model: string;
  tokensUsed: number;
  durationMs: number;
  error?: string;
}

export interface ProviderHealthData {
  provider: ProviderType;
  status: ProviderStatus;
  lastCheck: number;
  latencyMs: number;
  requestCount: number;
  failureCount: number;
  failureRate: number;
  consecutiveFailures: number;
}

export interface ProviderMetricsData {
  totalRequests: number;
  totalTokens: number;
  averageLatencyMs: number;
  successRate: number;
  providerBreakdown: Record<
    string,
    { requests: number; tokens: number; avgLatency: number }
  >;
}
