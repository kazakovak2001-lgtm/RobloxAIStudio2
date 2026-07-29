/**
 * StorageProvider — Abstract persistence layer for SaaS foundation.
 *
 * Synchronous reads and compatibility writes are retained for existing bounded
 * internal consumers. Request handlers that claim durable success must use the
 * awaited mutation methods so persistence rejection is observable.
 */

export type DurableStorageOperation = "set" | "delete" | "transaction";

export class DurableStorageError extends Error {
  readonly code = "DURABLE_STORAGE_MUTATION_FAILED";
  readonly cause?: unknown;

  constructor(
    message: string,
    readonly operation: DurableStorageOperation,
    options?: { cause?: unknown },
  ) {
    super(message);
    this.name = "DurableStorageError";
    this.cause = options?.cause;
  }
}

export type DurableMutation =
  | {
      operation: "set";
      collection: string;
      id: string;
      data: unknown;
    }
  | {
      operation: "delete";
      collection: string;
      id: string;
    };

export interface DurableMutationResult {
  operation: DurableMutation["operation"];
  collection: string;
  id: string;
  /** Present only for delete operations. */
  deleted?: boolean;
}

export type StorageAvailability = "available" | "degraded" | "unavailable";

export interface StorageOperationalStatus {
  availability: StorageAvailability;
  durability: "ephemeral" | "durable";
  pendingMutations: number;
  lastFailureAt?: string;
}

export interface StorageProvider {
  get<T>(collection: string, id: string): T | null;
  /** Compatibility write. Request-level durable paths must use setDurable. */
  set<T>(collection: string, id: string, data: T): void;
  /** Compatibility delete. Request-level durable paths must use deleteDurable. */
  delete(collection: string, id: string): boolean;
  /** Resolve only after the durable write has been acknowledged. */
  setDurable<T>(collection: string, id: string, data: T): Promise<void>;
  /** Resolve only after the durable delete has been acknowledged. */
  deleteDurable(collection: string, id: string): Promise<boolean>;
  /**
   * Apply all mutations atomically. No cache change may become visible until
   * every durable mutation has committed. A rejection preserves the exact
   * pre-transaction cache state.
   */
  applyDurableBatch(
    mutations: readonly DurableMutation[],
  ): Promise<readonly DurableMutationResult[]>;
  /** Provider-neutral operational state for health and degradation reporting. */
  getOperationalStatus(): StorageOperationalStatus;
  list<T>(collection: string, filter?: (item: T) => boolean): T[];
  count(collection: string): number;
  /** Resolve once durable storage has loaded its read cache. */
  ready?(): Promise<void>;
  /** Wait for accepted write-through operations before shutdown. */
  flush?(): Promise<void>;
  /** Release storage resources during graceful shutdown. */
  close?(): Promise<void>;
}

export class InMemoryStorageProvider implements StorageProvider {
  private store: Map<string, Map<string, unknown>> = new Map();

  get<T>(collection: string, id: string): T | null {
    return (this.store.get(collection)?.get(id) as T) ?? null;
  }

  set<T>(collection: string, id: string, data: T): void {
    if (!this.store.has(collection)) this.store.set(collection, new Map());
    this.store.get(collection)!.set(id, data);
  }

  delete(collection: string, id: string): boolean {
    return this.store.get(collection)?.delete(id) ?? false;
  }

  async setDurable<T>(collection: string, id: string, data: T): Promise<void> {
    this.set(collection, id, data);
  }

  async deleteDurable(collection: string, id: string): Promise<boolean> {
    return this.delete(collection, id);
  }

  async applyDurableBatch(
    mutations: readonly DurableMutation[],
  ): Promise<readonly DurableMutationResult[]> {
    const stagedCollections = new Map<string, Map<string, unknown>>();
    const getStagedCollection = (collection: string) => {
      let staged = stagedCollections.get(collection);
      if (!staged) {
        staged = new Map(this.store.get(collection) ?? []);
        stagedCollections.set(collection, staged);
      }
      return staged;
    };

    try {
      const results = mutations.map<DurableMutationResult>((mutation) => {
        if (!mutation.collection || !mutation.id) {
          throw new Error("Transaction mutations require collection and id");
        }

        const collection = getStagedCollection(mutation.collection);
        if (mutation.operation === "set") {
          collection.set(mutation.id, mutation.data);
          return {
            operation: mutation.operation,
            collection: mutation.collection,
            id: mutation.id,
          };
        }

        const deleted = collection.delete(mutation.id);
        return {
          operation: mutation.operation,
          collection: mutation.collection,
          id: mutation.id,
          deleted,
        };
      });

      for (const [collection, staged] of stagedCollections) {
        this.store.set(collection, staged);
      }
      return results;
    } catch (error) {
      throw new DurableStorageError(
        "In-memory durable transaction failed",
        "transaction",
        { cause: error },
      );
    }
  }

  getOperationalStatus(): StorageOperationalStatus {
    return {
      availability: "available",
      durability: "ephemeral",
      pendingMutations: 0,
    };
  }

  list<T>(collection: string, filter?: (item: T) => boolean): T[] {
    const coll = this.store.get(collection);
    if (!coll) return [];
    const items = [...coll.values()] as T[];
    return filter ? items.filter(filter) : items;
  }

  count(collection: string): number {
    return this.store.get(collection)?.size ?? 0;
  }

  async ready(): Promise<void> {}

  async flush(): Promise<void> {}

  async close(): Promise<void> {}
}
