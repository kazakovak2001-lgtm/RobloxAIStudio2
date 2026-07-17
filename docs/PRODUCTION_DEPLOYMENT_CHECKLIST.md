# Production Deployment Checklist

**Date**: July 15, 2026  
**Version**: 1.0.0  
**Status**: PRE-DEPLOYMENT REVIEW

---

## Critical Blockers (Must Fix Before Deploy)

- [ ] **Fix auth middleware PUBLIC_PREFIXES** — Add `/api/platform/auth` to allow login/register in production mode
- [ ] **Upgrade password hashing** — Replace SHA-256 with bcrypt (cost factor 12)
- [ ] **Move tokens to httpOnly cookies** — Eliminate localStorage XSS vector
- [ ] **Wire AuthService.validateToken() into authMiddleware** — Currently only checks token format

---

## Backend Checklist

### Environment Variables

| Variable            | Required              | Default          | Production Value                          |
| ------------------- | --------------------- | ---------------- | ----------------------------------------- |
| `PORT`              | Yes                   | 5000             | Set per deployment (e.g. 8080)            |
| `NODE_ENV`          | Yes                   | development      | **Must be `production`**                  |
| `DATABASE_URL`      | Yes (for persistence) | localhost string | `postgresql://user:pass@host:5432/dbname` |
| `STORAGE_PROVIDER`  | No                    | inmemory         | `postgres`                                |
| `FRONTEND_URL`      | Yes (CORS)            | —                | `https://your-domain.com`                 |
| `OPENAI_API_KEY`    | Optional              | —                | Real key for AI generation                |
| `ANTHROPIC_API_KEY` | Optional              | —                | Real key for AI generation                |
| `GOOGLE_API_KEY`    | Optional              | —                | Real key for Gemini                       |
| `POOL_SIZE`         | No                    | 10               | 20 (production)                           |
| `POOL_TIMEOUT`      | No                    | 30000            | 30000                                     |

**Status**:

- [x] `.env.example` exists with all variables documented
- [ ] Missing from `.env.example`: `FRONTEND_URL`, `POOL_SIZE`, `POOL_TIMEOUT`
- [ ] Missing: `SESSION_SECRET` or `JWT_SECRET` for token signing (currently using randomUUID)
- [ ] Missing: `BCRYPT_ROUNDS` configuration

**Action**: Update `.env.example` with all production variables.

---

### Database Migrations

| Item                    | Status | Notes                                                     |
| ----------------------- | ------ | --------------------------------------------------------- |
| Migration file exists   | ✅     | `server/src/platform/storage/postgres/migrations.ts`      |
| Schema: users table     | ✅     | v1 — includes email, password_hash, role, tier            |
| Schema: projects table  | ✅     | v2 — includes owner_id FK                                 |
| Schema: generation_jobs | ✅     | v3 — queuing system                                       |
| Schema: sessions        | ✅     | v4 — token-based sessions                                 |
| Schema: usage_records   | ✅     | v5 — rate limiting data                                   |
| Schema: audit_logs      | ✅     | v6 — pipeline event tracking                              |
| Schema: kv_store        | ✅     | Created by PostgresStorageProvider INIT_SQL               |
| Migration runner        | ⚠️     | Migrations defined but **no automatic runner on startup** |
| Versioning/tracking     | ❌     | No `schema_migrations` table to track applied versions    |
| Rollback support        | ❌     | No down migrations defined                                |

**Action**:

- [ ] Add migration runner to server startup (apply pending migrations)
- [ ] Add `schema_migrations` tracking table
- [ ] Document manual migration steps for first deployment

---

### PostgreSQL Backup

| Item                   | Status | Notes                               |
| ---------------------- | ------ | ----------------------------------- |
| docker-compose volume  | ✅     | `pgdata` named volume persists data |
| Backup script          | ❌     | No `pg_dump` automation             |
| Scheduled backups      | ❌     | No cron/scheduled task              |
| Point-in-time recovery | ❌     | No WAL archiving configured         |
| Backup testing         | ❌     | No restore verification             |

**Action**:

- [ ] Add backup script: `pg_dump -h localhost -U studio roblox_ai_studio > backup_$(date +%Y%m%d).sql`
- [ ] Add to docker-compose or host cron
- [ ] Document restore procedure

