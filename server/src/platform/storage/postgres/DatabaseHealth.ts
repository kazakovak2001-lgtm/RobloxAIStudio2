/**
 * DatabaseHealth — Health check endpoint support for PostgreSQL.
 */

import type { PostgresStorageProvider } from "./PostgresStorageProvider";

export interface DatabaseHealthStatus {
  status: "healthy" | "degraded" | "unavailable";
  connected: boolean;
  latencyMs: number;
  poolSize: number;
  pendingTransactions: number;
  provider: string;
}

export class DatabaseHealthCheck {
  private provider: PostgresStorageProvider;

  constructor(provider: PostgresStorageProvider) {
    this.provider = provider;
  }

  async check(): Promise<DatabaseHealthStatus> {
    const health = await this.provider.healthCheck();
    return {
      status: health.connected
        ? health.latencyMs < 100
          ? "healthy"
          : "degraded"
        : "unavailable",
      connected: health.connected,
      latencyMs: health.latencyMs,
      poolSize: health.poolSize,
      pendingTransactions: health.pendingTransactions,
      provider: "postgres",
    };
  }
}
