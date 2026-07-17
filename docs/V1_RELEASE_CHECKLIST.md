# V1.0 Release Checklist

**Version**: 1.0.0  
**Target Date**: July 16, 2026

---

## Pre-Deployment Checklist

### Environment Variables

- [ ] `NODE_ENV=production` is set
- [ ] `STORAGE_PROVIDER=postgres` is set
- [ ] `DATABASE_URL` is set with production PostgreSQL credentials
- [ ] `JWT_SECRET` is set to a cryptographically secure random string (min 32 chars)
- [ ] `PORT` is set (default: 5000)
- [ ] `FRONTEND_URL` is set to the production frontend URL
- [ ] AI provider keys are configured as needed:
  - [ ] `OPENAI_API_KEY` (if using OpenAI)
  - [ ] `ANTHROPIC_API_KEY` (if using Anthropic)
  - [ ] `GEMINI_API_KEY` (if using Gemini)

### Database

- [ ] PostgreSQL 16+ is running and accessible
- [ ] Database user has CREATE TABLE, INSERT, UPDATE, DELETE permissions
- [ ] Connection string tested with `pg_isready`
- [ ] Backup script tested: `./scripts/backup-database.sh`
- [ ] Backup cron job configured (recommended: daily)

### Security

- [ ] `JWT_SECRET` is NOT the default value
- [ ] PostgreSQL password is NOT the docker-compose default (`studio_prod_password`)
- [ ] Docker runs as non-root user (verified in Dockerfile)
- [ ] Nginx is configured with SSL/TLS (production)
- [ ] Firewall rules: only ports 80/443 exposed externally
- [ ] Internal port 5000 is NOT exposed to the internet

### Build Verification

- [ ] `npx tsc --noEmit` passes with no errors
- [ ] `npx vite build` produces dist/ without errors
- [ ] `npx vitest run` — all critical tests pass
- [ ] Docker image builds successfully: `docker build -t roblox-ai-studio .`

---

## Deployment Steps

### Option A: Docker Compose (Recommended)

```bash
# 1. Clone repository
git clone <repository-url>
cd RobloxAiStudio-DevKit

# 2. Configure environment
cp .env.example .env
# Edit .env with production values (see Environment Variables above)

# 3. Update docker-compose with production secrets
# Edit deploy/docker-compose.yml — replace default passwords

# 4. Build and start
cd deploy
docker-compose up -d --build

# 5. Verify deployment
curl http://localhost/health
# Expected: {"status":"ok","timestamp":"..."}

# 6. Check logs
docker-compose logs -f app
```

### Option B: Manual Deployment

```bash
# 1. Install Node.js 20+
# 2. Install PostgreSQL 16+
# 3. Clone and install
git clone <repository-url>
cd RobloxAiStudio-DevKit
npm ci

# 4. Build
npx vite build
npx tsc --project server/tsconfig.json

# 5. Set environment variables
export NODE_ENV=production
export STORAGE_PROVIDER=postgres
export DATABASE_URL=postgresql://user:pass@localhost:5432/roblox_ai_studio
export JWT_SECRET=<secure-random-string>

# 6. Start
node dist/server/index.js

# 7. Configure nginx (copy deploy/nginx.conf)
# 8. Serve static files from dist/ via nginx
```

---

## Post-Deployment Verification

### Immediate (within 5 minutes)

- [ ] Health check responds: `GET /health` → `{"status":"ok"}`
- [ ] Frontend loads at root URL (nginx serves SPA)
- [ ] Login page renders at `/login`
- [ ] Registration works: create a test account
- [ ] Login works: authenticate with test account
- [ ] Protected API accessible with valid session (cookie-based)
- [ ] WebSocket connects (check browser console for Socket.IO)

### Within 1 hour

- [ ] All API endpoints respond correctly:
  - [ ] `GET /api/analytics` (with auth)
  - [ ] `GET /api/projects` (with auth)
  - [ ] `POST /api/concept/generate` (with auth)
- [ ] Database migrations applied: check `schema_migrations` table
- [ ] Logs are being written (structured JSON format)
- [ ] Rate limiting works: rapid requests return 429 after 100/min

### Within 24 hours

- [ ] Database backup ran successfully (check backup directory)
- [ ] No memory leaks (monitor container memory usage)
- [ ] No unexpected errors in application logs
- [ ] WebSocket connections stable over extended period

---

## Rollback Procedure

### Quick Rollback (< 5 minutes)

```bash
# Docker Compose
cd deploy
docker-compose down
docker-compose up -d --no-build  # Uses previous image

# Or: revert to previous image tag
docker-compose pull  # If using registry
docker-compose up -d
```

### Full Rollback

```bash
# 1. Stop the application
docker-compose down

# 2. Restore database from backup
gunzip < backups/roblox_ai_studio_YYYYMMDD_HHMMSS.sql.gz | psql $DATABASE_URL

# 3. Checkout previous version
git checkout v0.9.0  # or previous known-good tag

# 4. Rebuild and restart
docker-compose up -d --build
```

### Database Rollback

```bash
# If migrations need reverting, restore from backup:
gunzip < backups/roblox_ai_studio_<latest>.sql.gz | psql $DATABASE_URL

# Note: The migration runner does not currently support down migrations.
# Always restore from backup if schema changes need reverting.
```

---

## Monitoring (Post-Deployment)

### Recommended Alerts

| Metric               | Threshold                | Action                     |
| -------------------- | ------------------------ | -------------------------- |
| Health check failure | 3 consecutive            | Page on-call               |
| Response time p95    | > 2000ms                 | Investigate                |
| Error rate (5xx)     | > 1%                     | Investigate                |
| Disk space (backups) | > 80%                    | Increase retention cleanup |
| Memory usage         | > 80% of container limit | Scale or investigate leak  |
| Database connections | > 80% of pool            | Increase pool or optimize  |

### Log Locations

- Application logs: `docker-compose logs app`
- Nginx access/error: `docker-compose logs nginx`
- PostgreSQL: `docker-compose logs postgres`
- Backup script output: stdout (pipe to file or logging service)

---

## Emergency Contacts

| Role          | Responsibility                             |
| ------------- | ------------------------------------------ |
| DevOps Lead   | Infrastructure, deployment, rollback       |
| Security Lead | Auth issues, token compromise, data breach |
| Backend Lead  | API errors, database issues, migrations    |
| Frontend Lead | UI issues, WebSocket connectivity          |

---

## Sign-Off

- [ ] Development team approval
- [ ] Security review complete (see `docs/SECURITY_FINAL_AUDIT.md`)
- [ ] Deployment guide reviewed (see `docs/PRODUCTION_DEPLOYMENT_GUIDE.md`)
- [ ] Backup tested and verified
- [ ] Rollback procedure tested
