/**
 * PostgresStorageProvider — Production persistence using cache-with-write-through.
 *
 * Architecture: synchronous reads from an in-memory cache with durable,
 * ordered write-through to PostgreSQL. Awaited mutation methods commit the
 * database operation before exposing the new cache state. Legacy synchronous
 * writes remain compatibility-only until DATA-201B migrates every request path.
 */

import {
  DurableStorageConflictError,
  DurableStorageError,
  type DurableMutation,
  type StorageProvider,
} from "../StorageProvider";

export interface PostgresConfig {
  connectionString: string;
  poolSize: number;
  poolTimeout: number;
  /** Reject startup instead of degrading to cache-only storage. */
  strict?: boolean;
}

export const DEFAULT_POSTGRES_CONFIG: PostgresConfig = {
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://studio:studio_dev@localhost:5432/roblox_ai_studio",
  poolSize: parseInt(process.env.POOL_SIZE ?? "10", 10),
  poolTimeout: parseInt(process.env.POOL_TIMEOUT ?? "30000", 10),
};

const KV_TABLE = "kv_store";
export interface QueryResult {
  rows: Array<Record<string, unknown>>;
}

export interface Queryable {
  query(text: string, params?: unknown[]): Promise<QueryResult>;
}

export interface QueryableClient extends Queryable {
  release(): void;
}

export interface QueryablePool extends Queryable {
  connect(): Promise<QueryableClient>;
  end(): Promise<void>;
}

export type PostgresPoolFactory = (
  config: PostgresConfig,
) => QueryablePool | Promise<QueryablePool>;

export interface PostgresStorageDependencies {
  createPool?: PostgresPoolFactory;
}

export class PostgresStorageProvider implements StorageProvider {
  private cache: Map<string, Map<string, unknown>> = new Map();
  private config: PostgresConfig;
  private dependencies: PostgresStorageDependencies;
  private pool: QueryablePool | null = null;
  private connected = false;
  private initialization: Promise<void> | null = null;
  private pendingWrites = new Set<Promise<void>>();
  private writeTail: Promise<void> = Promise.resolve();

  constructor(
    config?: Partial<PostgresConfig>,
    dependencies: PostgresStorageDependencies = {},
  ) {
    this.config = { ...DEFAULT_POSTGRES_CONFIG, ...config };
    this.dependencies = dependencies;
  }

  // ─── StorageProvider Interface (sync reads + compatibility writes) ─────

  get<T>(collection: string, id: string): T | null {
    return (this.getCollection(collection).get(id) as T) ?? null;
  }

  set<T>(collection: string, id: string, data: T): void {
    this.getCollection(collection).set(id, data);
    this.scheduleWrite(() => this.persistSet(collection, id, data));
  }

  delete(collection: string, id: string): boolean {
    const deleted = this.getCollection(collection).delete(id);
    if (deleted) this.scheduleWrite(() => this.persistDelete(collection, id));
    return deleted;
  }

  async setDurable<T>(collection: string, id: string, data: T): Promise<void> {
    try {
      await this.enqueueWrite(async () => {
        await this.persistSet(collection, id, data);
        this.getCollection(collection).set(id, data);
      });
    } catch (error) {
      this.connected = false;
      throw new DurableStorageError(
        `Durable set failed for ${collection}/${id}`,
        "set",
        { cause: error },
      );
    }
  }

  async deleteDurable(collection: string, id: string): Promise<boolean> {
    const collectionCache = this.getCollection(collection);
    if (!collectionCache.has(id)) return false;

    try {
      await this.enqueueWrite(async () => {
        await this.persistDelete(collection, id);
        collectionCache.delete(id);
      });
      return true;
    } catch (error) {
      this.connected = false;
      throw new DurableStorageError(
        `Durable delete failed for ${collection}/${id}`,
        "delete",
        { cause: error },
      );
    }
  }

