# Production Deployment Guide

## Prerequisites

- **Docker** 20.10+ and Docker Compose v2
- **Node.js** 22 LTS (for local builds without Docker)
- **PostgreSQL** 14+ (if not using the Docker Compose setup)
- At least one AI provider API key (OpenAI, Anthropic, or Ollama for local inference)

---

## Quick Start with Docker Compose

The fastest way to run the full stack in production mode:

```bash
cd deploy/

# Copy and configure environment variables
cp ../.env.example .env
# Edit .env with your frontend origin, database URL, and AI provider keys

# Build and start all services
docker compose up -d --build

# Check status
docker compose ps
docker compose logs -f app
```

The application will be available at `http://localhost` (port 80 via nginx).

---

## Environment Variables

| Variable            | Required      | Default       | Description                                             |
| ------------------- | ------------- | ------------- | ------------------------------------------------------- |
| `NODE_ENV`          | Yes           | `development` | Set to `production` for deployment                      |
| `PORT`              | No            | `5000`        | Application server port                                 |
| `STORAGE_PROVIDER`  | No            | `inmemory`    | Set to `postgres` for persistent storage                |
| `DATABASE_URL`      | When postgres | —             | PostgreSQL connection string                            |
| `FRONTEND_URL`      | Production    | —             | Frontend URL for CORS (e.g., `https://your-domain.com`) |
| `OPENAI_API_KEY`    | Optional      | —             | OpenAI API key                                          |
| `ANTHROPIC_API_KEY` | Optional      | —             | Anthropic API key                                       |
| `GOOGLE_API_KEY`    | Optional      | —             | Google Gemini API key                                   |
| `OLLAMA_BASE_URL`   | Optional      | —             | Ollama server URL for local AI                          |

Authentication uses random opaque credentials backed by the configured
storage provider; there is no token-signing secret. Production access and
refresh credentials are delivered only through `Secure`, `HttpOnly`,
`SameSite=Lax`, host-only cookies. Refresh credentials are persisted only as
SHA-256 digests and are single-use after rotation.

---

## Database Setup and Migration

### Automatic Migrations

The server automatically runs pending migrations on startup when `STORAGE_PROVIDER=postgres`. The migration runner:

1. Creates a `schema_migrations` tracking table on first run
2. Checks which migrations have been applied
3. Applies pending migrations in version order
4. Logs each migration applied

Migrations are idempotent — running the server multiple times is safe.

### Manual Database Setup

If you prefer manual setup:

```bash
# Create database
createdb -U postgres roblox_ai_studio

# The server will apply migrations on first start
STORAGE_PROVIDER=postgres \
DATABASE_URL=postgresql://postgres:password@localhost:5432/roblox_ai_studio \
node dist/server/index.js
```

### In-Memory Mode

When `STORAGE_PROVIDER` is not set or set to `inmemory`, the application functions without PostgreSQL. All data lives in memory and resets on restart. Suitable for development and demos.

---

## Docker Deployment (Manual)

### Build the Image

```bash
docker build -t roblox-ai-studio:latest .
```

### Run the Container

```bash
docker run -d \
  --name roblox-ai-studio \
  -p 5000:5000 \
  -e NODE_ENV=production \
  -e STORAGE_PROVIDER=postgres \
  -e DATABASE_URL=postgresql://user:pass@host:5432/dbname \
  -e FRONTEND_URL=https://your-domain.example \
  roblox-ai-studio:latest
```

---

## Backup Procedures

### Automated Database Backups

Use the backup script for scheduled backups:

```bash
# Basic backup
DATABASE_URL=postgresql://user:pass@host:5432/dbname ./scripts/backup-database.sh

# Custom retention (keep 14 days)
RETENTION_DAYS=14 DATABASE_URL=... ./scripts/backup-database.sh

# Custom backup directory
BACKUP_DIR=/mnt/backups DATABASE_URL=... ./scripts/backup-database.sh
```

### Cron Schedule

Add to crontab for daily backups at 2 AM:

```cron
0 2 * * * DATABASE_URL=postgresql://user:pass@host:5432/dbname /app/scripts/backup-database.sh >> /var/log/backup.log 2>&1
```

### Restore from Backup

```bash
gunzip -c backups/roblox_ai_studio_20260716_020000.sql.gz | psql $DATABASE_URL
```

---

## Monitoring Recommendations

### Health Check Endpoints

- `GET /health` — Application health (includes LLM mode)
- `GET /health/database` — Database connection status
- `GET /health/storage` — Storage provider info

### Key Metrics to Monitor

- **Response time**: P50, P95, P99 latency on `/api/*` routes
- **Error rate**: 5xx responses per minute
- **WebSocket connections**: Active Socket.IO connection count
- **Database**: Connection pool usage, query latency
- **Memory**: Node.js heap usage (watch for leaks)
- **CPU**: Node.js event loop lag

### Recommended Tools

- **Uptime monitoring**: UptimeRobot, Pingdom, or similar (hit `/health`)
- **APM**: Datadog, New Relic, or open-source alternatives (Prometheus + Grafana)
- **Log aggregation**: Structured JSON logging → ELK stack, Loki, or CloudWatch

---

## Troubleshooting

### Application won't start

1. Check logs: `docker compose logs app`
2. Verify `DATABASE_URL` is correct and PostgreSQL is reachable
3. Ensure port 5000 isn't already in use (the server will try port 5001 as fallback)

### Database migrations fail

1. Check PostgreSQL is running and accepting connections
2. Verify the database user has CREATE TABLE privileges
3. Check `schema_migrations` table for partial state
4. Migrations are transactional — a failed migration rolls back cleanly

### WebSocket connections failing

1. Ensure nginx `proxy_set_header Upgrade` and `Connection "upgrade"` are set
2. Check that Socket.IO path `/socket.io/` is proxied correctly
3. Verify CORS `FRONTEND_URL` includes the client's origin

### Port conflicts

The server automatically tries `PORT + 1` if the configured port is in use. Check logs for the actual port.

---

## SSL/TLS

The provided nginx config listens on port 80 (HTTP). For production with HTTPS:

1. Use a reverse proxy like Cloudflare, AWS ALB, or Caddy in front of nginx
2. Or add SSL certificate configuration to the nginx server block:

```nginx
listen 443 ssl;
ssl_certificate /etc/ssl/certs/your-cert.pem;
ssl_certificate_key /etc/ssl/private/your-key.pem;
```

---

## Architecture Overview

```
Client → Nginx (port 80) → Node.js (port 5000) → PostgreSQL (port 5432)
                ↓
        Static files (Vite build)
                ↓
        WebSocket upgrade (/socket.io/)
```

- **Nginx**: Serves static frontend, proxies API and WebSocket to Node.js
- **Node.js**: Express server with Socket.IO, handles all API routes
- **PostgreSQL**: Persistent storage (optional — InMemory fallback available)
