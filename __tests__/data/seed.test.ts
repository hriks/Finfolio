import { makeSeededDb } from '../helpers/test-db';
import { seedMerchantRules } from '../../src/data/seed/merchant-rules';

describe('seed: categories', () => {
  // 24 categories: the old 'Travel' category was intentionally merged into
  // 'Transport' (see rePointMedicalRules in src/data/app-db.ts).
  it('inserts the bundled system categories', () => {
    const db = makeSeededDb();
    const rows = db.all<{ name: string; is_system: number }>('SELECT name, is_system FROM categories');
    expect(rows.length).toBe(24);
    expect(rows.every((r) => r.is_system === 1)).toBe(true);
    const names = rows.map((r) => r.name);
    for (const n of ['Food', 'Transport', 'Uncategorized']) {
      expect(names).toContain(n);
    }
    expect(names).not.toContain('Travel');
    db.close();
  });

  it('seed is idempotent', () => {
    const db = makeSeededDb();
    const count = db.get<{ c: number }>('SELECT COUNT(*) AS c FROM categories')?.c;
    expect(count).toBe(24);
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

  it('includes rules promoted from real usage (generic merchants)', () => {
    const db = makeSeededDb();
    seedMerchantRules(db);
    const expectations: Array<[string, string]> = [
      ['ekart', 'cat-shopping'],
      ['amazon pay later', 'cat-shopping'],
      ['redcliffe labs', 'cat-medical'],
      ['bookmyshow', 'cat-entertainment'],
      ['zerodha', 'cat-investments'],
      ['lic of', 'cat-insurance'],
      ['indane', 'cat-bills'],
      ['claude', 'cat-subscriptions'],
      ['google workspace', 'cat-subscriptions'],
      ['godaddy', 'cat-subscriptions'],
      ['om automobiles', 'cat-fuel'],
      ['malnad coffee house', 'cat-food'],
    ];
    for (const [merchant, catId] of expectations) {
      const row = db.get<{ category_id: string }>(
        "SELECT category_id FROM merchant_rules WHERE merchant_norm = ? AND origin = 'bundled'",
        [merchant],
      );
      expect({ merchant, categoryId: row?.category_id }).toEqual({ merchant, categoryId: catId });
    }
    db.close();
  });

  it('includes personal payees promoted from real usage', () => {
    const db = makeSeededDb();
    seedMerchantRules(db);
    const expectations: Array<[string, string]> = [
      ['ashwini manish gupta', 'cat-gifts'],
      ['kashi prasad', 'cat-transport'],
      ['ravi pan bhandar', 'cat-vices'],
      ['sunil yadav', 'cat-groceries'],
      ['mr md shahid', 'cat-food'],
      ['narayan singh chauhan', 'cat-fuel'],
      ['rajat mishra', 'cat-education'],
      ['ntagic software', 'cat-investments'],
      ['pranjal pandey', 'cat-bills'],
    ];
    for (const [merchant, catId] of expectations) {
      const row = db.get<{ category_id: string }>(
        "SELECT category_id FROM merchant_rules WHERE merchant_norm = ? AND origin = 'bundled'",
        [merchant],
      );
      expect({ merchant, categoryId: row?.category_id }).toEqual({ merchant, categoryId: catId });
    }
    db.close();
  });

  it('deliberately excludes payment rails and locations', () => {
    const db = makeSeededDb();
    seedMerchantRules(db);
    for (const merchant of ['web upi', 'civil lines', 'phonepe']) {
      const row = db.get<{ category_id: string }>(
        'SELECT category_id FROM merchant_rules WHERE merchant_norm = ?',
        [merchant],
      );
      expect(row).toBeUndefined();
    }
    db.close();
  });

  it('every bundled rule points at a seeded category', () => {
    const db = makeSeededDb();
    seedMerchantRules(db);
    const orphans = db.all<{ merchant_norm: string }>(
      `SELECT mr.merchant_norm FROM merchant_rules mr
       LEFT JOIN categories c ON c.id = mr.category_id
       WHERE c.id IS NULL`,
    );
    expect(orphans).toEqual([]);
    db.close();
  });
});
