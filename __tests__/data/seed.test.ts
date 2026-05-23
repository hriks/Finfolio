import { makeSeededDb } from '../helpers/test-db';
import { seedMerchantRules } from '../../src/data/seed/merchant-rules';

describe('seed: categories', () => {
  it('inserts the bundled system categories', () => {
    const db = makeSeededDb();
    const rows = db.all<{ name: string; is_system: number }>('SELECT name, is_system FROM categories');
    expect(rows.length).toBe(25);
    expect(rows.every((r) => r.is_system === 1)).toBe(true);
    const names = rows.map((r) => r.name);
    for (const n of ['Food', 'Transport', 'Uncategorized']) {
      expect(names).toContain(n);
    }
    db.close();
  });

  it('seed is idempotent', () => {
    const db = makeSeededDb();
    const count = db.get<{ c: number }>('SELECT COUNT(*) AS c FROM categories')?.c;
    expect(count).toBe(25);
    db.close();
  });
});

describe('seed: merchant rules', () => {
  it('inserts bundled rules for common merchants', () => {
    const db = makeSeededDb();
    seedMerchantRules(db);
    const swiggy = db.get<{ category_id: string; origin: string }>(
      "SELECT category_id, origin FROM merchant_rules WHERE merchant_norm = 'swiggy'",
    );
    expect(swiggy?.category_id).toBe('cat-food');
    expect(swiggy?.origin).toBe('bundled');
    const count = db.get<{ c: number }>("SELECT COUNT(*) AS c FROM merchant_rules WHERE origin = 'bundled'")?.c;
    expect(count).toBeGreaterThanOrEqual(30);
    db.close();
  });
});
