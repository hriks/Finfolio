import { makeRawDb } from '../helpers/test-db';

describe('better-sqlite3 driver', () => {
  it('runs basic SQL', () => {
    const db = makeRawDb();
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    db.run('INSERT INTO t (name) VALUES (?)', ['hello']);
    const row = db.get<{ id: number; name: string }>('SELECT * FROM t WHERE name = ?', ['hello']);
    expect(row).toEqual({ id: 1, name: 'hello' });
    db.close();
  });

  it('rolls back failed transactions', () => {
    const db = makeRawDb();
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)');
    expect(() =>
      db.transaction(() => {
        db.run('INSERT INTO t VALUES (1)');
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(db.all('SELECT * FROM t')).toEqual([]);
    db.close();
  });
});
