import { makeSeededDb } from '../helpers/test-db';
import { fixedClock } from '../helpers/fixed-clock';
import { createExpenseService } from '../../src/services/expense-service';
import { DELETE_WINDOW_MS } from '../../src/types/domain';

describe('ExpenseService.insert / get / list', () => {
  const setup = () => {
    const db = makeSeededDb();
    const clock = fixedClock(1_700_000_000_000);
    const svc = createExpenseService({ db, clock });
    return { db, clock, svc };
  };

  it('inserts and reads back an expense', () => {
    const { svc } = setup();
    const e = svc.insert({
      amountMinor: 12500,
      occurredAt: 1_700_000_000_000,
      merchantRaw: 'Swiggy',
      merchantNorm: 'swiggy',
      categoryId: 'cat-food',
      source: 'manual',
    });
    expect(e.id).toBeTruthy();
    expect(e.status).toBe('active');
    expect(e.confidence).toBe(1.0);
    expect(svc.get(e.id)?.amountMinor).toBe(12500);
  });

  it('uses clock for createdAt and updatedAt', () => {
    const { clock, svc } = setup();
    const e = svc.insert({
      amountMinor: 100,
      occurredAt: 1_699_000_000_000,
      merchantRaw: 'X',
      merchantNorm: 'x',
      categoryId: 'cat-uncategorized',
      source: 'manual',
    });
    expect(e.createdAt).toBe(clock.now());
    expect(e.updatedAt).toBe(clock.now());
    expect(e.occurredAt).toBe(1_699_000_000_000);
  });

  it('lists expenses newest-occurred first, excluding void by default', () => {
    const { svc } = setup();
    const a = svc.insert({ amountMinor: 1, occurredAt: 100, merchantRaw: null, merchantNorm: null, categoryId: null, source: 'manual' });
    const b = svc.insert({ amountMinor: 2, occurredAt: 200, merchantRaw: null, merchantNorm: null, categoryId: null, source: 'manual' });
    const c = svc.insert({ amountMinor: 3, occurredAt: 300, merchantRaw: null, merchantNorm: null, categoryId: null, source: 'manual' });
    svc.setStatus(b.id, 'void');
    const list = svc.list();
    expect(list.map((e) => e.id)).toEqual([c.id, a.id]);
    const listAll = svc.list({ includeVoid: true });
    expect(listAll.length).toBe(3);
  });
});

describe('ExpenseService.delete + void semantics', () => {
  const setup = () => {
    const db = makeSeededDb();
    const clock = fixedClock(1_700_000_000_000);
    const svc = createExpenseService({ db, clock });
    return { db, clock, svc };
  };

  it('hard-deletes within 5 minutes of creation', () => {
    const { svc } = setup();
    const e = svc.insert({ amountMinor: 100, occurredAt: 0, merchantRaw: null, merchantNorm: null, categoryId: null, source: 'manual' });
    svc.delete(e.id);
    expect(svc.get(e.id)).toBeUndefined();
  });

  it('rejects hard-delete after the 5-minute window', () => {
    const { svc, clock } = setup();
    const e = svc.insert({ amountMinor: 100, occurredAt: 0, merchantRaw: null, merchantNorm: null, categoryId: null, source: 'manual' });
    clock.advance(DELETE_WINDOW_MS + 1);
    expect(() => svc.delete(e.id)).toThrow(/window/i);
    expect(svc.get(e.id)).toBeDefined();
  });

  it('void / unvoid toggles status', () => {
    const { svc, clock } = setup();
    const e = svc.insert({ amountMinor: 100, occurredAt: 0, merchantRaw: null, merchantNorm: null, categoryId: null, source: 'manual' });
    clock.advance(DELETE_WINDOW_MS + 1);
    expect(svc.void(e.id).status).toBe('void');
    expect(svc.unvoid(e.id).status).toBe('active');
  });

  it('canDelete returns true only within window', () => {
    const { svc, clock } = setup();
    const e = svc.insert({ amountMinor: 1, occurredAt: 0, merchantRaw: null, merchantNorm: null, categoryId: null, source: 'manual' });
    expect(svc.canDelete(e.id)).toBe(true);
    clock.advance(DELETE_WINDOW_MS - 1);
    expect(svc.canDelete(e.id)).toBe(true);
    clock.advance(2);
    expect(svc.canDelete(e.id)).toBe(false);
  });
});

describe('ExpenseService.update', () => {
  const setup = () => {
    const db = makeSeededDb();
    const clock = fixedClock(1_700_000_000_000);
    const svc = createExpenseService({ db, clock });
    return { svc, clock };
  };

  it('updates category and bumps updatedAt', () => {
    const { svc, clock } = setup();
    const e = svc.insert({ amountMinor: 100, occurredAt: 0, merchantRaw: null, merchantNorm: 'swiggy', categoryId: 'cat-uncategorized', source: 'manual' });
    clock.advance(1000);
    const after = svc.update(e.id, { categoryId: 'cat-food', note: 'lunch' });
    expect(after.categoryId).toBe('cat-food');
    expect(after.note).toBe('lunch');
    expect(after.updatedAt).toBe(clock.now());
    expect(after.createdAt).toBe(e.createdAt);
  });

  it('rejects updates to a non-existent id', () => {
    const { svc } = setup();
    expect(() => svc.update('does-not-exist', { note: 'x' })).toThrow();
  });
});
