import {
  DurableStorageConflictError,
  type DurableMutation,
  type DurableMutationResult,
  type DurableStorageOperation,
  type StorageFailureCategory,
  type StorageOperationalStatus,
} from "../StorageProvider";
import { PostgresStorageProvider as BasePostgresStorageProvider } from "./PostgresStorageProvider";

class StorageOperationalState {
  private lastFailure?: {
    category: StorageFailureCategory;
    operation?: DurableStorageOperation;
    occurredAt: string;
  };
  private lastRecoveryAt?: string;

  markFailure(
    category: StorageFailureCategory,
    operation?: DurableStorageOperation,
    occurredAt = new Date().toISOString(),
  ): void {
    this.lastFailure = {
      category,
      ...(operation ? { operation } : {}),
      occurredAt,
    };
  }

  markRecovery(recoveredAt = new Date().toISOString()): void {
    if (!this.lastFailure) return;
    this.lastRecoveryAt = recoveredAt;
    this.lastFailure = undefined;
  }

  snapshot(input: {
    connected: boolean;
    closed: boolean;
    pendingMutations: number;
  }): StorageOperationalStatus {
    const availability = input.closed
      ? "unavailable"
      : this.lastFailure
        ? "degraded"
        : input.connected
          ? "available"
          : "unavailable";

    return {
      availability,
      durability: "durable",
      pendingMutations: input.pendingMutations,
      ...(this.lastFailure
        ? {
            lastFailureAt: this.lastFailure.occurredAt,
            failureCategory: this.lastFailure.category,
            ...(this.lastFailure.operation
              ? { failureOperation: this.lastFailure.operation }
              : {}),
          }
        : {}),
      ...(this.lastRecoveryAt ? { lastRecoveryAt: this.lastRecoveryAt } : {}),
    };
  }
}

export class PostgresStorageProvider extends BasePostgresStorageProvider {
  private readonly operationalState = new StorageOperationalState();
  private operationallyClosed = false;

  override async setDurable<T>(
    collection: string,
    id: string,
    data: T,
  ): Promise<void> {
    try {
      await super.setDurable(collection, id, data);
      this.operationalState.markRecovery();
    } catch (error) {
      this.operationalState.markFailure("durable-mutation", "set");
      throw error;
    }
  }

  override async deleteDurable(
    collection: string,
    id: string,
  ): Promise<boolean> {
    try {
      const deleted = await super.deleteDurable(collection, id);
      this.operationalState.markRecovery();
      return deleted;
    } catch (error) {
      this.operationalState.markFailure("durable-mutation", "delete");
      throw error;
    }
  }

  override async applyDurableBatch(
    mutations: readonly DurableMutation[],
  ): Promise<readonly DurableMutationResult[]> {
    try {
      const results = await super.applyDurableBatch(mutations);
      this.operationalState.markRecovery();
      return results;
    } catch (error) {
      if (error instanceof DurableStorageConflictError) throw error;
      this.operationalState.markFailure("durable-mutation", "transaction");
      throw error;
    }
  }

  override async ready(): Promise<void> {
    try {
      await super.ready();
    } catch (error) {
      this.operationalState.markFailure("initialization");
      throw error;
    }
  }

  override async healthCheck(): Promise<{
    connected: boolean;
    latencyMs: number;
    poolSize: number;
    pendingTransactions: number;
    mode: string;
  }> {
    const status = await super.healthCheck();
    if (status.connected) {
      this.operationalState.markRecovery();
    } else {
      this.operationalState.markFailure("connectivity");
    }
    return status;
  }

  override async close(): Promise<void> {
    await super.close();
    this.operationallyClosed = true;
  }

  override getOperationalStatus(): StorageOperationalStatus {
    const baseStatus = super.getOperationalStatus();
    return this.operationalState.snapshot({
      connected: super.isConnected(),
      closed: this.operationallyClosed,
      pendingMutations: baseStatus.pendingMutations,
    });
  }
}

export {
  DEFAULT_POSTGRES_CONFIG,
  type PostgresConfig,
} from "./PostgresStorageProvider";
export {
  DatabaseHealthCheck,
  type DatabaseHealthStatus,
} from "./DatabaseHealth";
export { MIGRATIONS, getMigrationSQL } from "./migrations";
