# Insights: Pill Rework (remove 7d + Year, add Last Month) — Design

**Date:** 2026-07-18
**Status:** Approved
**Follows:** 2026-07-18-insights-custom-range-design.md

## Change

The Insights period pills become: **Today · Yesterday · Month · Last Month · All · Custom**.

- **Removed:** `7d` and `Year` pills, and their `'week'` / `'year'` period variants removed
  from the code entirely (type, `periodWindow` cases, `buildBarBuckets` branches, tests) —
  no dead code paths. A rolling 7 days or a year remain reachable via Custom.
- **Added:** `Last Month` pill (period `'lastMonth'`), placed after `Month`.

## Last Month semantics

- Window: `startOfMonth(subMonths(now, 1))` → `endOfMonth(subMonths(now, 1))`.
- Header label: `format(lastMonth, 'MMMM yyyy')` (e.g. `June 2026`) — same style as Month.
- Bar chart: one daily bucket per day of that month, aligned to the window (like a custom
  range, not trailing-from-today). Implementation: `'lastMonth'` shares the custom period's
  ≤31-day daily-bucket path in `buildBarBuckets`.
- Pie chart and transaction list derive from the window — no changes needed.

## Behavior kept

- `'all'` (and `'today'`/`'yesterday'`) still render the trailing-12-months bar chart —
  that branch stays for them even though `'year'` is gone.
- `'month'` keeps its trailing-30-days bar quirk, untouched.
- Default selected period stays `'month'`.

## Testing

Update `__tests__/app/insights-data.test.ts`:
- Delete week/year window and bucket tests; re-target tests that used `'week'`
  incidentally (7-daily-buckets, active-only filtering) onto remaining periods.
- Add: `lastMonth` window boundaries + label; `lastMonth` daily buckets have exactly the
  number of days of the previous month and align to it (including a Feb/short-month or
  month-length assertion), out-of-month expenses excluded.

Pill row change verified on-device.
