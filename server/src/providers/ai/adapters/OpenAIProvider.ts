/**
 * OpenAIProvider.ts — Adapter for OpenAI API.
 * Actual API calls are behind the interface; this version uses mock when no key.
 */

import { BaseProvider } from "../BaseProvider";
import type {
  ProviderCapability,
  ProviderConfig,
  ProviderRequest,
  ProviderResponse,
  ProviderType,
} from "../types";

export class OpenAIProvider extends BaseProvider {
  readonly type: ProviderType = "openai";
  readonly capability: ProviderCapability = {
    textGeneration: true,
    structuredJSON: true,
    reasoning: true,
    codeGeneration: true,
    streaming: true,
    imageCapability: true,
    maxTokens: 128000,
  };

  constructor(config?: Partial<ProviderConfig>) {
    super({
      type: "openai",
      enabled: true,
      priority: 1,
      timeout: 30000,
      maxRetries: 2,
      models: ["gpt-4o", "gpt-4o-mini", "o1"],
      defaultModel: "gpt-4o-mini",
      ...config,
    });
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const start = Date.now();
    // In production: call OpenAI API. Here: stub response for testing.
    const content =
      request.responseFormat === "json"
        ? '{"result": "generated"}'
        : `Generated response for: ${request.prompt.slice(0, 50)}`;
    return {
      content,
      model: request.model ?? this.defaultModel,
      provider: "openai",
      tokensUsed: Math.ceil(request.prompt.length / 4),
      durationMs: Date.now() - start,
      finishReason: "complete",
    };
  }
}
