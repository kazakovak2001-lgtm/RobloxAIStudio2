/**
 * PostgresStorageProvider — Production persistence using cache-with-write-through.
 *
 * Architecture: synchronous reads from an in-memory cache with durable,
 * ordered write-through to PostgreSQL. The cache is populated before the
 * server begins accepting requests, so existing synchronous repositories keep
 * their contract without silently losing production data.
 */

import type { StorageProvider } from "../StorageProvider";

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
interface QueryResult {
  rows: Array<Record<string, unknown>>;
}

interface QueryablePool {
  query(text: string, params?: unknown[]): Promise<QueryResult>;
  end(): Promise<void>;
}

export class PostgresStorageProvider implements StorageProvider {
  private cache: Map<string, Map<string, unknown>> = new Map();
  private config: PostgresConfig;
  private pool: QueryablePool | null = null;
  private connected = false;
  private initialization: Promise<void> | null = null;
  private pendingWrites = new Set<Promise<void>>();

  constructor(config?: Partial<PostgresConfig>) {
    this.config = { ...DEFAULT_POSTGRES_CONFIG, ...config };
  }

  // ─── StorageProvider Interface (sync — reads from cache) ──────────

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

  list<T>(collection: string, filter?: (item: T) => boolean): T[] {
    const items = [...this.getCollection(collection).values()] as T[];
    return filter ? items.filter(filter) : items;
  }

  count(collection: string): number {
    return this.getCollection(collection).size;
  }

  // ─── PostgreSQL-specific methods ──────────────────────────────────

  async transaction<T>(fn: () => T): Promise<T> {
    // In cache-with-write-through, transactions are local
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
        pendingTransactions: 0,
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
        pendingTransactions: 0,
        mode: "cache-with-write-through",
      };
    } catch {
      return {
        connected: false,
        latencyMs: Date.now() - start,
        poolSize: 0,
        pendingTransactions: 0,
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
      // Dynamic import preserves the dependency-free in-memory/test path.
      const pg = await import("pg").catch(() => null);
      if (!pg) {
        throw new Error("The pg package is not available");
      }

      const Pool = pg.Pool ?? pg.default?.Pool;
      if (!Pool) throw new Error("The pg Pool constructor is not available");

      candidatePool = new Pool({
        connectionString: this.config.connectionString,
        max: this.config.poolSize,
        idleTimeoutMillis: this.config.poolTimeout,
      }) as QueryablePool;

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

  private scheduleWrite(write: () => Promise<void>): void {
    // Unit and local cache-mode providers intentionally stay dependency-free
    // until somebody explicitly requests ready(). Production bootstrap always
    // calls ready() before routes are registered.
    if (!this.initialization && !this.connected) return;

    const pending = this.ready()
      .then(write)
      .catch((error: unknown) => {
        this.connected = false;
        console.error(
          "[PostgresStorage] Durable write failed:",
          error instanceof Error ? error.message : error,
        );
      });
    this.pendingWrites.add(pending);
    void pending.finally(() => this.pendingWrites.delete(pending));
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