---

### Logging

| Item                     | Status | Notes                                                      |
| ------------------------ | ------ | ---------------------------------------------------------- |
| Request logging          | ✅     | `requestLogger` middleware — structured JSON               |
| Request IDs              | ✅     | `X-Request-Id` header on every response                    |
| Error logging            | ✅     | errorHandler middleware logs to console                    |
| Subsystem logging        | ✅     | `[PostgresStorage]`, `[LLM]`, `[pipeline-bridge]` prefixes |
| Log level control        | ❌     | No configurable log level (always verbose)                 |
| External aggregation     | ❌     | Console only — no stdout→file, no log service              |
| Sensitive data filtering | ⚠️     | Request bodies logged — may include passwords in dev       |

**Action**:

- [ ] Add `LOG_LEVEL` env variable (error, warn, info, debug)
- [ ] Ensure passwords/tokens are never logged
- [ ] Pipe stdout to file or log aggregation service (e.g., CloudWatch, Datadog, Loki)

---

### Error Handling

| Item                        | Status | Notes                                          |
| --------------------------- | ------ | ---------------------------------------------- |
| Global error handler        | ✅     | Catches uncaught route errors                  |
| Stack trace hidden in prod  | ✅     | `details` only shown when NODE_ENV=development |
| Consistent error format     | ✅     | `{ success: false, error: "message" }`         |
| 404 handler                 | ✅     | Returns path in error for debugging            |
| Graceful shutdown           | ✅     | SIGTERM/SIGINT handlers close server cleanly   |
| Process crash recovery      | ❌     | No process manager (PM2, systemd) configured   |
| Unhandled promise rejection | ❌     | No `process.on('unhandledRejection')` handler  |

**Action**:

- [ ] Add `process.on('unhandledRejection', handler)`
- [ ] Add `process.on('uncaughtException', handler)`
- [ ] Use PM2 or systemd for automatic restart on crash

---

## Frontend Checklist

### Production Build

| Item                   | Status | Notes                                                            |
| ---------------------- | ------ | ---------------------------------------------------------------- |
| Build command          | ✅     | `npm run build` → validates arch + boundaries + tsc + vite build |
| Output directory       | ✅     | `dist/` (gitignored)                                             |
| TypeScript strict mode | ✅     | `strict: true`, `noUnusedLocals`, `noUnusedParameters`           |
| Code splitting         | ✅     | All pages use `React.lazy()` with Suspense                       |
| Tree shaking           | ✅     | Vite handles automatically                                       |
| Source maps            | ⚠️     | Default Vite config generates source maps — disable for prod?    |

**Action**:

- [ ] Add `build: { sourcemap: false }` to vite.config.ts for production
- [ ] Verify final bundle size: `npx vite build --report`
- [ ] Test production build locally: `npm run build && npm run preview`

---

### API URL Configuration

| Item               | Status | Notes                                                            |
| ------------------ | ------ | ---------------------------------------------------------------- |
| API proxy (dev)    | ✅     | Vite proxies `/api` → `localhost:5000`                           |
| Socket URL         | ✅     | `VITE_SOCKET_URL` env variable (default: localhost:5000)         |
| Relative API calls | ✅     | All services use `/api/...` (relative)                           |
| Production routing | ⚠️     | **Needs reverse proxy** (nginx/Caddy) to route `/api` to backend |

**Production architecture**:

```
Browser → CDN/Static (frontend dist/)
       → Reverse Proxy → Backend :5000 (/api/*, /health, /socket.io)
```

**Action**:

- [ ] Add nginx.conf or Caddy config for production routing
- [ ] OR serve frontend static files from Express in production
- [ ] Set `VITE_SOCKET_URL` to production WebSocket URL
- [ ] Verify CORS `FRONTEND_URL` matches actual deployment domain

---

### Bundle Size

| Dependency        | Size Impact    | Notes                       |
| ----------------- | -------------- | --------------------------- |
| react + react-dom | ~45KB gzip     | Standard                    |
| react-router-dom  | ~12KB gzip     | Standard                    |
| framer-motion     | ~30KB gzip     | Largest UI dep — animations |
| lucide-react      | Tree-shakeable | Only used icons are bundled |
| socket.io-client  | ~20KB gzip     | WebSocket client            |

