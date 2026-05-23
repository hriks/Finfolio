import { open, type DB, type Scalar } from '@op-engineering/op-sqlite';
import type { Database, RunResult } from './database';

export interface OpSqliteOptions {
  name: string;
  location?: string;
}

const EMPTY: Scalar[] = [];

// op-sqlite v14 + Nitro Modules:
//   1. Rejects null params at the JSI boundary (TS says null is in Scalar but the
//      native binding refuses it).
//   2. Rejects an absent second argument to executeSync — even though TS marks
//      `params?: Scalar[]` as optional. We have to pass an empty array explicitly.
// `expandSql` handles (1) by rewriting `?` to `NULL` for null/undefined params.
// All call sites pass an explicit `[]` second arg to handle (2).
const expandSql = (
  sql: string,
  params: unknown[],
): { sql: string; params: Scalar[] } => {
  const out: Scalar[] = [];
  let inSingle = false;
  let inDouble = false;
  let pi = 0;
  let newSql = '';
  for (let ci = 0; ci < sql.length; ci++) {
    const ch = sql[ci];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      newSql += ch;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      newSql += ch;
      continue;
    }
    if (ch === '?' && !inSingle && !inDouble) {
      const v = params[pi++];
      if (v === undefined || v === null) {
        newSql += 'NULL';
      } else if (typeof v === 'boolean') {
        out.push(v ? 1 : 0);
        newSql += '?';
      } else if (typeof v === 'string' || typeof v === 'number') {
        out.push(v);
        newSql += '?';
      } else if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
        out.push(v as Scalar);
        newSql += '?';
      } else {
        out.push(String(v));
        newSql += '?';
      }
      continue;
    }
    newSql += ch;
  }
  return { sql: newSql, params: out };
};

export const createOpSqliteDriver = (opts: OpSqliteOptions): Database => {
  // op-sqlite's native `open` calls hasProperty('location') and then asString()
  // unconditionally — passing `location: undefined` throws "Value is undefined".
  // Only include location when it's actually a string.
  const openParams: { name: string; location?: string } = { name: opts.name };
  if (opts.location) openParams.location = opts.location;
  const db: DB = open(openParams);
  // Always pass an explicit empty params array — see header comment for why.
  db.executeSync('PRAGMA journal_mode = WAL', EMPTY);
  db.executeSync('PRAGMA foreign_keys = ON', EMPTY);
  return {
    exec: (sql) => {
      db.executeSync(sql, EMPTY);
    },
    run: (sql, params = []) => {
      const exp = expandSql(sql, params);
      const res = db.executeSync(exp.sql, exp.params);
      return {
        changes: res.rowsAffected ?? 0,
        lastInsertRowid: res.insertId ?? 0,
      } as RunResult;
    },
    get: (sql, params = []) => {
      const exp = expandSql(sql, params);
      const res = db.executeSync(exp.sql, exp.params);
      return (res.rows?.[0] as never) ?? undefined;
    },
    all: (sql, params = []) => {
      const exp = expandSql(sql, params);
      const res = db.executeSync(exp.sql, exp.params);
      return (res.rows ?? []) as never;
    },
    transaction: (fn) => {
      db.executeSync('BEGIN', EMPTY);
      try {
        const out = fn();
        db.executeSync('COMMIT', EMPTY);
        return out;
      } catch (e) {
        db.executeSync('ROLLBACK', EMPTY);
        throw e;
      }
    },
    close: () => db.close(),
  };
};
