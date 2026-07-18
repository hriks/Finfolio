import { makeSeededDb } from '../helpers/test-db';
import { fixedClock } from '../helpers/fixed-clock';
import { createIngestionLog, hashBody } from '../../src/services/ingestion-log';
import type { Database } from '../../src/data/database';

const seedExpense = (db: Database, id: string): void => {
  db.run(
    `INSERT INTO expenses (id, amount_minor, currency, occurred_at, created_at, source, updated_at)
     VALUES (?, 0, 'INR', 0, 0, 'sms', 0)`,
    [id],
  );
};

describe('IngestionLog', () => {
  it('hashBody is deterministic across same input', () => {
    expect(hashBody('sms', 'VK-HDFCBK-T', 'hello')).toBe(hashBody('sms', 'VK-HDFCBK-T', 'hello'));
    expect(hashBody('sms', 'VK-HDFCBK-T', 'hello').length).toBe(40);
  });

  it('detects already-seen bodies', () => {
    const db = makeSeededDb();
    const clock = fixedClock();
    const log = createIngestionLog({ db, clock });
    seedExpense(db, 'expense-id-1');
    const h = hashBody('sms', 'VK-HDFCBK-T', 'first');
    expect(log.seen(h)).toBe(false);
    log.record(h, 'sms', 'VK-HDFCBK-T', 'inserted', 'expense-id-1', 'first');
    expect(log.seen(h)).toBe(true);
  });

  it('refuses to double-record same body_hash', () => {
    const db = makeSeededDb();
    const clock = fixedClock();
    const log = createIngestionLog({ db, clock });
    seedExpense(db, 'e1');
    const h = hashBody('sms', 'A', 'x');
    log.record(h, 'sms', 'A', 'inserted', 'e1', 'x');
    expect(() => log.record(h, 'sms', 'A', 'inserted', 'e1', 'x')).toThrow();
  });

  it('persists the raw body alongside the hash', () => {
    const db = makeSeededDb();
    const clock = fixedClock();
    const log = createIngestionLog({ db, clock });
    const body = 'Rs.250.00 debited from a/c **1234 to SWIGGY';
    const h = hashBody('sms', 'VK-HDFCBK-T', body);
    log.record(h, 'sms', 'VK-HDFCBK-T', 'dropped_no_parse', null, body);
    const row = db.get<{ body: string | null }>(
      'SELECT body FROM ingestion_log WHERE body_hash = ?',
      [h],
    );
    expect(row?.body).toBe(body);
  });

  it('accepts a null body (historical rows stay null)', () => {
    const db = makeSeededDb();
    const clock = fixedClock();
    const log = createIngestionLog({ db, clock });
    const h = hashBody('sms', 'B', 'y');
    log.record(h, 'sms', 'B', 'dropped_promo', null, null);
    const row = db.get<{ body: string | null }>(
      'SELECT body FROM ingestion_log WHERE body_hash = ?',
      [h],
    );
    expect(row?.body).toBeNull();
  });
});
