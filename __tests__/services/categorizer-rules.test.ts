import { makeSeededDb } from '../helpers/test-db';
import { createRuleCategorizer } from '../../src/services/categorizer/rules';

describe('rule-based categorizer', () => {
  it('matches bundled rule exact', () => {
    const db = makeSeededDb();
    const cat = createRuleCategorizer({ db });
    const r = cat.categorize('swiggy');
    expect(r.categoryId).toBe('cat-food');
    expect(r.source).toBe('bundled_rule');
    expect(r.confidence).toBeGreaterThan(0.9);
  });

  it('matches bundled rule substring', () => {
    const db = makeSeededDb();
    const cat = createRuleCategorizer({ db });
    const r = cat.categorize('swiggy bangalore');
    expect(r.categoryId).toBe('cat-food');
  });

  it('user rule beats bundled rule', () => {
    const db = makeSeededDb();
    db.run(
      `INSERT INTO merchant_rules (id, merchant_norm, category_id, origin, weight, created_at)
       VALUES ('u-1', 'swiggy', 'cat-shopping', 'user', 10, 0)`,
    );
    const cat = createRuleCategorizer({ db });
    const r = cat.categorize('swiggy');
    expect(r.categoryId).toBe('cat-shopping');
    expect(r.source).toBe('user_rule');
    expect(r.confidence).toBe(1.0);
  });

  it('returns Uncategorized when no match', () => {
    const db = makeSeededDb();
    const cat = createRuleCategorizer({ db });
    const r = cat.categorize('quantum widgets pvt ltd');
    expect(r.categoryId).toBe('cat-uncategorized');
    expect(r.source).toBe('uncategorized');
    expect(r.confidence).toBe(0);
  });
});
