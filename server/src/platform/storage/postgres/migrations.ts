/**
 * SQL Migrations — Schema definitions for PostgreSQL persistence layer.
 */

export const MIGRATIONS = [
  {
    version: 1,
    name: "create_users",
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(128) NOT NULL,
        password_hash VARCHAR(256),
        role VARCHAR(32) NOT NULL DEFAULT 'free',
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        tier VARCHAR(32) NOT NULL DEFAULT 'free',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        active BOOLEAN NOT NULL DEFAULT TRUE
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
    `,
  },
  {
    version: 2,
    name: "create_projects",
    sql: `
      CREATE TABLE IF NOT EXISTS projects (
        id VARCHAR(64) PRIMARY KEY,
        owner_id VARCHAR(64) NOT NULL REFERENCES users(id),
        name VARCHAR(255) NOT NULL,
        description TEXT DEFAULT '',
        genre VARCHAR(64) DEFAULT 'adventure',
        status VARCHAR(32) NOT NULL DEFAULT 'draft',
        quality_score INTEGER DEFAULT 0,
        generation_count INTEGER DEFAULT 0,
        script_count INTEGER DEFAULT 0,
        asset_count INTEGER DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
      CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
      CREATE INDEX IF NOT EXISTS idx_projects_created ON projects(created_at);
    `,
  },
  {
    version: 3,
    name: "create_generation_jobs",
    sql: `
      CREATE TABLE IF NOT EXISTS generation_jobs (
        id VARCHAR(64) PRIMARY KEY,
        project_id VARCHAR(64) NOT NULL REFERENCES projects(id),
        user_id VARCHAR(64) NOT NULL REFERENCES users(id),
        status VARCHAR(32) NOT NULL DEFAULT 'queued',
        priority INTEGER DEFAULT 5,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        error TEXT,
        result JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        started_at TIMESTAMP,
        completed_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON generation_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_jobs_user ON generation_jobs(user_id);
      CREATE INDEX IF NOT EXISTS idx_jobs_project ON generation_jobs(project_id);
    `,
  },
  {
    version: 4,
    name: "create_sessions",
    sql: `
      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL REFERENCES users(id),
        token VARCHAR(256) UNIQUE NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMP NOT NULL,
        last_activity TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    `,
  },
  {
    version: 5,
    name: "create_usage_records",
    sql: `
      CREATE TABLE IF NOT EXISTS usage_records (
        user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id),
        project_count INTEGER DEFAULT 0,
        generation_count INTEGER DEFAULT 0,
        job_count INTEGER DEFAULT 0,
        last_activity_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `,
  },
  {
    version: 6,
    name: "create_audit_logs",
    sql: `
      CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(64) PRIMARY KEY,
        pipeline_id VARCHAR(64),
        event_type VARCHAR(64) NOT NULL,
        stage VARCHAR(64),
        message TEXT,
        metadata JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_pipeline ON audit_logs(pipeline_id);
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
    `,
  },
];

export function getMigrationSQL(): string {
  return MIGRATIONS.map(
    (m) => `-- Migration ${m.version}: ${m.name}\n${m.sql}`,
  ).join("\n\n");
}
