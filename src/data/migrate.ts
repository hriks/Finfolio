import type { Database } from './database';
import { migrations } from './migrations';

export const runMigrations = (db: Database): void => {
  const row = db.get<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  db.transaction(() => {
    for (const m of migrations) {
      if (m.version > current) {
        db.exec(m.up);
        db.exec(`PRAGMA user_version = ${m.version}`);
      }
    }
  });
};
