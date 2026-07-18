import { format, startOfDay, endOfDay, startOfMonth, startOfYear, subDays } from 'date-fns';

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
