/**
 * StorageProvider — Abstract persistence layer for SaaS foundation.
 *
 * Synchronous reads and compatibility writes are retained for existing bounded
 * internal consumers. Request handlers that claim durable success must use the
 * awaited mutation methods so persistence rejection is observable.
 */

export class DurableStorageError extends Error {
  readonly code = "DURABLE_STORAGE_MUTATION_FAILED";

  constructor(
    message: string,
    readonly operation: "set" | "delete",
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "DurableStorageError";
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
