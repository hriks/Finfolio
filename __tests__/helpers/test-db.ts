import { createBetterSqlite3Driver } from '../../src/data/better-sqlite3-driver';
import { runMigrations } from '../../src/data/migrate';
import { seedCategories } from '../../src/data/seed/categories';
import { seedMerchantRules } from '../../src/data/seed/merchant-rules';
import type { Database } from '../../src/data/database';

export const makeRawDb = (): Database => createBetterSqlite3Driver(':memory:');

export const makeSeededDb = (): Database => {
  const db = makeRawDb();
  runMigrations(db);
  seedCategories(db);
  seedMerchantRules(db);
  return db;
};
