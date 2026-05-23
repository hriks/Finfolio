import BetterSqlite3 from 'better-sqlite3';
import type { Database, RunResult } from './database';

export const createBetterSqlite3Driver = (path: string = ':memory:'): Database => {
  const db = new BetterSqlite3(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return {
    exec: (sql) => db.exec(sql),
    run: (sql, params = []) => {
      const info = db.prepare(sql).run(...params);
      return { changes: info.changes, lastInsertRowid: info.lastInsertRowid } as RunResult;
    },
    get: (sql, params = []) => db.prepare(sql).get(...params) as never,
    all: (sql, params = []) => db.prepare(sql).all(...params) as never,
    transaction: (fn) => db.transaction(fn)(),
    close: () => db.close(),
  };
};
