/**
 * Applies the existing PostgreSQL migration registry when PostgreSQL storage
 * is selected. In-memory development mode remains dependency-free.
 */

import { MIGRATIONS } from "./migrations";

interface QueryablePool {
  query(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: Array<{ version?: number }> }>;
  end?(): Promise<void>;
}

export async function runMigrations(
  poolFactory?: () => Promise<QueryablePool>,
): Promise<number> {
  if ((process.env.STORAGE_PROVIDER ?? "inmemory") !== "postgres") return 0;
  if (!process.env.DATABASE_URL) {
    throw new Error("STORAGE_PROVIDER=postgres requires DATABASE_URL.");
  }

  const suppliedPool = await poolFactory?.();
  const pool =
    suppliedPool ?? (await createPostgresPool(process.env.DATABASE_URL));
  const ownsPool = !suppliedPool;

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    const existing = await pool.query(
      "SELECT version FROM schema_migrations ORDER BY version ASC",
    );
    const applied = new Set(existing.rows.map((row) => row.version));
    let count = 0;

    for (const migration of [...MIGRATIONS].sort(
      (left, right) => left.version - right.version,
    )) {
      if (applied.has(migration.version)) continue;
      await pool.query("BEGIN");
      try {
        await pool.query(migration.sql);
        await pool.query(
          "INSERT INTO schema_migrations (version, name) VALUES ($1, $2)",
          [migration.version, migration.name],
        );
        await pool.query("COMMIT");
        count++;
      } catch (error) {
        await pool.query("ROLLBACK");
        throw error;
      }
    }

    return count;
  } finally {
    if (ownsPool) await pool.end?.();
  }
}

async function createPostgresPool(connectionString: string) {
  const { default: pg } = await import("pg");
  return new pg.Pool({ connectionString }) as unknown as QueryablePool;
}