**Estimated total**: ~120-150KB gzip (acceptable for SPA)

**Action**:

- [ ] Run `npx vite-bundle-visualizer` to verify actual sizes
- [ ] Consider lazy-loading framer-motion if bundle is too large

---

### Environment Separation

| Environment | NODE_ENV    | Auth     | Storage            | Socket               |
| ----------- | ----------- | -------- | ------------------ | -------------------- |
| Development | development | Skipped  | InMemory           | ws://localhost:5000  |
| Staging     | production  | Enforced | Postgres (docker)  | wss://staging.domain |
| Production  | production  | Enforced | Postgres (managed) | wss://prod.domain    |

**Action**:

- [ ] Create `.env.staging` template
- [ ] Create `.env.production` template
- [ ] Document which variables change per environment

---

## Infrastructure Checklist

### Docker

| Item                   | Status | Notes                                        |
| ---------------------- | ------ | -------------------------------------------- |
| docker-compose.yml     | ✅     | PostgreSQL 16 Alpine with healthcheck        |
| Application Dockerfile | ❌     | **Missing** — no Dockerfile for the app      |
| Multi-stage build      | ❌     | Not applicable (no Dockerfile)               |
| .dockerignore          | ❌     | **Missing**                                  |
| Volume persistence     | ✅     | `pgdata` named volume                        |
| Health check (DB)      | ✅     | `pg_isready` every 5s                        |
| Health check (App)     | ⚠️     | `/health` endpoint exists but not in compose |
| Network isolation      | ❌     | No custom network defined                    |
| Production passwords   | ❌     | Hardcoded `studio_dev` — must change         |

**Action**:

- [ ] Create `Dockerfile` for the application:

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist/ ./dist/
EXPOSE 5000
CMD ["node", "dist/server/index.js"]
```

- [ ] Create `.dockerignore` (node_modules, .git, docs, src)
- [ ] Add app service to docker-compose.yml
- [ ] Add `docker-compose.production.yml` override with real passwords
- [ ] Add custom network for service isolation

---

### CI/CD

| Item                | Status | Notes                                                        |
| ------------------- | ------ | ------------------------------------------------------------ |
| GitHub Actions CI   | ✅     | 6 jobs: typecheck, lint, format, test, validate, commit-lint |
| Merge gate          | ✅     | All checks must pass                                         |
| Concurrency control | ✅     | Cancels in-progress on same branch                           |
| Node 20             | ✅     | Matches local development                                    |
| npm cache           | ✅     | Actions cache configured                                     |
| Build step in CI    | ❌     | CI runs typecheck but **not full `npm run build`**           |
| Deploy step         | ❌     | No deployment automation                                     |
| Staging deploy      | ❌     | No staging environment                                       |
| Production deploy   | ❌     | No production deployment                                     |
| Secrets management  | ❌     | No GitHub Secrets configured                                 |
| Release tagging     | ❌     | No release workflow                                          |

**Action**:

- [ ] Add `build` job to CI (runs `npm run build` + `npm run build:server`)
- [ ] Add deploy workflow (staging → manual approval → production)
- [ ] Configure GitHub Secrets: DATABASE_URL, API keys, etc.
- [ ] Add release workflow with changelog generation
- [ ] Add Docker image build + push to registry

---

### Monitoring

| Item                | Status | Notes                                               |
| ------------------- | ------ | --------------------------------------------------- |
| Health endpoint     | ✅     | `GET /health` — returns status + LLM mode           |
| Database health     | ✅     | `GET /health/database` — latency, pool, connected   |
| Storage health      | ✅     | `GET /health/storage` — provider type               |
| Request logging     | ✅     | JSON format: method, path, status, duration, IP     |
| Rate limit headers  | ✅     | Standard headers (X-RateLimit-*)                    |
| External uptime     | ❌     | No external monitoring (UptimeRobot, Pingdom, etc.) |
| Error alerting      | ❌     | No alerts on 5xx spikes                             |
| Performance metrics | ❌     | No APM (New Relic, Datadog, etc.)                   |
| Disk/memory alerts  | ❌     | No infrastructure monitoring                        |

**Action**:

- [ ] Set up external uptime monitor on `/health`
- [ ] Configure alerting on >5% error rate
- [ ] Add basic APM or at minimum response time percentiles
- [ ] Monitor PostgreSQL connection pool exhaustion

---

## Deployment Sequence

### First-Time Deploy

```bash
# 1. Build frontend
npm run build

