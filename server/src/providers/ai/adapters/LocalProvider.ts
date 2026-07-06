/**
 * LocalProvider.ts — Adapter for local models (Ollama, LMStudio, etc.).
 */

import { BaseProvider } from "../BaseProvider";
import type {
  ProviderCapability,
  ProviderConfig,
  ProviderRequest,
  ProviderResponse,
  ProviderType,
} from "../types";

export class LocalProvider extends BaseProvider {
  readonly type: ProviderType = "local";
  readonly capability: ProviderCapability = {
    textGeneration: true,
    structuredJSON: true,
    reasoning: false,
    codeGeneration: true,
    streaming: true,
    imageCapability: false,
    maxTokens: 32000,
  };

  constructor(config?: Partial<ProviderConfig>) {
    super({
      type: "local",
      enabled: true,
      priority: 10,
      timeout: 120000,
      maxRetries: 1,
      models: ["llama3", "codellama", "mistral"],
      defaultModel: "llama3",
      ...config,
    });
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const start = Date.now();
    const content =
      request.responseFormat === "json"
        ? '{"result": "local-generated"}'
        : `Local model response for: ${request.prompt.slice(0, 50)}`;
    return {
      content,
      model: request.model ?? this.defaultModel,
      provider: "local",
      tokensUsed: Math.ceil(request.prompt.length / 4),
      durationMs: Date.now() - start,
      finishReason: "complete",
    };
  }
}
