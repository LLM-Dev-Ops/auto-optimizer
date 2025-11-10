#!/bin/bash
# PostgreSQL initialization script for LLM Auto Optimizer

set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create extensions
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

    -- Create additional schemas
    CREATE SCHEMA IF NOT EXISTS metrics;
    CREATE SCHEMA IF NOT EXISTS audit;

    -- Grant permissions
    GRANT ALL PRIVILEGES ON SCHEMA metrics TO $POSTGRES_USER;
    GRANT ALL PRIVILEGES ON SCHEMA audit TO $POSTGRES_USER;

    -- Set timezone
    ALTER DATABASE $POSTGRES_DB SET timezone TO 'UTC';

    -- Performance tuning
    ALTER SYSTEM SET max_connections = 200;
    ALTER SYSTEM SET shared_buffers = '256MB';
    ALTER SYSTEM SET effective_cache_size = '1GB';
    ALTER SYSTEM SET maintenance_work_mem = '64MB';
    ALTER SYSTEM SET checkpoint_completion_target = 0.9;
    ALTER SYSTEM SET wal_buffers = '16MB';
    ALTER SYSTEM SET default_statistics_target = 100;
    ALTER SYSTEM SET random_page_cost = 1.1;
    ALTER SYSTEM SET effective_io_concurrency = 200;

    -- Logging configuration
    ALTER SYSTEM SET log_min_duration_statement = 1000;
    ALTER SYSTEM SET log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h ';

    SELECT pg_reload_conf();
EOSQL

echo "PostgreSQL initialization complete"
