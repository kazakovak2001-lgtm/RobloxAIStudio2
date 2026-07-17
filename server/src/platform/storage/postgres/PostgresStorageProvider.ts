/**
 * PostgresStorageProvider — Production persistence using cache-with-write-through.
 *
 * Architecture: Sync reads from in-memory cache, async writes to PostgreSQL.
 * The sync StorageProvider interface is preserved — consumers don't change.
 * On startup, all data is loaded from PostgreSQL into cache.
 *
 * Requires: DATABASE_URL environment variable and `pg` package.
 * If pg is unavailable, operates in cache-only mode (same as InMemory).
 */

import type { StorageProvider } from "../StorageProvider";

export interface PostgresConfig {
  connectionString: string;
  poolSize: number;
  poolTimeout: number;
}

export const DEFAULT_POSTGRES_CONFIG: PostgresConfig = {
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://studio:studio_dev@localhost:5432/roblox_ai_studio",
  poolSize: parseInt(process.env.POOL_SIZE ?? "10", 10),
  poolTimeout: parseInt(process.env.POOL_TIMEOUT ?? "30000", 10),
};

const KV_TABLE = "kv_store";
const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS ${KV_TABLE} (
    collection VARCHAR(64) NOT NULL,
    id VARCHAR(64) NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (collection, id)
  );
  CREATE INDEX IF NOT EXISTS idx_kv_collection ON ${KV_TABLE}(collection);
`;

export class PostgresStorageProvider implements StorageProvider {
  private cache: Map<string, Map<string, unknown>> = new Map();
  private config: PostgresConfig;
  private pool: unknown = null; // pg.Pool — dynamically loaded
  private connected = false;
  private initialized = false;

  constructor(config?: Partial<PostgresConfig>) {
    this.config = { ...DEFAULT_POSTGRES_CONFIG, ...config };
    // Attempt connection in background
    void this.initialize();
  }

  // ─── StorageProvider Interface (sync — reads from cache) ──────────

  get<T>(collection: string, id: string): T | null {
    return (this.getCollection(collection).get(id) as T) ?? null;
  }

  set<T>(collection: string, id: string, data: T): void {
    this.getCollection(collection).set(id, data);
    // Write-through to PostgreSQL (fire-and-forget)
    void this.persistSet(collection, id, data);
  }

  delete(collection: string, id: string): boolean {
    const deleted = this.getCollection(collection).delete(id);
    if (deleted) void this.persistDelete(collection, id);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this.pool as any).query("SELECT 1");
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
    if (this.initialized) return;
    this.initialized = true;

    try {
      // Dynamic import — graceful if pg not installed
      const pg = await import("pg").catch(() => null);
      if (!pg) {
        console.log(
          "[PostgresStorage] pg package not available — running in cache-only mode",
        );
        return;
      }

      const pool = new pg.Pool({
        connectionString: this.config.connectionString,
        max: this.config.poolSize,
        idleTimeoutMillis: this.config.poolTimeout,
      });

      // Test connection
      await pool.query("SELECT 1");
      this.pool = pool;
      this.connected = true;

      // Create table if not exists
      await pool.query(INIT_SQL);

      // Load all data into cache
      const { rows } = await pool.query(
        `SELECT collection, id, data FROM ${KV_TABLE}`,
      );
      for (const row of rows) {
        this.getCollection(row.collection).set(row.id, row.data);
      }

      console.log(
        `[PostgresStorage] Connected — loaded ${rows.length} records into cache (pool=${this.config.poolSize})`,
      );
    } catch (err) {
      console.warn(
        "[PostgresStorage] Connection failed — running in cache-only mode:",
        (err as Error).message,
      );
      this.connected = false;
    }
  }

  private async persistSet(
    collection: string,
    id: string,
    data: unknown,
  ): Promise<void> {
    if (!this.pool || !this.connected) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this.pool as any).query(
        `INSERT INTO ${KV_TABLE} (collection, id, data) VALUES ($1, $2, $3)
         ON CONFLICT (collection, id) DO UPDATE SET data = $3, updated_at = NOW()`,
        [collection, id, JSON.stringify(data)],
      );
    } catch (err) {
      console.warn(
        `[PostgresStorage] Write failed for ${collection}/${id}:`,
        (err as Error).message,
      );
    }
  }

  private async persistDelete(collection: string, id: string): Promise<void> {
    if (!this.pool || !this.connected) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this.pool as any).query(
        `DELETE FROM ${KV_TABLE} WHERE collection = $1 AND id = $2`,
        [collection, id],
      );
    } catch (err) {
      console.warn(
        `[PostgresStorage] Delete failed for ${collection}/${id}:`,
        (err as Error).message,
      );
    }
  }
}