  async mutateDurably(mutations: readonly DurableMutation[]): Promise<void> {
    if (mutations.length === 0) return;
    const batch = [...mutations];

    try {
      await this.enqueueWrite(async () => {
        const pool = this.requireConnectedPool();
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          for (const mutation of batch) {
            if (mutation.type === "set") {
              await this.persistSetWith(
                client,
                mutation.collection,
                mutation.id,
                mutation.data,
              );
            } else {
              await this.persistDeleteWith(
                client,
                mutation.collection,
                mutation.id,
                mutation.requireExisting ?? false,
              );
            }
          }
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK").catch(() => undefined);
          throw error;
        } finally {
          client.release();
        }

        this.applyCacheMutations(batch);
      });
    } catch (error) {
      if (error instanceof DurableStorageConflictError) throw error;
      this.connected = false;
      throw new DurableStorageError("Durable batch mutation failed", "batch", {
        cause: error,
      });
    }
  }

  list<T>(collection: string, filter?: (item: T) => boolean): T[] {
    const items = [...this.getCollection(collection).values()] as T[];
    return filter ? items.filter(filter) : items;
  }

  count(collection: string): number {
    return this.getCollection(collection).size;
  }

  // ─── PostgreSQL-specific methods ──────────────────────────────────

  async transaction<T>(fn: () => T): Promise<T> {
    // Retained only for source compatibility. New multi-record durable paths use
    // mutateDurably so the full database and cache boundary is explicit.
    return fn();
  }

  ready(): Promise<void> {
    this.initialization ??= this.initialize();
    return this.initialization;
  }

  async flush(): Promise<void> {
    if (this.initialization) await this.initialization;
    await Promise.all([...this.pendingWrites]);
  }

  async close(): Promise<void> {
    await this.flush();
    if (this.pool) await this.pool.end();
    this.pool = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async healthCheck(): Promise<{
    connected: boolean;
    latencyMs: number;
    poolSize: number;
    pendingTransactions: number;
    mode: string;
  }> {
    try {
      await this.ready();
    } catch {
      // A strict provider reports the unavailable state here; bootstrap is the
      // boundary that turns the same failure into a rejected application start.
    }
    if (!this.pool || !this.connected) {
      return {
        connected: false,
        latencyMs: 0,
        poolSize: 0,
        pendingTransactions: this.pendingWrites.size,
        mode: "cache-only",
      };
    }
    const start = Date.now();
    try {
      await this.pool.query("SELECT 1");
      return {
        connected: true,
        latencyMs: Date.now() - start,
        poolSize: this.config.poolSize,
        pendingTransactions: this.pendingWrites.size,
        mode: "cache-with-write-through",
      };
    } catch {
      return {
        connected: false,
        latencyMs: Date.now() - start,
        poolSize: 0,
        pendingTransactions: this.pendingWrites.size,
        mode: "cache-only (db error)",
      };
    }
  }

  getConfig(): PostgresConfig {
    return { ...this.config };
  }

  // ─── Private ──────────────────────────────────────────────────────

  private getCollection(name: string): Map<string, unknown> {
    if (!this.cache.has(name)) this.cache.set(name, new Map());
    return this.cache.get(name)!;
  }

  private applyCacheMutations(mutations: readonly DurableMutation[]): void {
    for (const mutation of mutations) {
      const collection = this.getCollection(mutation.collection);
      if (mutation.type === "set") {
        collection.set(mutation.id, mutation.data);
      } else {
        collection.delete(mutation.id);
      }
    }
  }

  private async initialize(): Promise<void> {
    let candidatePool: QueryablePool | null = null;
    try {
      candidatePool = this.dependencies.createPool
        ? await this.dependencies.createPool(this.config)
        : await this.createDefaultPool();

      // Test connection
      await candidatePool.query("SELECT 1");

      // kv_store is owned by the migration registry. Loading only happens after
      // bootstrap has successfully applied that registry.
      const { rows } = await candidatePool.query(
        `SELECT collection, id, data FROM ${KV_TABLE}`,
      );
      for (const row of rows) {
        const collection = row.collection;
        const id = row.id;
        if (typeof collection !== "string" || typeof id !== "string") continue;
        this.getCollection(collection).set(id, row.data);
      }

      this.pool = candidatePool;
      this.connected = true;

      console.log(
        `[PostgresStorage] Connected — loaded ${rows.length} records into cache (pool=${this.config.poolSize})`,
      );
    } catch (err) {
      if (candidatePool) await candidatePool.end().catch(() => undefined);
      this.connected = false;
      this.pool = null;
      const message = (err as Error).message;
      if (this.config.strict) {
        throw new Error(`PostgreSQL storage initialization failed: ${message}`);
      }
      console.warn(
        "[PostgresStorage] Connection failed — running in cache-only mode:",
        message,
      );
    }
  }

  private async createDefaultPool(): Promise<QueryablePool> {
    // Dynamic import preserves the dependency-free in-memory/test path.
    const pg = await import("pg").catch(() => null);
    if (!pg) throw new Error("The pg package is not available");

    const Pool = pg.Pool ?? pg.default?.Pool;
    if (!Pool) throw new Error("The pg Pool constructor is not available");

    return new Pool({
      connectionString: this.config.connectionString,
      max: this.config.poolSize,
      idleTimeoutMillis: this.config.poolTimeout,
    }) as QueryablePool;
  }

  private enqueueWrite(write: () => Promise<void>): Promise<void> {
    const operation = this.writeTail.then(async () => {
      await this.ready();
      await write();
    });

    // A rejected operation must not poison later mutations. The original
    // promise is still returned to awaited callers so they observe rejection.
    this.writeTail = operation.catch(() => undefined);
    const tracked = operation.then(
      () => undefined,
      () => undefined,
    );
    this.pendingWrites.add(tracked);
    void tracked.finally(() => this.pendingWrites.delete(tracked));
    return operation;
  }

  private scheduleWrite(write: () => Promise<void>): void {
    // Compatibility writes intentionally retain historical non-awaited behavior.
    // DATA-201B will remove request-level consumers of this path.
    if (!this.initialization && !this.connected) return;

    void this.enqueueWrite(write).catch((error: unknown) => {
      this.connected = false;
      console.error(
        "[PostgresStorage] Compatibility write failed:",
        error instanceof Error ? error.message : error,
      );
    });
  }

  private requireConnectedPool(): QueryablePool {
    if (!this.pool || !this.connected) {
      throw new Error("PostgreSQL connection is unavailable");
    }
    return this.pool;
  }

  private async persistSet(
    collection: string,
    id: string,
    data: unknown,
  ): Promise<void> {
    await this.persistSetWith(
      this.requireConnectedPool(),
      collection,
      id,
      data,
    );
  }

  private async persistDelete(collection: string, id: string): Promise<void> {
    await this.persistDeleteWith(this.requireConnectedPool(), collection, id);
  }

  private async persistSetWith(
    queryable: Queryable,
    collection: string,
    id: string,
    data: unknown,
  ): Promise<void> {
    await queryable.query(
      `INSERT INTO ${KV_TABLE} (collection, id, data) VALUES ($1, $2, $3)
       ON CONFLICT (collection, id) DO UPDATE SET data = $3, updated_at = NOW()`,
      [collection, id, JSON.stringify(data)],
    );
  }

  private async persistDeleteWith(
    queryable: Queryable,
    collection: string,
    id: string,
    requireExisting = false,
  ): Promise<void> {
    const result = await queryable.query(
      requireExisting
        ? `DELETE FROM ${KV_TABLE} WHERE collection = $1 AND id = $2 RETURNING id`
        : `DELETE FROM ${KV_TABLE} WHERE collection = $1 AND id = $2`,
      [collection, id],
    );
    if (requireExisting && result.rows.length === 0) {
      throw new DurableStorageConflictError(
        `Required durable record is unavailable: ${collection}/${id}`,
        collection,
        id,
      );
    }
  }
}
