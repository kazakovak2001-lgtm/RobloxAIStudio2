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
}

export async function runMigrations(
  poolFactory?: () => Promise<QueryablePool>,
): Promise<number> {
  if ((process.env.STORAGE_PROVIDER ?? "inmemory") !== "postgres") return 0;
  if (!process.env.DATABASE_URL) {
    console.warn("[migrations] DATABASE_URL is not configured.");
    return 0;
  }

  const pool =
    (await poolFactory?.()) ??
    (await createPostgresPool(process.env.DATABASE_URL));

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
}

async function createPostgresPool(connectionString: string) {
  const { default: pg } = await import("pg");
  return new pg.Pool({ connectionString }) as unknown as QueryablePool;
}
