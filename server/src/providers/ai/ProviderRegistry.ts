/**
 * ProviderRegistry.ts — Central registry of AI providers.
 */

import type { BaseProvider } from "./BaseProvider";
import type { ProviderType, ProviderCapability } from "./types";

export class ProviderRegistry {
  private providers: Map<ProviderType, BaseProvider> = new Map();

  register(provider: BaseProvider): void {
    this.providers.set(provider.type, provider);
  }
  get(type: ProviderType): BaseProvider | undefined {
    return this.providers.get(type);
  }
  has(type: ProviderType): boolean {
    return this.providers.has(type);
  }
  getAll(): BaseProvider[] {
    return [...this.providers.values()];
  }
  getEnabled(): BaseProvider[] {
    return this.getAll().filter((p) => p.enabled && p.status !== "disabled");
  }
  getAvailable(): BaseProvider[] {
    return this.getEnabled().filter(
      (p) => p.status === "available" || p.status === "degraded",
    );
  }
  getByPriority(): BaseProvider[] {
    return this.getAvailable().sort((a, b) => a.priority - b.priority);
  }
  get size(): number {
    return this.providers.size;
  }

  /**
   * Find a provider that matches required capabilities.
   */
  findByCapability(
    required: Partial<ProviderCapability>,
  ): BaseProvider | undefined {
    return this.getByPriority().find((p) => {
      const cap = p.capability as unknown as Record<string, unknown>;
      for (const [key, val] of Object.entries(required)) {
        if (val === true && !cap[key]) return false;
        if (typeof val === "number" && (cap[key] as number) < val) return false;
      }
      return true;
    });
  }
}
