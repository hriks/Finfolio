import {
  format,
  startOfDay,
  endOfDay,
  startOfMonth,
  startOfYear,
  subDays,
  addDays,
  addMonths,
  subMonths,
  differenceInCalendarDays,
} from 'date-fns';
import type { Expense } from '../../../types/domain';

export type Period = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all' | 'custom';

/** Millisecond timestamps as picked by the user — any time of day; periodWindow clamps. */
export interface CustomRange {
  start: number;
  end: number;
}

export interface PeriodWindow {
  start: number;
  end: number;
  label: string;
}

const customLabel = (s: Date, e: Date): string =>
  s.getFullYear() === e.getFullYear()
    ? `${format(s, 'MMM d')} – ${format(e, 'MMM d, yyyy')}`
    : `${format(s, 'MMM d, yyyy')} – ${format(e, 'MMM d, yyyy')}`;

export const periodWindow = (p: Period, now: Date, custom?: CustomRange | null): PeriodWindow => {
  switch (p) {
    case 'today': {
      const s = startOfDay(now).getTime();
      const e = endOfDay(now).getTime();
      return { start: s, end: e, label: `Today, ${format(now, 'MMM d')}` };
    }
    case 'yesterday': {
      const y = subDays(now, 1);
      const s = startOfDay(y).getTime();
      const e = endOfDay(y).getTime();
      return { start: s, end: e, label: `Yesterday, ${format(y, 'MMM d')}` };
    }
    case 'week': {
      const start = startOfDay(subDays(now, 6)).getTime();
      return { start, end: endOfDay(now).getTime(), label: 'Last 7 days' };
    }
    case 'month': {
      const start = startOfMonth(now).getTime();
      return { start, end: endOfDay(now).getTime(), label: format(now, 'MMMM yyyy') };
    }
    case 'year': {
      const start = startOfYear(now).getTime();
      return { start, end: endOfDay(now).getTime(), label: format(now, 'yyyy') };
    }
    case 'custom': {
      const c = custom ?? { start: now.getTime(), end: now.getTime() };
      const s = startOfDay(new Date(c.start));
      const e = endOfDay(new Date(c.end));
      return { start: s.getTime(), end: e.getTime(), label: customLabel(s, e) };
    }
    case 'all':
    default:
      return { start: 0, end: endOfDay(now).getTime(), label: 'All time' };
  }
};

/** `value` is in rupees (amountMinor / 100), as the BarChart expects. */
export interface Bucket {
  value: number;
  label: string;
  fullLabel: string;
}

// [s, e) — sums active expenses only.
const sumActive = (items: readonly Expense[], s: number, e: number): number =>
  items
    .filter((x) => x.status === 'active' && x.occurredAt >= s && x.occurredAt < e)
    .reduce((a, x) => a + x.amountMinor, 0);

// Sparse x-axis labels: roughly 6 across, anchored so the LAST bucket is labeled
// (matches the previous inline implementation which counted from the end).
const dailyBuckets = (items: readonly Expense[], firstDay: Date, days: number): Bucket[] => {
  const labelEvery = Math.max(1, Math.floor(days / 6));
  const out: Bucket[] = [];
  for (let i = 0; i < days; i++) {
    const day = startOfDay(addDays(firstDay, i));
    const sum = sumActive(items, day.getTime(), addDays(day, 1).getTime());
    out.push({
      value: sum / 100,
      label: (days - 1 - i) % labelEvery === 0 ? format(day, 'd') : '',
      fullLabel: format(day, 'EEE, MMM d'),
    });
  }
  return out;
};

const monthBucket = (items: readonly Expense[], monthStart: Date): Bucket => ({
  value: sumActive(items, monthStart.getTime(), addMonths(monthStart, 1).getTime()) / 100,
  label: format(monthStart, 'MMM'),
  fullLabel: format(monthStart, 'MMM yyyy'),
});

export const buildBarBuckets = (
  items: readonly Expense[],
  period: Period,
  now: Date,
  win: { start: number; end: number },
): Bucket[] => {
  if (period === 'week' || period === 'month') {
    // Trailing 7/30 days ending today — historical behavior, kept as-is.
    const days = period === 'week' ? 7 : 30;
    return dailyBuckets(items, startOfDay(subDays(now, days - 1)), days);
  }
  if (period === 'custom') {
    const days = differenceInCalendarDays(win.end, win.start) + 1;
    if (days <= 31) return dailyBuckets(items, new Date(win.start), days);
    // Month buckets can extend past the window edges; pre-filter so partial
    // months only count expenses inside the chosen range.
    const inWin = items.filter((x) => x.occurredAt >= win.start && x.occurredAt <= win.end);
    const out: Bucket[] = [];
    for (let m = startOfMonth(new Date(win.start)); m.getTime() <= win.end; m = addMonths(m, 1)) {
      out.push(monthBucket(inWin, m));
    }
    return out;
  }
  // year / all / today / yesterday: trailing 12 months — historical behavior.
  const out: Bucket[] = [];
  for (let i = 11; i >= 0; i--) {
    out.push(monthBucket(items, startOfMonth(subMonths(now, i))));
  }
  return out;
};
