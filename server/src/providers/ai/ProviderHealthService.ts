/**
 * ProviderHealthService.ts — Tracks provider health + auto-disable on repeated failures.
 */

import type { ProviderType, ProviderHealthData } from "./types";
import { ProviderRegistry } from "./ProviderRegistry";

export class ProviderHealthService {
  private health: Map<ProviderType, ProviderHealthData> = new Map();
  private maxConsecutiveFailures = 5;

  constructor(private registry: ProviderRegistry) {}

  recordSuccess(provider: ProviderType, latencyMs: number): void {
    const h = this.getOrCreate(provider);
    h.requestCount++;
    h.latencyMs =
      (h.latencyMs * (h.requestCount - 1) + latencyMs) / h.requestCount;
    h.consecutiveFailures = 0;
    h.status = "available";
    h.lastCheck = Date.now();
    h.failureRate = h.failureCount / h.requestCount;
  }

  recordFailure(provider: ProviderType): void {
    const h = this.getOrCreate(provider);
    h.requestCount++;
    h.failureCount++;
    h.consecutiveFailures++;
    h.lastCheck = Date.now();
    h.failureRate = h.failureCount / h.requestCount;
    if (h.consecutiveFailures >= this.maxConsecutiveFailures) {
      h.status = "unavailable";
      this.registry.get(provider)?.setStatus("unavailable");
    } else if (h.consecutiveFailures >= 2) {
      h.status = "degraded";
      this.registry.get(provider)?.setStatus("degraded");
    }
  }

  getHealth(provider: ProviderType): ProviderHealthData | undefined {
    return this.health.get(provider);
  }
  getAllHealth(): ProviderHealthData[] {
    return [...this.health.values()];
  }

  private getOrCreate(provider: ProviderType): ProviderHealthData {
    if (!this.health.has(provider)) {
      this.health.set(provider, {
        provider,
        status: "available",
        lastCheck: Date.now(),
        latencyMs: 0,
        requestCount: 0,
        failureCount: 0,
        failureRate: 0,
        consecutiveFailures: 0,
      });
    }
    return this.health.get(provider)!;
  }
}
