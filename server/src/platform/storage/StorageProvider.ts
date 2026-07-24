/**
 * StorageProvider — Abstract persistence layer for SaaS foundation.
 * Supports local filesystem (dev) and future database adapters (production).
 */

export interface StorageProvider {
  get<T>(collection: string, id: string): T | null;
  set<T>(collection: string, id: string, data: T): void;
  delete(collection: string, id: string): boolean;
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
