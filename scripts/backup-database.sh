#!/usr/bin/env bash
#
# Database Backup Script — RobloxAiStudio-DevKit
#
# Creates a timestamped pg_dump backup of the PostgreSQL database.
# Supports configurable retention to automatically remove old backups.
#
# Usage:
#   ./scripts/backup-database.sh
#
# Environment Variables:
#   DATABASE_URL    - PostgreSQL connection string (required)
#                    Example: postgresql://user:password@host:5432/dbname
#   BACKUP_DIR     - Directory to store backups (default: ./backups)
#   RETENTION_DAYS - Number of days to keep backups (default: 7)
#
# Examples:
#   # Basic usage with DATABASE_URL set in environment
#   DATABASE_URL=postgresql://studio:pass@localhost:5432/roblox_ai_studio ./scripts/backup-database.sh
#
#   # Custom backup directory and retention
#   BACKUP_DIR=/mnt/backups RETENTION_DAYS=14 ./scripts/backup-database.sh
#
#   # Use with docker-compose postgres container
#   DATABASE_URL=postgresql://studio:studio_prod_password@localhost:5432/roblox_ai_studio ./scripts/backup-database.sh
#

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/roblox_ai_studio_${TIMESTAMP}.sql.gz"

# ─── Validation ──────────────────────────────────────────────────────────────
if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable is not set."
  echo ""
  echo "Usage: DATABASE_URL=postgresql://user:pass@host:5432/dbname $0"
  exit 1
fi

# Verify pg_dump is available
if ! command -v pg_dump &> /dev/null; then
  echo "❌ ERROR: pg_dump command not found. Install PostgreSQL client tools."
  exit 1
fi

# ─── Create Backup Directory ─────────────────────────────────────────────────
if [ ! -d "$BACKUP_DIR" ]; then
  echo "📁 Creating backup directory: $BACKUP_DIR"
  mkdir -p "$BACKUP_DIR"
fi

# ─── Perform Backup ─────────────────────────────────────────────────────────
echo "🔄 Starting database backup..."
echo "   Target: $BACKUP_FILE"
echo "   Time:   $(date)"

if pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"; then
  FILESIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "✅ Backup completed successfully ($FILESIZE)"
else
  echo "❌ Backup failed!"
  rm -f "$BACKUP_FILE"
  exit 1
fi

# ─── Retention Policy ────────────────────────────────────────────────────────
echo "🧹 Applying retention policy (keeping last ${RETENTION_DAYS} days)..."

DELETED_COUNT=0
while IFS= read -r -d '' old_backup; do
  rm -f "$old_backup"
  DELETED_COUNT=$((DELETED_COUNT + 1))
  echo "   Removed: $(basename "$old_backup")"
done < <(find "$BACKUP_DIR" -name "roblox_ai_studio_*.sql.gz" -mtime +"$RETENTION_DAYS" -print0 2>/dev/null)

if [ "$DELETED_COUNT" -gt 0 ]; then
  echo "   Removed $DELETED_COUNT old backup(s)"
else
  echo "   No old backups to remove"
fi

# ─── Summary ─────────────────────────────────────────────────────────────────
TOTAL_BACKUPS=$(find "$BACKUP_DIR" -name "roblox_ai_studio_*.sql.gz" | wc -l)
echo ""
echo "📊 Backup Summary:"
echo "   Latest: $(basename "$BACKUP_FILE")"
echo "   Total backups: $TOTAL_BACKUPS"
echo "   Retention: $RETENTION_DAYS days"
echo "   Directory: $BACKUP_DIR"
echo ""
echo "Done ✅"
