import { makeRawDb } from '../helpers/test-db';
import { runMigrations } from '../../src/data/migrate';

describe('migrations', () => {
  it('creates all tables and sets user_version', () => {
    const db = makeRawDb();
    runMigrations(db);
    const tables = db
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .map((r) => r.name);
    for (const t of [
      'expenses',
      'categories',
      'merchant_rules',
      'merchant_embeddings',
      'ingestion_log',
      'backup_meta',
      'settings',
      'merge_patterns',
    ]) {
      expect(tables).toContain(t);
    }
    expect(tables).not.toContain('budgets');
    expect(tables).not.toContain('budget_alert_state');
    const v = db.get<{ user_version: number }>('PRAGMA user_version');
    expect(v?.user_version).toBe(6);
    db.close();
  });

  it('adds a nullable body column to ingestion_log', () => {
    const db = makeRawDb();
    runMigrations(db);
    const cols = db
      .all<{ name: string; notnull: number }>('PRAGMA table_info(ingestion_log)')
      .filter((c) => c.name === 'body');
    expect(cols).toHaveLength(1);
    expect(cols[0]?.notnull).toBe(0);
    db.close();
  });

  it('is idempotent across re-runs', () => {
    const db = makeRawDb();
    runMigrations(db);
    runMigrations(db);
    const v = db.get<{ user_version: number }>('PRAGMA user_version');
    expect(v?.user_version).toBe(6);
    db.close();
  });
});
