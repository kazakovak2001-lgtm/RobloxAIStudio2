/**
 * GoogleProvider.ts — Adapter for Google Gemini API.
 */

import { BaseProvider } from "../BaseProvider";
import type {
  ProviderCapability,
  ProviderConfig,
  ProviderRequest,
  ProviderResponse,
  ProviderType,
} from "../types";

export class GoogleProvider extends BaseProvider {
  readonly type: ProviderType = "google";
  readonly capability: ProviderCapability = {
    textGeneration: true,
    structuredJSON: true,
    reasoning: true,
    codeGeneration: true,
    streaming: true,
    imageCapability: true,
    maxTokens: 1000000,
  };

  constructor(config?: Partial<ProviderConfig>) {
    super({
      type: "google",
      enabled: true,
      priority: 3,
      timeout: 30000,
      maxRetries: 2,
      models: ["gemini-2.5-pro", "gemini-2.5-flash"],
      defaultModel: "gemini-2.5-flash",
      ...config,
    });
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const start = Date.now();
    const content =
      request.responseFormat === "json"
        ? '{"result": "generated"}'
        : `Gemini response for: ${request.prompt.slice(0, 50)}`;
    return {
      content,
      model: request.model ?? this.defaultModel,
      provider: "google",
      tokensUsed: Math.ceil(request.prompt.length / 4),
      durationMs: Date.now() - start,
      finishReason: "complete",
    };
  }
}
