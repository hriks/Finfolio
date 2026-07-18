# Insights Custom Date Range Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Custom" period pill to the Insights tab that opens a two-step native date picker (start, then end) so any past range — e.g. last month — can be viewed.

**Architecture:** Extract the pure date math (`periodWindow`, bar-chart bucketing) out of `InsightsScreen.tsx` into a new pure module `src/app/screens/insights/insights-data.ts` with unit tests, then wire the screen to it and add the Custom pill + `DateTimePickerAndroid` flow (same two-step pattern as `ManualEntryScreen`).

**Tech Stack:** React Native, TypeScript, date-fns, `@react-native-community/datetimepicker` (already a dependency), Jest + ts-jest (node environment — the new module must not import anything from `react-native`).

**Spec:** `docs/superpowers/specs/2026-07-18-insights-custom-range-design.md`

## Global Constraints

- `insights-data.ts` is pure: imports only from `date-fns` and `src/types/domain`. No React/React Native imports (tests run in node).
- Custom range label: same year → `Jun 1 – Jun 30, 2026`; cross-year → `Dec 15, 2025 – Jan 10, 2026` (en dash ` – `).
- Custom bar chart: range ≤ 31 days → daily buckets over the chosen window; > 31 days → calendar-month buckets over the chosen window.
- Existing periods keep their current bar-chart behavior exactly (week/month = trailing 7/30 days from today; year/all/today/yesterday = trailing 12 months). Do NOT "fix" the trailing-30-days month quirk — it is out of scope.
- Bucket `value` is in rupees (`amountMinor / 100`), matching the existing chart code.
- Only `status === 'active'` expenses count in bucket sums.
- Commits use conventional-commit style and end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Pure period-window module (`periodWindow` incl. custom)

**Files:**
- Create: `src/app/screens/insights/insights-data.ts`
- Test: `__tests__/app/insights-data.test.ts`

**Interfaces:**
- Consumes: `Expense` from `src/types/domain` (only for Task 2; this task is date-only).
- Produces (Task 2 extends this file; Task 3 imports from it):
  - `type Period = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all' | 'custom'`
  - `interface CustomRange { start: number; end: number }` (ms timestamps, any time of day)
  - `interface PeriodWindow { start: number; end: number; label: string }`
  - `periodWindow(p: Period, now: Date, custom?: CustomRange | null): PeriodWindow`

- [ ] **Step 1: Write the failing test**

Create `__tests__/app/insights-data.test.ts`:

```ts
import { startOfDay, endOfDay } from 'date-fns';
import { periodWindow } from '../../src/app/screens/insights/insights-data';

// Saturday 2026-07-18 14:30 local time
const NOW = new Date(2026, 6, 18, 14, 30, 0);

describe('periodWindow', () => {
  it('month = current calendar month to end of today', () => {
    const w = periodWindow('month', NOW);
    expect(w.start).toBe(new Date(2026, 6, 1).getTime());
    expect(w.end).toBe(endOfDay(NOW).getTime());
    expect(w.label).toBe('July 2026');
  });

  it('week = last 7 days inclusive of today', () => {
    const w = periodWindow('week', NOW);
    expect(w.start).toBe(startOfDay(new Date(2026, 6, 12)).getTime());
    expect(w.end).toBe(endOfDay(NOW).getTime());
    expect(w.label).toBe('Last 7 days');
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/app/insights-data.test.ts`
Expected: FAIL — `Cannot find module '../../src/app/screens/insights/insights-data'`

- [ ] **Step 3: Write the implementation**

Create `src/app/screens/insights/insights-data.ts`. The non-custom cases are moved verbatim from `InsightsScreen.tsx:58-87` (do not change their behavior):

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/app/insights-data.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/screens/insights/insights-data.ts __tests__/app/insights-data.test.ts
git commit -m "feat(insights): pure periodWindow module with custom range support

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Bar-chart bucketing (`buildBarBuckets`)

**Files:**
- Modify: `src/app/screens/insights/insights-data.ts` (append)
- Test: `__tests__/app/insights-data.test.ts` (append)

