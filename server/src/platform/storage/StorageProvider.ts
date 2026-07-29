/**
 * StorageProvider — Abstract persistence layer for SaaS foundation.
 *
 * Synchronous reads and compatibility writes are retained for existing bounded
 * internal consumers. Request handlers that claim durable success must use the
 * awaited mutation methods so persistence rejection is observable.
 */

export type DurableMutation =
  | {
      type: "set";
      collection: string;
      id: string;
      data: unknown;
    }
  | {
      type: "delete";
      collection: string;
      id: string;
    };

export class DurableStorageError extends Error {
  readonly code = "DURABLE_STORAGE_MUTATION_FAILED";
  readonly cause?: unknown;

  constructor(
    message: string,
    readonly operation: "set" | "delete" | "batch",
    options?: { cause?: unknown },
  ) {
    super(message);
    this.name = "DurableStorageError";
    this.cause = options?.cause;
  }
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
   * Atomically acknowledge an ordered multi-record mutation batch. Providers
   * must expose no partial cache state when any operation is rejected.
   */
  mutateDurably(mutations: readonly DurableMutation[]): Promise<void>;
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
    await this.mutateDurably([{ type: "set", collection, id, data }]);
  }

  async deleteDurable(collection: string, id: string): Promise<boolean> {
    if (!this.store.get(collection)?.has(id)) return false;
    await this.mutateDurably([{ type: "delete", collection, id }]);
    return true;
  }

  async mutateDurably(mutations: readonly DurableMutation[]): Promise<void> {
    if (mutations.length === 0) return;

    const nextStore = new Map<string, Map<string, unknown>>();
    for (const [collection, values] of this.store) {
      nextStore.set(collection, new Map(values));
    }

    for (const mutation of mutations) {
      let collection = nextStore.get(mutation.collection);
      if (!collection) {
        collection = new Map();
        nextStore.set(mutation.collection, collection);
      }
      if (mutation.type === "set") {
        collection.set(mutation.id, mutation.data);
      } else {
        collection.delete(mutation.id);
      }
    }

    this.store = nextStore;
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
