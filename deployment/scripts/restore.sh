#!/bin/bash
# Restore script for LLM Auto Optimizer
set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <backup-file>"
    exit 1
fi

BACKUP_FILE="$1"
TEMP_DIR=$(mktemp -d)

echo "Restoring from: $BACKUP_FILE"

# Extract backup
tar xzf "$BACKUP_FILE" -C "$TEMP_DIR"
BACKUP_DIR=$(ls -d "$TEMP_DIR"/*/)

# Stop service
systemctl stop llm-optimizer 2>/dev/null || true

# Restore PostgreSQL
if [ -f "$BACKUP_DIR/postgres.sql" ]; then
    echo "Restoring PostgreSQL..."
    psql -U optimizer -h localhost optimizer < "$BACKUP_DIR/postgres.sql"
fi

# Restore Redis
if [ -f "$BACKUP_DIR/redis.rdb" ]; then
    echo "Restoring Redis..."
    cp "$BACKUP_DIR/redis.rdb" /var/lib/redis/dump.rdb
    systemctl restart redis
fi

# Restore configuration
if [ -d "$BACKUP_DIR/config" ]; then
    echo "Restoring configuration..."
    cp -r "$BACKUP_DIR/config"/* /etc/llm-optimizer/
fi

# Restore data
if [ -d "$BACKUP_DIR/data" ]; then
    echo "Restoring application data..."
    cp -r "$BACKUP_DIR/data"/* /opt/llm-optimizer/data/
fi

# Start service
systemctl start llm-optimizer

# Cleanup
rm -rf "$TEMP_DIR"

echo "Restore completed successfully!"
