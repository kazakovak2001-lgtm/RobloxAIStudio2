import type {
  DurableStorageOperation,
  StorageOperationalStatus,
} from "./StorageProvider";

export type StorageFailureCategory =
  | "initialization"
  | "connectivity"
  | "durable-mutation";

export interface StorageFailureDetails {
  category: StorageFailureCategory;
  operation?: DurableStorageOperation;
  occurredAt: string;
}

export interface StorageRecoveryDetails {
  recoveredAt: string;
}

/**
 * Provider-neutral state machine for truthful storage health reporting.
 * Expected durable conflicts never enter this state machine because they are
 * application-level outcomes, not infrastructure degradation.
 */
export class StorageOperationalState {
  private lastFailure?: StorageFailureDetails;
  private lastRecovery?: StorageRecoveryDetails;

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
    this.lastRecovery = { recoveredAt };
    this.lastFailure = undefined;
  }

  snapshot(input: {
    connected: boolean;
    closed: boolean;
    durability: StorageOperationalStatus["durability"];
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
      durability: input.durability,
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
      ...(this.lastRecovery
        ? { lastRecoveryAt: this.lastRecovery.recoveredAt }
        : {}),
    };
  }
}
