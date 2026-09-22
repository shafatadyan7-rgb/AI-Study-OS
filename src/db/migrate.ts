import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, closePool } from './index';

async function main() {
  console.log('[migrate] running migrations from ./drizzle');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('[migrate] done');
  await closePool();
}

main().catch((err) => {
  console.error('[migrate] failed:', err);
  process.exit(1);
});
