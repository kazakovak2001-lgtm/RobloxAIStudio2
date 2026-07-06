/**
 * RetryPolicy.ts + ProviderFallbackManager — Retry and fallback logic.
 */

import type { BaseProvider } from "./BaseProvider";
import type { ProviderRequest, NormalizedResponse } from "./types";
import { ProviderRegistry } from "./ProviderRegistry";
import { ResponseNormalizer } from "./ResponseNormalizer";
import { ProviderHealthService } from "./ProviderHealthService";

export interface RetryConfig {
  maxRetries: number;
  backoffMs: number;
}

export class ProviderFallbackManager {
  private registry: ProviderRegistry;
  private health: ProviderHealthService;
  private normalizer: ResponseNormalizer;
  private retryConfig: RetryConfig;

  constructor(
    registry: ProviderRegistry,
    health: ProviderHealthService,
    config?: Partial<RetryConfig>,
  ) {
    this.registry = registry;
    this.health = health;
    this.normalizer = new ResponseNormalizer();
    this.retryConfig = { maxRetries: 2, backoffMs: 500, ...config };
  }

  /**
   * Execute a request with retry + fallback to next provider.
   */
  async execute(request: ProviderRequest): Promise<NormalizedResponse> {
    const providers = this.registry.getByPriority();
    if (providers.length === 0)
      return {
        success: false,
        content: "",
        provider: "mock",
        model: "",
        tokensUsed: 0,
        durationMs: 0,
        error: "No providers available",
      };

    for (const provider of providers) {
      const result = await this.tryProvider(provider, request);
      if (result.success) return result;
    }

    return {
      success: false,
      content: "",
      provider: providers[0]?.type ?? "mock",
      model: "",
      tokensUsed: 0,
      durationMs: 0,
      error: "All providers failed",
    };
  }

  private async tryProvider(
    provider: BaseProvider,
    request: ProviderRequest,
  ): Promise<NormalizedResponse> {
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const response = await provider.complete(request);
        const normalized = this.normalizer.normalize(response);
        if (normalized.success) {
          this.health.recordSuccess(provider.type, response.durationMs);
          return normalized;
        }
      } catch {
        this.health.recordFailure(provider.type);
        if (attempt < this.retryConfig.maxRetries) {
          await this.delay(this.retryConfig.backoffMs * (attempt + 1));
        }
      }
    }
    return {
      success: false,
      content: "",
      provider: provider.type,
      model: "",
      tokensUsed: 0,
      durationMs: 0,
      error: `Provider ${provider.type} exhausted retries`,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
