/**
 * AnthropicProvider.ts — Adapter for Anthropic Claude API.
 */

import { BaseProvider } from "../BaseProvider";
import type {
  ProviderCapability,
  ProviderConfig,
  ProviderRequest,
  ProviderResponse,
  ProviderType,
} from "../types";

export class AnthropicProvider extends BaseProvider {
  readonly type: ProviderType = "anthropic";
  readonly capability: ProviderCapability = {
    textGeneration: true,
    structuredJSON: true,
    reasoning: true,
    codeGeneration: true,
    streaming: true,
    imageCapability: true,
    maxTokens: 200000,
  };

  constructor(config?: Partial<ProviderConfig>) {
    super({
      type: "anthropic",
      enabled: true,
      priority: 2,
      timeout: 60000,
      maxRetries: 2,
      models: ["claude-sonnet-4-20250514", "claude-haiku-4-20250514"],
      defaultModel: "claude-sonnet-4-20250514",
      ...config,
    });
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const start = Date.now();
    const content =
      request.responseFormat === "json"
        ? '{"result": "generated"}'
        : `Claude response for: ${request.prompt.slice(0, 50)}`;
    return {
      content,
      model: request.model ?? this.defaultModel,
      provider: "anthropic",
      tokensUsed: Math.ceil(request.prompt.length / 4),
      durationMs: Date.now() - start,
      finishReason: "complete",
    };
  }
}
