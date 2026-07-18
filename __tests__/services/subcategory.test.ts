import { makeSeededDb } from '../helpers/test-db';
import { fixedClock } from '../helpers/fixed-clock';
import { createExpenseService } from '../../src/services/expense-service';
import { suggestSubcategory } from '../../src/services/categorizer/subcategory';

describe('suggestSubcategory', () => {
  const setup = () => {
    const db = makeSeededDb();
    const clock = fixedClock(1_700_000_000_000);
    const expense = createExpenseService({ db, clock });
    return { db, clock, expense };
  };

  it('returns null when no history and no bundled hint', () => {
    const { db } = setup();
    expect(suggestSubcategory(db, 'some-unknown-merchant-xyz')).toBeNull();
  });

  it('requires at least 2 prior matches before history wins (falls through to bundled if any)', () => {
    const { db, expense, clock } = setup();
    expense.insert({
      amountMinor: 200,
      occurredAt: clock.now(),
      merchantRaw: 'Local',
      merchantNorm: 'some-unknown-merchant-xyz',
      categoryId: null,
      source: 'manual',
      subcategory: 'lunch',
    });
    expect(suggestSubcategory(db, 'some-unknown-merchant-xyz')).toBeNull();
  });

  it('falls back to bundled hint when no history exists', () => {
    const { db } = setup();
    expect(suggestSubcategory(db, 'uber')).toBe('cab');
    expect(suggestSubcategory(db, 'swiggy')).toBe('food-delivery');
  });

  it('history beats bundled hint once history reaches MIN_COUNT', () => {
    const { db, expense, clock } = setup();
    for (let i = 0; i < 2; i++) {
      expense.insert({
        amountMinor: 200,
        occurredAt: clock.now() - i * 1000,
        merchantRaw: 'U',
        merchantNorm: 'uber',
        categoryId: null,
        source: 'manual',
        subcategory: 'personal-ride',
      });
    }
    expect(suggestSubcategory(db, 'uber')).toBe('personal-ride');
  });

  it('returns most-frequent subcategory for the merchant', () => {
    const { db, expense, clock } = setup();
    for (let i = 0; i < 3; i++) {
      expense.insert({
        amountMinor: 200,
        occurredAt: clock.now() - i * 1000,
        merchantRaw: 'Z',
        merchantNorm: 'zomato',
        categoryId: null,
        source: 'manual',
        subcategory: 'lunch',
      });
    }
    expense.insert({
      amountMinor: 800,
      occurredAt: clock.now(),
      merchantRaw: 'Z',
      merchantNorm: 'zomato',
      categoryId: null,
      source: 'manual',
      subcategory: 'dinner',
    });
    expect(suggestSubcategory(db, 'zomato')).toBe('lunch');
  });

  it('groups subcategories case-insensitively and returns the most recent spelling on a tie', () => {
    const { db, expense, clock } = setup();
    // 'Grocery' and 'grocery' are the same subcategory case-insensitively (1 each = 2 total),
    // which now meets MIN_COUNT. The more recent occurrence's spelling should win the tie.
    expense.insert({
      amountMinor: 200,
      occurredAt: clock.now() - 1000,
      merchantRaw: 'DM',
      merchantNorm: 'some-case-merchant',
      categoryId: null,
      source: 'manual',
      subcategory: 'Grocery',
    });
    expense.insert({
      amountMinor: 200,
      occurredAt: clock.now(),
      merchantRaw: 'DM',
      merchantNorm: 'some-case-merchant',
      categoryId: null,
      source: 'manual',
      subcategory: 'grocery',
    });
    expect(suggestSubcategory(db, 'some-case-merchant')).toBe('grocery');
  });

  it('returns the most frequent original spelling within the winning case-insensitive group', () => {
    const { db, expense, clock } = setup();
    // 'Third wave coffee' x2 (older) vs 'Third Wave Coffee' x1 (newer) — same group,
    // case-insensitive count is 3 (>= MIN_COUNT), and the most frequent spelling wins.
    expense.insert({
      amountMinor: 200,
      occurredAt: clock.now() - 3000,
      merchantRaw: 'TWC',
      merchantNorm: 'third-wave-coffee-merchant',
      categoryId: null,
      source: 'manual',
      subcategory: 'Third wave coffee',
    });
    expense.insert({
      amountMinor: 200,
      occurredAt: clock.now() - 2000,
      merchantRaw: 'TWC',
      merchantNorm: 'third-wave-coffee-merchant',
      categoryId: null,
      source: 'manual',
      subcategory: 'Third wave coffee',
    });
    expense.insert({
      amountMinor: 200,
      occurredAt: clock.now() - 1000,
      merchantRaw: 'TWC',
      merchantNorm: 'third-wave-coffee-merchant',
      categoryId: null,
      source: 'manual',
      subcategory: 'Third Wave Coffee',
    });
    expect(suggestSubcategory(db, 'third-wave-coffee-merchant')).toBe('Third wave coffee');
  });
});
