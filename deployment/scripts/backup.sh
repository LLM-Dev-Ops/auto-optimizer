#!/bin/bash
# Backup script for LLM Auto Optimizer
set -e

BACKUP_DIR="${BACKUP_DIR:-/var/backups/llm-optimizer}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_NAME="llm-optimizer-backup-$TIMESTAMP"

echo "Creating backup: $BACKUP_NAME"
mkdir -p "$BACKUP_DIR/$BACKUP_NAME"

# Backup PostgreSQL
if command -v pg_dump &> /dev/null; then
    echo "Backing up PostgreSQL..."
    pg_dump -U optimizer -h localhost optimizer > "$BACKUP_DIR/$BACKUP_NAME/postgres.sql"
fi

# Backup Redis
if command -v redis-cli &> /dev/null; then
    echo "Backing up Redis..."
    redis-cli --rdb "$BACKUP_DIR/$BACKUP_NAME/redis.rdb"
fi

# Backup configuration
echo "Backing up configuration..."
cp -r /etc/llm-optimizer "$BACKUP_DIR/$BACKUP_NAME/config" 2>/dev/null || true

# Backup data
echo "Backing up application data..."
cp -r /opt/llm-optimizer/data "$BACKUP_DIR/$BACKUP_NAME/data" 2>/dev/null || true

# Create archive
cd "$BACKUP_DIR"
tar czf "$BACKUP_NAME.tar.gz" "$BACKUP_NAME"
rm -rf "$BACKUP_NAME"

echo "Backup completed: $BACKUP_DIR/$BACKUP_NAME.tar.gz"
