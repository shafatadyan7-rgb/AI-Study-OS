-- Run BEFORE the drizzle-kit generated migrations.
-- Requires the pgvector extension to be available on the server
-- (Postgres 15+; `CREATE EXTENSION` needs superuser or rds_superuser).

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
