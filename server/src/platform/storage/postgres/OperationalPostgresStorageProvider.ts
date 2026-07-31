import {
  DurableStorageConflictError,
  type DurableMutation,
  type DurableMutationResult,
  type StorageOperationalStatus,
} from "../StorageProvider";
import { StorageOperationalState } from "../StorageOperationalState";
import {
  PostgresStorageProvider as BasePostgresStorageProvider,
  type PostgresConfig,
  type PostgresStorageDependencies,
} from "./PostgresStorageProvider";

export class PostgresStorageProvider extends BasePostgresStorageProvider {
  private readonly operationalState = new StorageOperationalState();
  private operationallyClosed = false;

  constructor(
    config?: Partial<PostgresConfig>,
    dependencies: PostgresStorageDependencies = {},
  ) {
    super(config, dependencies);
  }

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
      durability: "durable",
      pendingMutations: baseStatus.pendingMutations,
    });
  }
}
