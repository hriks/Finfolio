import { createOpSqliteDriver } from './opsqlite-driver';
import { runMigrations } from './migrate';
import { seedCategories } from './seed/categories';
import { seedMerchantRules } from './seed/merchant-rules';
import { seedMergePatterns } from './seed/merge-patterns';
import type { Database } from './database';

let cached: Database | null = null;

export const getAppDb = (): Database => {
  if (cached) return cached;
  const db = createOpSqliteDriver({ name: 'expense-manager.db' });
  runMigrations(db);
  ensureSeeded(db);
  cached = db;
  return db;
};

const ensureSeeded = (db: Database): void => {
  // Always re-seed. seedCategories uses INSERT OR IGNORE so this is cheap and idempotent.
  seedCategories(db);
  seedMerchantRules(db);
  seedMergePatterns(db);
  rePointMedicalRules(db);

  const count = db.get<{ c: number }>('SELECT COUNT(*) AS c FROM categories')?.c ?? 0;
  // eslint-disable-next-line no-console
  console.log(`[init] categories count after seed: ${count}`);
  if (count < 25) {
    // eslint-disable-next-line no-console
    console.warn(`[init] categories table only has ${count} rows; retrying seed`);
    seedCategories(db);
    const after = db.get<{ c: number }>('SELECT COUNT(*) AS c FROM categories')?.c ?? 0;
    // eslint-disable-next-line no-console
    console.log(`[init] categories count after retry: ${after}`);
  }
};

// One-time migration: when we introduced cat-medical and cat-loan, any prior data
// (rules and expenses) that pointed to cat-health for medical merchants should move
// to cat-medical. Idempotent.
const MEDICAL_KEYWORDS = [
  'apollo pharmacy',
  'apollo hospital',
  '1mg',
  'pharmeasy',
  'netmeds',
  'medplus',
  'practo',
  'fortis',
  'manipal hospital',
  'max hospital',
  'narayana health',
];

const rePointMedicalRules = (db: Database): void => {
  for (const k of MEDICAL_KEYWORDS) {
    try {
      db.run(
        "UPDATE merchant_rules SET category_id = 'cat-medical' WHERE merchant_norm = ? AND category_id = 'cat-health'",
        [k],
      );
    } catch {
      /* ignore */
    }
  }
  // Rename old 'Vices' display name to 'SIN' (idempotent).
  try {
    db.run("UPDATE categories SET name = 'SIN' WHERE id = 'cat-vices' AND name != 'SIN'");
  } catch {
    /* ignore */
  }
  // Merge old 'Travel' category into 'Transport' (idempotent).
  try {
    db.run("UPDATE expenses SET category_id = 'cat-transport' WHERE category_id = 'cat-travel'");
    db.run(
      "UPDATE merchant_rules SET category_id = 'cat-transport' WHERE category_id = 'cat-travel'",
    );
    db.run("DELETE FROM categories WHERE id = 'cat-travel'");
  } catch {
    /* ignore */
  }
};
