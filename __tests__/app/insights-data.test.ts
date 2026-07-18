import { startOfDay, endOfDay } from 'date-fns';
import { periodWindow, buildBarBuckets } from '../../src/app/screens/insights/insights-data';
import type { Expense } from '../../src/types/domain';

// Saturday 2026-07-18 14:30 local time
const NOW = new Date(2026, 6, 18, 14, 30, 0);

describe('periodWindow', () => {
  it('month = current calendar month to end of today', () => {
    const w = periodWindow('month', NOW);
    expect(w.start).toBe(new Date(2026, 6, 1).getTime());
    expect(w.end).toBe(endOfDay(NOW).getTime());
    expect(w.label).toBe('July 2026');
  });

  it('lastMonth = previous calendar month start to end', () => {
    const w = periodWindow('lastMonth', NOW);
    expect(w.start).toBe(startOfDay(new Date(2026, 5, 1)).getTime());
    expect(w.end).toBe(endOfDay(new Date(2026, 5, 30)).getTime());
    expect(w.label).toBe('June 2026');
  });

  it('custom clamps to start-of-day / end-of-day', () => {
    // Range chosen with arbitrary times of day: Jun 1 09:15 → Jun 30 18:45
    const w = periodWindow('custom', NOW, {
      start: new Date(2026, 5, 1, 9, 15).getTime(),
      end: new Date(2026, 5, 30, 18, 45).getTime(),
    });
    expect(w.start).toBe(startOfDay(new Date(2026, 5, 1)).getTime());
    expect(w.end).toBe(endOfDay(new Date(2026, 5, 30)).getTime());
  });

  it('custom label, same year', () => {
    const w = periodWindow('custom', NOW, {
      start: new Date(2026, 5, 1).getTime(),
      end: new Date(2026, 5, 30).getTime(),
    });
    expect(w.label).toBe('Jun 1 – Jun 30, 2026');
  });

  it('custom label, crossing years', () => {
    const w = periodWindow('custom', NOW, {
      start: new Date(2025, 11, 15).getTime(),
      end: new Date(2026, 0, 10).getTime(),
    });
    expect(w.label).toBe('Dec 15, 2025 – Jan 10, 2026');
  });

  it('custom without a range falls back to today', () => {
    const w = periodWindow('custom', NOW, null);
    expect(w.start).toBe(startOfDay(NOW).getTime());
    expect(w.end).toBe(endOfDay(NOW).getTime());
  });
});

const exp = (
  occurredAt: number,
  amountMinor: number,
  status: Expense['status'] = 'active',
): Expense => ({
  id: `e-${occurredAt}-${amountMinor}`,
  amountMinor,
  currency: 'INR',
  occurredAt,
  createdAt: occurredAt,
  updatedAt: occurredAt,
  merchantRaw: null,
  merchantNorm: null,
  categoryId: null,
  source: 'manual',
  sourceRef: null,
  sourceMsg: null,
  confidence: 1,
  status,
  note: null,
  photoPath: null,
  dedupKey: null,
  verifiedBy: 1,
  locationLat: null,
  locationLon: null,
  locationName: null,
  subcategory: null,
});