**Interfaces:**
- Consumes: `Period`, `PeriodWindow` from Task 1; `Expense` from `src/types/domain`.
- Produces (Task 3 imports these):
  - `interface Bucket { value: number; label: string; fullLabel: string }` (`value` in rupees)
  - `buildBarBuckets(items: readonly Expense[], period: Period, now: Date, win: { start: number; end: number }): Bucket[]`

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/app/insights-data.test.ts` (add `buildBarBuckets` to the existing import from `insights-data`, and add the `Expense` import):

```ts
import { buildBarBuckets } from '../../src/app/screens/insights/insights-data';
import type { Expense } from '../../src/types/domain';

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
  const win = (p: 'week' | 'month' | 'year' | 'all') => periodWindow(p, NOW);

  it('week = 7 daily buckets ending today', () => {
    const items = [
      exp(new Date(2026, 6, 12, 10, 0).getTime(), 10_000), // 6 days ago → first bucket
      exp(new Date(2026, 6, 18, 9, 0).getTime(), 5_000), // today → last bucket
    ];
    const b = buildBarBuckets(items, 'week', NOW, win('week'));
    expect(b).toHaveLength(7);
    expect(b[0].value).toBe(100);
    expect(b[6].value).toBe(50);
    expect(b[6].fullLabel).toBe('Sat, Jul 18');
  });

  it('excludes non-active expenses', () => {
    const items = [
      exp(new Date(2026, 6, 18, 9, 0).getTime(), 5_000, 'void'),
      exp(new Date(2026, 6, 18, 10, 0).getTime(), 2_000, 'pending_review'),
    ];
    const b = buildBarBuckets(items, 'week', NOW, win('week'));
    expect(b[6].value).toBe(0);
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

  it('year = 12 trailing month buckets', () => {
    const items = [exp(new Date(2026, 6, 10).getTime(), 12_300)];
    const b = buildBarBuckets(items, 'year', NOW, win('year'));
    expect(b).toHaveLength(12);
    expect(b[11].label).toBe('Jul');
    expect(b[11].value).toBe(123);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx jest __tests__/app/insights-data.test.ts`
Expected: FAIL — `buildBarBuckets` is not exported. The 6 Task-1 tests still pass.

- [ ] **Step 3: Write the implementation**

Append to `src/app/screens/insights/insights-data.ts` (and extend the date-fns import at the top to include `addDays`, `addMonths`, `subMonths`, `differenceInCalendarDays`; add the `Expense` type import):

```ts
import type { Expense } from '../../../types/domain';

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/app/insights-data.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/screens/insights/insights-data.ts __tests__/app/insights-data.test.ts
git commit -m "feat(insights): buildBarBuckets with window-aligned custom buckets

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Wire InsightsScreen — Custom pill + two-step range picker

**Files:**
- Modify: `src/app/screens/insights/InsightsScreen.tsx`

**Interfaces:**
- Consumes: `Period`, `CustomRange`, `periodWindow`, `buildBarBuckets`, `Bucket` from `src/app/screens/insights/insights-data` (Tasks 1–2); `DateTimePickerAndroid` from `@react-native-community/datetimepicker` (already installed).
- Produces: UI only; nothing downstream.

- [ ] **Step 1: Replace the extracted logic with imports**

In `src/app/screens/insights/InsightsScreen.tsx`:

1. Delete the date-fns import block (lines 8–17) entirely — every date-fns call in this file lives in `periodWindow` or the `barData` IIFE, both of which move to insights-data, so nothing remains. (If `npx tsc --noEmit` in Step 4 flags a stray use, re-add only that named import.)

2. Add imports:

```tsx
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import {
  periodWindow,
  buildBarBuckets,
  type Period,
  type CustomRange,
  type Bucket,
} from './insights-data';
```

3. Delete the local `type Period = ...` (line 31) and the whole `periodWindow` function (lines 58–87).

4. Replace the entire `barData` IIFE (lines 140–187, including the local `type Bucket` definition) with:

```tsx
const barData: Bucket[] = buildBarBuckets(items, period, now, win);
```

- [ ] **Step 2: Add custom-range state and picker flow**

Inside `InsightsInner`, next to the existing `period` state:

```tsx
const [customRange, setCustomRange] = React.useState<CustomRange | null>(null);

// Two-step native picker: start date, then end date. Cancelling either step
// leaves the currently active period untouched (state only changes on 'set').
const openCustomRangePicker = () => {
  const today = new Date();
  DateTimePickerAndroid.open({
    value: new Date(customRange?.start ?? today.getTime()),
    mode: 'date',
    maximumDate: today,
    onChange: (startEvent, pickedStart) => {
      if (startEvent.type !== 'set' || !pickedStart) return;
      const prevEnd = customRange?.end ?? 0;
      DateTimePickerAndroid.open({
        value: new Date(Math.max(pickedStart.getTime(), prevEnd)),
        mode: 'date',
        minimumDate: pickedStart,
        maximumDate: today,
        onChange: (endEvent, pickedEnd) => {
          if (endEvent.type !== 'set' || !pickedEnd) return;
          setCustomRange({ start: pickedStart.getTime(), end: pickedEnd.getTime() });
          setPeriod('custom');
        },
      });
    },
  });
};
```

Note: no `tapHaptic()` here — `PeriodPill` already fires it in its own onPress wrapper.

Update the window computation to pass the range:

```tsx
const win = periodWindow(period, now, customRange);
```

- [ ] **Step 3: Add the Custom pill**

After the `All` pill (line 227):

```tsx
<PeriodPill
  label="Custom"
  active={period === 'custom'}
  onPress={openCustomRangePicker}
/>
```

(Tapping it while already active re-opens the picker pre-filled with the current range — that falls out of `openCustomRangePicker` reading `customRange`.)

- [ ] **Step 4: Verify compilation and full test suite**

Run: `npx tsc --noEmit && npx eslint src/app/screens/insights/ && npm test`
Expected: tsc exit 0, eslint clean, all suites pass (144 existing + 12 new).

- [ ] **Step 5: Commit**

```bash
git add src/app/screens/insights/InsightsScreen.tsx
git commit -m "feat(insights): Custom period pill with two-step date range picker

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: On-device verification (manual, with the user)**

Build and install per the usual workflow (`reference_device.md` memory), then verify on the phone:
- Custom pill opens start picker (capped at today), then end picker (min = start).
- Picking Jun 1 → Jun 30 shows header `Jun 1 – Jun 30, 2026`, June-only totals, 30 daily bars, June transactions.
- Cancelling either picker step keeps the previous period selection.
- Re-tapping Custom re-opens the picker pre-filled.
- Existing pills (Today/Yesterday/7d/Month/Year/All) behave exactly as before.
