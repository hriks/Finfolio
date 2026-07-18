# Insights: Custom Date Range — Design

**Date:** 2026-07-18
**Status:** Approved

## Problem

The Insights tab's period pills (Today / Yesterday / 7d / Month / Year / All) offer no way
to view a past period — "Month" is always the current calendar month, so last month
(June 2026) is unreachable.

## Solution

Add a **"Custom" pill** at the end of the period row that lets the user pick an arbitrary
start/end date range via the native Android date picker. This covers "last month" and any
other past window with one mechanism.

## UI behavior

- New pill labeled **Custom**, last in the horizontal pill row.
- Tapping it opens `DateTimePickerAndroid` twice, mirroring the two-step pattern in
  `ManualEntryScreen`:
  1. **Start date** — `maximumDate: today`.
  2. **End date** — `minimumDate: start`, `maximumDate: today`.
- Cancelling either step leaves the previously active period unchanged.
- On completion, period becomes `custom`, the pill renders active, and the hero header
  shows the range label:
  - Same year: `Jun 1 – Jun 30, 2026`
  - Crossing years: `Dec 15, 2025 – Jan 10, 2026`
- Tapping the Custom pill while already active re-opens the picker (pre-filled with the
  current range) to adjust it.

## Data flow

- `Period` type gains `'custom'`; the chosen `{start, end}` (ms timestamps) lives in
  component state.
- `periodWindow` clamps the custom window to `startOfDay(start)`–`endOfDay(end)`.
- Pie chart and transaction list already derive from the window — no changes.
- **Bar chart** gets a custom branch that buckets over the *chosen window* (not relative
  to today):
  - Range ≤ 31 days → one bucket per day.
  - Range > 31 days → one bucket per calendar month touched by the range.

## Structure

Extract the pure date math out of `InsightsScreen.tsx` into
`src/app/screens/insights/insights-data.ts`:

- `periodWindow(period, now, customRange?)` → `{ start, end, label }`
- `buildBarBuckets(items, period, now, window)` → `Bucket[]`

The component keeps only rendering, state, and picker wiring.

## Testing

New unit tests in `__tests__/app/insights-data.test.ts` (pure functions, no RN imports):

- Window boundaries for every period, including custom (start-of-day / end-of-day
  clamping).
- Custom range labels, same-year and cross-year.
- Bucket granularity selection: 31-day range → daily; 32-day range → monthly.
- Bucket sums include only `active` expenses inside each bucket; custom buckets align to
  the chosen window rather than today.

Component behavior (picker flow, pill state) is verified manually on-device per the usual
workflow.

## Out of scope

- Month/year dropdown pickers on the existing Month/Year pills.
- Persisting the chosen range across app restarts.
- Fixing the existing quirk where the "Month" bar chart shows the trailing 30 days rather
  than the calendar month.