# 2. Build server (TypeScript → dist/server)
npm run build:server

# 3. Start PostgreSQL
docker compose up -d postgres

# 4. Wait for health
docker compose exec postgres pg_isready -U studio

# 5. Run migrations (manual until runner is built)
# Connect to postgres and run migrations.ts SQL

# 6. Set environment
export NODE_ENV=production
export DATABASE_URL=postgresql://...
export STORAGE_PROVIDER=postgres
export FRONTEND_URL=https://your-domain.com
export PORT=5000

# 7. Start server
node dist/server/index.js

# 8. Verify
curl http://localhost:5000/health
curl http://localhost:5000/health/database
```

### Subsequent Deploys

```bash
# 1. Pull latest code
git pull origin main

# 2. Install deps
npm ci

# 3. Build
npm run build && npm run build:server

# 4. Run new migrations (if any)
# Check migrations.ts for new versions

# 5. Restart server (zero-downtime with PM2)
pm2 restart roblox-ai-studio
```

---

## Security Pre-Deploy Checklist

- [ ] `NODE_ENV=production` (enables auth middleware)
- [ ] Change PostgreSQL password from `studio_dev`
- [ ] Set unique `FRONTEND_URL` for CORS whitelist
- [ ] Remove `/api/debug` routes or add admin-only guard
- [ ] Verify rate limiting is active (100 req/min per IP)
- [ ] Add stricter rate limit on `/api/platform/auth/login` (10/min)
- [ ] Disable source maps in production build
- [ ] Review all `console.log` — consider removing sensitive logs
- [ ] Set `Secure` flag on cookies (after httpOnly migration)
- [ ] Configure HTTPS (TLS termination at reverse proxy)

---

## Post-Deploy Verification

```bash
# Health checks
curl https://your-domain.com/health
curl https://your-domain.com/health/database

# Auth flow
curl -X POST https://your-domain.com/api/platform/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123","displayName":"Test"}'

# Protected route (should require token)
curl https://your-domain.com/api/projects
# Expected: 401 Unauthorized

# WebSocket
# Verify Socket.io connection from frontend
```

---

## Summary: What's Missing for Production

| Category              | Missing Items                                 | Effort |
| --------------------- | --------------------------------------------- | ------ |
| **Blocker bugs**      | Fix PUBLIC_PREFIXES, bcrypt, httpOnly cookies | 4h     |
| **Dockerfile**        | Application containerization                  | 1h     |
| **Migration runner**  | Auto-apply schema on startup                  | 2h     |
| **Reverse proxy**     | nginx/Caddy for frontend+API routing          | 1h     |
| **Deploy automation** | CI/CD deploy workflow                         | 3h     |
| **Monitoring**        | External uptime + alerting                    | 2h     |
| **Backup**            | pg_dump script + schedule                     | 1h     |
| **Process manager**   | PM2 or systemd unit                           | 30min  |
| **Env templates**     | staging + production .env files               | 30min  |

**Total estimated effort to production-ready**: ~15 hours

**Minimum viable deployment** (demo/beta): Fix blocker bugs (4h) + Dockerfile (1h) + reverse proxy (1h) = **6 hours**.

---

## Readiness Score

| Area             | Score | Blocking?                   |
| ---------------- | ----- | --------------------------- |
| Application code | 9/10  | No                          |
| Security         | 5/10  | **YES** — auth bugs         |
| Database         | 7/10  | No (works in cache-only)    |
| Build pipeline   | 8/10  | No                          |
| CI/CD            | 6/10  | No (can deploy manually)    |
| Infrastructure   | 4/10  | **YES** — no Dockerfile     |
| Monitoring       | 3/10  | No (health endpoints exist) |
| Documentation    | 8/10  | No                          |

**Overall**: 6.5/10 — functional application with incomplete deployment infrastructure.
