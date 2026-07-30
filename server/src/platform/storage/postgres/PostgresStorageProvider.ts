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
  type DurableMutationResult,
  type StorageOperationalStatus,
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

export interface QueryableClient {
  query(text: string, params?: unknown[]): Promise<QueryResult>;
  release(): void;
}

export interface QueryablePool {
  query(text: string, params?: unknown[]): Promise<QueryResult>;
  /** Required for true multi-statement transaction affinity. */
  connect?(): Promise<QueryableClient>;
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
  private compatibilityMutationVersions = new Map<string, number>();
  private lastFailureAt?: string;
  private closed = false;

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
    this.recordCompatibilityMutation(collection, id);
    this.getCollection(collection).set(id, data);
    this.scheduleWrite(() => this.persistSet(collection, id, data));
  }

  delete(collection: string, id: string): boolean {
    const deleted = this.getCollection(collection).delete(id);
    if (deleted) {
      this.recordCompatibilityMutation(collection, id);
      this.scheduleWrite(() => this.persistDelete(collection, id));
    }
    return deleted;
  }

  async setDurable<T>(collection: string, id: string, data: T): Promise<void> {
    try {
      await this.enqueueWrite(async () => {
        await this.persistSet(collection, id, data);
        this.getCollection(collection).set(id, data);
      });
    } catch (error) {
      await this.refreshOperationalStateAfterMutationFailure();
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
      await this.refreshOperationalStateAfterMutationFailure();
      throw new DurableStorageError(
        `Durable delete failed for ${collection}/${id}`,
        "delete",
        { cause: error },
      );
    }
  }

  async applyDurableBatch(
    mutations: readonly DurableMutation[],
  ): Promise<readonly DurableMutationResult[]> {
    if (mutations.length === 0) return [];
    this.validateMutations(mutations);

    try {
      let results: readonly DurableMutationResult[] = [];
      await this.enqueueWrite(async () => {
        const compatibilityVersions = new Map<string, number>();
        for (const mutation of mutations) {
          const key = this.mutationKey(mutation.collection, mutation.id);
          compatibilityVersions.set(
            key,
            this.compatibilityMutationVersions.get(key) ?? 0,
          );
        }

        const pool = this.pool;
        if (!pool || !this.connected) {
          throw new Error("PostgreSQL connection is unavailable");
        }
        if (!pool.connect) {
          throw new Error(
            "PostgreSQL pool does not provide a transaction-affine client",
          );
        }

        const client = await pool.connect();
        const pendingResults: DurableMutationResult[] = [];
        let committed = false;
        try {
          await client.query("BEGIN");
          for (const mutation of mutations) {
            if (mutation.operation === "set") {
              const result = await client.query(
                mutation.requireAbsent
                  ? `INSERT INTO ${KV_TABLE} (collection, id, data) VALUES ($1, $2, $3)
                     ON CONFLICT (collection, id) DO NOTHING RETURNING id`
                  : `INSERT INTO ${KV_TABLE} (collection, id, data) VALUES ($1, $2, $3)
                     ON CONFLICT (collection, id) DO UPDATE SET data = $3, updated_at = NOW()`,
                [
                  mutation.collection,
                  mutation.id,
                  JSON.stringify(mutation.data),
                ],
              );
              if (mutation.requireAbsent && result.rows.length === 0) {
                throw new DurableStorageConflictError(
                  `Required durable record already exists: ${mutation.collection}/${mutation.id}`,
                  mutation.collection,
                  mutation.id,
                );
              }
              pendingResults.push({
                operation: mutation.operation,
                collection: mutation.collection,
                id: mutation.id,
              });
              continue;
            }

            const result = await client.query(
              `DELETE FROM ${KV_TABLE} WHERE collection = $1 AND id = $2 RETURNING id`,
              [mutation.collection, mutation.id],
            );
            if (mutation.requireExisting && result.rows.length === 0) {
              throw new DurableStorageConflictError(
                `Required durable record is unavailable: ${mutation.collection}/${mutation.id}`,
                mutation.collection,
                mutation.id,
              );
            }
            pendingResults.push({
              operation: mutation.operation,
              collection: mutation.collection,
              id: mutation.id,
              deleted: result.rows.length > 0,
            });
          }

          await client.query("COMMIT");
          committed = true;
        } catch (error) {
          if (!committed) {
            await client.query("ROLLBACK").catch(() => undefined);
          }
          throw error;
        } finally {
          client.release();
        }

        // No cache mutation is published before the database COMMIT above.
        for (const mutation of mutations) {
          const key = this.mutationKey(mutation.collection, mutation.id);
          const capturedVersion = compatibilityVersions.get(key) ?? 0;
          const currentVersion =
            this.compatibilityMutationVersions.get(key) ?? 0;
          if (currentVersion !== capturedVersion) continue;

          const collection = this.getCollection(mutation.collection);
          if (mutation.operation === "set") {
            collection.set(mutation.id, mutation.data);
          } else {
            collection.delete(mutation.id);
          }
        }
        results = pendingResults;
      });
      return results;
    } catch (error) {
      if (error instanceof DurableStorageConflictError) throw error;
      await this.refreshOperationalStateAfterMutationFailure();
      throw new DurableStorageError(
        "Durable transaction failed",
        "transaction",
        {
          cause: error,
        },
      );
    }
  }

  getOperationalStatus(): StorageOperationalStatus {
    const availability = this.closed
      ? "unavailable"
      : this.connected
        ? "available"
        : this.lastFailureAt
          ? "degraded"
          : "unavailable";
    return {
      availability,
      durability: "durable",
      pendingMutations: this.pendingWrites.size,
      ...(this.lastFailureAt ? { lastFailureAt: this.lastFailureAt } : {}),
    };
  }

  list<T>(collection: string, filter?: (item: T) => boolean): T[] {
    const items = [...this.getCollection(collection).values()] as T[];
    return filter ? items.filter(filter) : items;
  }

  count(collection: string): number {
    return this.getCollection(collection).size;
  }

  // ─── PostgreSQL-specific methods ──────────────────────────────────

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
    this.closed = true;
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
    if (!this.pool || this.closed) {
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
      this.connected = true;
      return {
        connected: true,
        latencyMs: Date.now() - start,
        poolSize: this.config.poolSize,
        pendingTransactions: this.pendingWrites.size,
        mode: "cache-with-write-through",
      };
    } catch {
      this.markConnectionFailure();
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
      this.closed = false;

      console.log(
        `[PostgresStorage] Connected — loaded ${rows.length} records into cache (pool=${this.config.poolSize})`,
      );
    } catch (err) {
      if (candidatePool) await candidatePool.end().catch(() => undefined);
      this.markConnectionFailure();
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
    if (!this.initialization && !this.connected) return;

    void this.enqueueWrite(write).catch(async (error: unknown) => {
      await this.refreshOperationalStateAfterMutationFailure();
      console.error(
        "[PostgresStorage] Compatibility write failed:",
        error instanceof Error ? error.message : error,
      );
    });
  }

  private mutationKey(collection: string, id: string): string {
    return `${collection}\u0000${id}`;
  }

  private recordCompatibilityMutation(collection: string, id: string): void {
    const key = this.mutationKey(collection, id);
    this.compatibilityMutationVersions.set(
      key,
      (this.compatibilityMutationVersions.get(key) ?? 0) + 1,
    );
  }

  private validateMutations(mutations: readonly DurableMutation[]): void {
    for (const mutation of mutations) {
      if (!mutation.collection || !mutation.id) {
        throw new DurableStorageError(
          "Transaction mutations require collection and id",
          "transaction",
        );
      }
    }
  }

  private markConnectionFailure(): void {
    this.connected = false;
    this.lastFailureAt = new Date().toISOString();
  }

  private async refreshOperationalStateAfterMutationFailure(): Promise<void> {
    this.lastFailureAt = new Date().toISOString();
    if (!this.pool || this.closed) {
      this.connected = false;
      return;
    }

    try {
      await this.pool.query("SELECT 1");
      this.connected = true;
    } catch {
      this.connected = false;
    }
  }

  private async persistSet(
    collection: string,
    id: string,
    data: unknown,
  ): Promise<void> {
    if (!this.pool || !this.connected) {
      throw new Error("PostgreSQL connection is unavailable");
    }
    await this.pool.query(
      `INSERT INTO ${KV_TABLE} (collection, id, data) VALUES ($1, $2, $3)
       ON CONFLICT (collection, id) DO UPDATE SET data = $3, updated_at = NOW()`,
      [collection, id, JSON.stringify(data)],
    );
  }

  private async persistDelete(collection: string, id: string): Promise<void> {
    if (!this.pool || !this.connected) {
      throw new Error("PostgreSQL connection is unavailable");
    }
    await this.pool.query(
      `DELETE FROM ${KV_TABLE} WHERE collection = $1 AND id = $2`,
      [collection, id],
    );
  }
}
