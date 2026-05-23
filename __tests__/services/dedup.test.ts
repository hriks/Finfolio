import { makeSeededDb } from '../helpers/test-db';
import { fixedClock } from '../helpers/fixed-clock';
import { createDedupService, computeDedupKey } from '../../src/services/dedup';
import { createExpenseService } from '../../src/services/expense-service';

describe('DedupService', () => {
  const setup = () => {
    const db = makeSeededDb();
    const clock = fixedClock(1_700_000_000_000);
    const dedup = createDedupService({ db, clock });
    const expense = createExpenseService({ db, clock });
    return { db, clock, dedup, expense };
  };

  it('computeDedupKey is deterministic and bucketed', () => {
    // Both timestamps must fall in the same 2-minute bucket
    // (Math.floor(ts / 120000) must match for both).
    // 1_700_000_000_000 -> bucket 14166666; ts must be < 1_700_000_040_000.
    const a = computeDedupKey({
      amountMinor: 12500,
      sourceRef: 'VK-HDFCBK-T',
      occurredAt: 1_700_000_000_000,
    });
    const b = computeDedupKey({
      amountMinor: 12500,
      sourceRef: 'JD-HDFCB-T',
      occurredAt: 1_700_000_030_000,
    });
    expect(a).toBe(b);
  });

  it('finds a match within window for same key', () => {
    const { expense, dedup, clock } = setup();
    const key = computeDedupKey({
      amountMinor: 250,
      sourceRef: 'VK-HDFCBK-T',
      occurredAt: clock.now(),
    });
    expense.insert({
      amountMinor: 250,
      occurredAt: clock.now(),
      merchantRaw: null,
      merchantNorm: null,
      categoryId: null,
      source: 'sms',
      dedupKey: key,
    });
    const match = dedup.findMatch(key);
    expect(match).toBeDefined();
  });

  it('does not match outside the 5-minute window', () => {
    const { expense, dedup, clock } = setup();
    const key = computeDedupKey({
      amountMinor: 250,
      sourceRef: 'VK-HDFCBK-T',
      occurredAt: clock.now(),
    });
    expense.insert({
      amountMinor: 250,
      occurredAt: clock.now(),
      merchantRaw: null,
      merchantNorm: null,
      categoryId: null,
      source: 'sms',
      dedupKey: key,
    });
    clock.advance(6 * 60 * 1000);
    const match = dedup.findMatch(key);
    expect(match).toBeUndefined();
  });

  it('merge bumps verified_by and merges sources', () => {
    const { expense, dedup } = setup();
    const e = expense.insert({
      amountMinor: 250,
      occurredAt: 0,
      merchantRaw: null,
      merchantNorm: 'rapido',
      categoryId: null,
      source: 'sms',
      sourceMsg: 'sms body',
      dedupKey: 'k',
    });
    const after = dedup.merge(e.id, {
      amountMinor: 250,
      merchantRaw: 'Rapido',
      merchantNorm: 'rapido',
      occurredAt: -1000,
      sourceRef: 'com.rapido.passenger',
      sourceMsg: 'notif body',
      confidence: 0.9,
    });
    expect(after.verifiedBy).toBe(2);
    expect(after.source).toBe('merged');
    expect(after.merchantRaw).toBe('Rapido');
    expect(after.occurredAt).toBe(-1000);
    expect(after.sourceMsg).toContain('sms body');
    expect(after.sourceMsg).toContain('notif body');
  });

  it('fuzzyMatch catches same-merchant cross-channel within 10 minutes', () => {
    const { expense, dedup, clock } = setup();
    const t0 = clock.now();
    expense.insert({
      amountMinor: 12000,
      occurredAt: t0,
      merchantRaw: 'Rapido',
      merchantNorm: 'rapido',
      categoryId: null,
      source: 'notification',
      sourceRef: 'com.rapido.passenger',
      dedupKey: computeDedupKey({ amountMinor: 12000, sourceRef: 'rapido', occurredAt: t0 }),
    });
    const match = dedup.fuzzyMatch({
      amountMinor: 12000,
      merchantNorm: 'rapido',
      sourceRef: 'VK-HDFCBK-T',
      occurredAt: t0 + 7 * 60 * 1000,
    });
    expect(match).toBeDefined();
  });

  it('fuzzyMatch ignores matches beyond 10 minutes', () => {
    const { expense, dedup, clock } = setup();
    const t0 = clock.now();
    expense.insert({
      amountMinor: 12000,
      occurredAt: t0,
      merchantRaw: 'Rapido',
      merchantNorm: 'rapido',
      categoryId: null,
      source: 'notification',
      sourceRef: 'com.rapido.passenger',
      dedupKey: computeDedupKey({ amountMinor: 12000, sourceRef: 'rapido', occurredAt: t0 }),
    });
    const match = dedup.fuzzyMatch({
      amountMinor: 12000,
      merchantNorm: 'rapido',
      sourceRef: 'VK-HDFCBK-T',
      occurredAt: t0 + 11 * 60 * 1000,
    });
    expect(match).toBeUndefined();
  });

  it('recordMergePattern increments seen_count and updates last_seen_at', () => {
    const { db, dedup, clock } = setup();
    dedup.recordMergePattern({
      merchantNorm: 'rapido',
      counterpart: { kind: 'phone', value: '9876543210' },
      delayMs: 5 * 60 * 1000,
    });
    dedup.recordMergePattern({
      merchantNorm: 'rapido',
      counterpart: { kind: 'phone', value: '9876543210' },
      delayMs: 7 * 60 * 1000,
    });
    const row = db.get<Record<string, unknown>>(
      `SELECT seen_count, last_seen_at, median_delay_ms FROM merge_patterns WHERE merchant_norm = ? AND counterpart = ?`,
      ['rapido', '9876543210'],
    );
    expect(row?.seen_count).toBe(2);
    expect(row?.last_seen_at).toBe(clock.now());
    expect(row?.median_delay_ms).toBeGreaterThan(0);
  });

  it('patternMatch returns nothing when seen_count < 2', () => {
    const { expense, dedup, clock } = setup();
    const t0 = clock.now();
    expense.insert({
      amountMinor: 12000,
      occurredAt: t0,
      merchantRaw: 'Rapido',
      merchantNorm: 'rapido',
      categoryId: null,
      source: 'notification',
    });
    dedup.recordMergePattern({
      merchantNorm: 'rapido',
      counterpart: { kind: 'phone', value: '9876543210' },
      delayMs: 5 * 60 * 1000,
    });
    const m = dedup.patternMatch({
      amountMinor: 12000,
      merchantNorm: '9876543210',
      sourceRef: 'VK-HDFCBK-T',
      occurredAt: t0 + 5 * 60 * 1000,
    });
    expect(m).toBeUndefined();
  });

  it('patternMatch finds counterpart expense once seen_count >= 2', () => {
    const { expense, dedup, clock } = setup();
    const t0 = clock.now();
    expense.insert({
      amountMinor: 12000,
      occurredAt: t0,
      merchantRaw: 'Rapido',
      merchantNorm: 'rapido',
      categoryId: null,
      source: 'notification',
    });
    dedup.recordMergePattern({
      merchantNorm: 'rapido',
      counterpart: { kind: 'phone', value: '9876543210' },
      delayMs: 5 * 60 * 1000,
    });
    dedup.recordMergePattern({
      merchantNorm: 'rapido',
      counterpart: { kind: 'phone', value: '9876543210' },
      delayMs: 5 * 60 * 1000,
    });
    const m = dedup.patternMatch({
      amountMinor: 12000,
      merchantNorm: '9876543210',
      sourceRef: 'VK-HDFCBK-T',
      occurredAt: t0 + 5 * 60 * 1000,
    });
    expect(m?.merchantNorm).toBe('rapido');
  });
});