describe('buildBarBuckets', () => {
  const win = (p: 'month' | 'lastMonth' | 'all') => periodWindow(p, NOW);

  it('excludes non-active expenses', () => {
    const items = [
      exp(new Date(2026, 6, 18, 9, 0).getTime(), 5_000, 'void'),
      exp(new Date(2026, 6, 18, 10, 0).getTime(), 2_000, 'pending_review'),
    ];
    const b = buildBarBuckets(items, 'month', NOW, win('month'));
    expect(b[b.length - 1].value).toBe(0);
  });

  it('custom ≤31 days = one daily bucket per day of the window, aligned to the window', () => {
    // June 2026 (30 days), NOT relative to today.
    const range = periodWindow('custom', NOW, {
      start: new Date(2026, 5, 1).getTime(),
      end: new Date(2026, 5, 30).getTime(),
    });
    const items = [
      exp(new Date(2026, 5, 1, 12, 0).getTime(), 30_000),
      exp(new Date(2026, 5, 30, 23, 0).getTime(), 7_000),
      exp(new Date(2026, 6, 2, 12, 0).getTime(), 99_900), // outside window → nowhere
    ];
    const b = buildBarBuckets(items, 'custom', NOW, range);
    expect(b).toHaveLength(30);
    expect(b[0].value).toBe(300);
    expect(b[0].fullLabel).toBe('Mon, Jun 1');
    expect(b[29].value).toBe(70);
    expect(b.reduce((s, x) => s + x.value, 0)).toBe(370);
  });

  it('lastMonth = one daily bucket per day of the previous month, aligned to the window', () => {
    // June 2026 has 30 days.
    const items = [
      exp(new Date(2026, 5, 1, 12, 0).getTime(), 30_000), // Jun 1 → first bucket
      exp(new Date(2026, 5, 30, 23, 0).getTime(), 7_000), // Jun 30 → last bucket
      exp(new Date(2026, 6, 1, 12, 0).getTime(), 99_900), // Jul 1 → outside window, excluded
    ];
    const b = buildBarBuckets(items, 'lastMonth', NOW, win('lastMonth'));
    expect(b).toHaveLength(30);
    expect(b[0].value).toBe(300);
    expect(b[0].fullLabel).toBe('Mon, Jun 1');
    expect(b[29].value).toBe(70);
    expect(b[29].fullLabel).toBe('Tue, Jun 30');
    expect(b.reduce((s, x) => s + x.value, 0)).toBe(370);
  });

  it('custom >31 days = one bucket per calendar month touched by the window', () => {
    const range = periodWindow('custom', NOW, {
      start: new Date(2026, 3, 15).getTime(), // Apr 15
      end: new Date(2026, 5, 10).getTime(), // Jun 10
    });
    const items = [
      exp(new Date(2026, 3, 20).getTime(), 10_000), // Apr
      exp(new Date(2026, 4, 5).getTime(), 20_000), // May
      exp(new Date(2026, 5, 5).getTime(), 40_000), // Jun
      exp(new Date(2026, 3, 10).getTime(), 99_900), // Apr but BEFORE window start → excluded
    ];
    const b = buildBarBuckets(items, 'custom', NOW, range);
    expect(b).toHaveLength(3);
    expect(b.map((x) => x.label)).toEqual(['Apr', 'May', 'Jun']);
    expect(b[0].value).toBe(100);
    expect(b[0].fullLabel).toBe('Apr 2026');
    expect(b[1].value).toBe(200);
    expect(b[2].value).toBe(400);
  });

  it('custom of exactly 31 days stays daily', () => {
    const range = periodWindow('custom', NOW, {
      start: new Date(2026, 4, 1).getTime(),
      end: new Date(2026, 4, 31).getTime(),
    });
    const b = buildBarBuckets([], 'custom', NOW, range);
    expect(b).toHaveLength(31);
  });

  it('month = trailing 30 days ending today (NOT the calendar month) — legacy behavior, do not "fix"', () => {
    const items = [
      exp(new Date(2026, 5, 19).getTime(), 10_000), // 29 days before NOW → first bucket (bucket 0)
      exp(new Date(2026, 5, 18).getTime(), 99_900), // 30 days before NOW → outside the trailing-30 window
    ];
    const b = buildBarBuckets(items, 'month', NOW, win('month'));
    expect(b).toHaveLength(30);
    expect(b[b.length - 1].fullLabel).toBe('Sat, Jul 18');
    expect(b[0].value).toBe(100);
    expect(b.reduce((s, x) => s + x.value, 0)).toBe(100);
  });

  it('custom of exactly 32 days switches to monthly buckets', () => {
    const range = periodWindow('custom', NOW, {
      start: new Date(2026, 4, 1).getTime(), // May 1
      end: new Date(2026, 5, 1).getTime(), // Jun 1 (32 days inclusive)
    });
    const b = buildBarBuckets([], 'custom', NOW, range);
    expect(b).toHaveLength(2);
    expect(b.map((x) => x.label)).toEqual(['May', 'Jun']);
  });

  it('all = 12 trailing month buckets', () => {
    const items = [exp(new Date(2026, 6, 10).getTime(), 12_300)];
    const b = buildBarBuckets(items, 'all', NOW, win('all'));
    expect(b).toHaveLength(12);
    expect(b[11].label).toBe('Jul');
    expect(b[11].value).toBe(123);
  });
});
