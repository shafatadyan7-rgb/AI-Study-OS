import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

/**
 * Lazily initialised. Importing a module that happens to touch the db layer must
 * not open a connection — that made pure logic untestable and meant a missing
 * DATABASE_URL crashed at import time rather than at first query.
 */
let _pool: Pool | null = null;
let _db: NodePgDatabase<typeof schema> | null = null;

export function pool(): Pool {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env and configure it.');
  _pool = new Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30_000 });
  return _pool;
}

function instance(): NodePgDatabase<typeof schema> {
  if (!_db) _db = drizzle(pool(), { schema });
  return _db;
}

/** Proxy so call sites keep the familiar `db.select(...)` shape. */
export const db: NodePgDatabase<typeof schema> = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_t, prop) {
    const target = instance() as unknown as Record<string | symbol, unknown>;
    const value = target[prop];
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

export async function closePool(): Promise<void> {
  if (_pool) { await _pool.end(); _pool = null; _db = null; }
}

export { schema };
