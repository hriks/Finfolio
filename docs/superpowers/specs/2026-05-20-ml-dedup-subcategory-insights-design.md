# ML dedup, subcategory autofill, insights "last 7 days" — Design

Date: 2026-05-20
Branch: feature/foundation

## Problem

Four user-reported issues with the expense manager:

1. **Dedup misses cross-channel duplicates with delay.** The dedup `fuzzyMatch`
   uses a `dedup_key LIKE` filter whose minute-bucket bakes in a ~2-minute
   window. When the bank SMS arrives several minutes after the merchant
   notification, the two are not recognised as the same expense.
2. **Different-merchant cross-channel duplicates are never merged.** A Rapido
   push notification (`merchant_norm = "rapido"`) and a UPI bank SMS for the
   driver's phone number (`merchant_norm = "<phone>"` or a UPI handle) share
   neither `merchant_norm` nor `senderBucket`. The fuzzy match cannot bridge
   them, so two expenses are created for one trip.
3. **Subcategory is not learned.** Each new expense lands without a
   subcategory even when the user has assigned one to the same merchant many
   times before.
4. **The "Week" filter in Insights snaps to the calendar week.** The user
   wants a rolling **last 7 days** window instead.

## Goals

- Catch cross-channel duplicates with up to ~10 minutes of delay between
  channels for the same merchant.
- Learn merchant ↔ counterpart pairings (Rapido ↔ driver phone, Zomato ↔
  Zomato UPI handle, etc.) from the user's own confirms, and auto-merge after
  the pattern has been observed twice.
- Pre-fill subcategory on new expenses (ingested or manually added) from the
  user's most common past choice for that merchant.
- Change the Insights "Week" pill to mean the rolling last 7 days.

## Non-goals

- No new ML model. All learning is SQL-table-backed frequency counting.
- No retroactive merge of historical expenses. Pattern store only affects
  future ingests.
- No cross-device sync of the pattern store beyond what Drive backup already
  covers (the new table is included in the backup payload, that is all).

## Design

### 1. Widen `fuzzyMatch` time window (issue 1)

In `src/services/dedup.ts`:

- Replace the `dedup_key LIKE '%|<bucket>|%'` clause with an `occurred_at`
  range comparison so the time window is decoupled from the minute bucket.
- Window: `±10 minutes` around `incoming.occurredAt`.
- Keep the existing ±15% amount tolerance and the
  `(merchant_norm = ? OR sender_bucket = ?)` disjunction.
- `DELETE_WINDOW_MS` still bounds how far back we look as a safety net.

This fixes the "same merchant, SMS lags notification" case without any
learning.

### 2. Learned merchant ↔ counterpart bridging (issue 2)

New table `merge_patterns`:

```
merchant_norm     TEXT NOT NULL    -- e.g. "rapido"
counterpart       TEXT NOT NULL    -- normalized phone / UPI handle / merchant_norm
counterpart_kind  TEXT NOT NULL    -- 'phone' | 'upi' | 'merchant'
seen_count        INTEGER NOT NULL DEFAULT 0
last_seen_at      INTEGER NOT NULL
median_delay_ms   INTEGER NOT NULL DEFAULT 0  -- running average of |t_a - t_b|
PRIMARY KEY (merchant_norm, counterpart)
```

Index: `CREATE INDEX merge_patterns_counterpart ON merge_patterns(counterpart)`.

**Counterpart normalization** (new helper in `services/parser/rules`):

- Phone numbers → last 10 digits.
- UPI VPAs → lower-cased, trimmed.
- Anything else → the merchant_norm itself.

**Learning signals** (write path in `dedup.ts` / ingestion pipeline):

- When `ingestion-pipeline.process` produces `outcome = 'merged'` via the
  existing `fuzzyMatch`, call `recordMergePattern(existing, incoming)`.
  - The two sides supply (`merchant_norm`, `counterpart`) — whichever side
    has the cleaner merchant becomes `merchant_norm`, the other side becomes
    `counterpart`.
  - Increment `seen_count`, set `last_seen_at = now`, update
    `median_delay_ms` with an EMA (`new = 0.7 * old + 0.3 * delay`).
- When the user explicitly merges two expenses from the detail / review
  screen (a new action — see UI changes), the same recorder is called.
- When the user **deletes** an expense within `DELETE_WINDOW_MS` while a
  recent partner row exists (close-time + close-amount), treat as an
  implicit merge confirmation and record the pattern.

**Apply signal** (read path):

- Add `dedup.patternMatch(incoming)` invoked after `findMatch` and
  `fuzzyMatch` both miss.
- Query: any row in `merge_patterns` where either side matches the incoming
  draft's merchant_norm or normalized counterpart, and `seen_count >= 2`.
- For each matching pattern, look for a candidate expense within the last
  `max(10 minutes, 2 × median_delay_ms)`, status != 'void', amount within
  ±15%. Pick the closest by amount.
- If found, merge silently (no banner). The existing `dedup.merge`
  already records `source = 'merged'` and bumps `verified_by`, so the
  detail screen will show "merged from N sources" naturally.

If `seen_count < 2` no auto-merge occurs. The unmerged second row still
lands in the existing review flow; no extra hint UI in this iteration
(YAGNI — once auto-merge kicks in, the user shouldn't see it).

### 3. Subcategory autofill (issue 3)

New file `src/services/categorizer/subcategory.ts`:

```ts
export const suggestSubcategory = (
  db: Database,
  merchantNorm: string,
): string | null
```

Query:

```sql
SELECT subcategory, COUNT(*) AS c
FROM expenses
WHERE merchant_norm = ?
  AND subcategory IS NOT NULL
  AND status != 'void'
GROUP BY subcategory
ORDER BY c DESC, MAX(occurred_at) DESC
LIMIT 1
```

Require `c >= 2` to avoid one-off noise. Tie-break by most recent.

Wiring:

- `ingestion-pipeline.process`: after `categorizer.categorize`, call
  `suggestSubcategory(db, draft.merchantNorm)` and pass the result into
  `expense.insert` as `subcategory`.
- Manual add screen (`src/app/screens/add/*`): when the user selects /
  types a merchant, call the same helper and pre-fill the subcategory
  field. The user can override before save.

### 4. Insights "Last 7 days" (issue 4)

In `src/app/screens/insights/InsightsScreen.tsx`:

- Replace the `case 'week'` block:
  - `start = startOfDay(subDays(now, 6)).getTime()`
  - `end   = endOfDay(now).getTime()`
  - `label = 'Last 7 days'`
- Update the pill text from `"Week"` to `"7d"`.
- The existing day-bucketing logic for `period === 'week'` already produces
  7 buckets and remains correct.

## Files touched

| File | Change |
| --- | --- |
| `src/data/migrations/<next>.ts` | new migration: `merge_patterns` table + index |
| `src/services/dedup.ts` | widen fuzzyMatch window; add `patternMatch`; expose `recordMergePattern` |
| `src/services/parser/rules/normalize.ts` (or sibling) | add counterpart normalizer for phone / UPI |
| `src/services/ingestion-pipeline.ts` | call `patternMatch` after fuzzyMatch miss; learn on merge |
| `src/services/categorizer/subcategory.ts` | new — `suggestSubcategory` |
| `src/services/expense-service.ts` | optional helper for "delete-as-implicit-merge" hook |
| `src/app/screens/add/*` | prefill subcategory on merchant selection |
| `src/app/screens/review/*` and/or `detail/ExpenseDetailScreen.tsx` | manual "merge with…" action that calls `recordMergePattern` + `dedup.merge` |
| `src/app/screens/insights/InsightsScreen.tsx` | "Last 7 days" semantics + label |
| `src/services/backup/*` | include `merge_patterns` in the Drive backup payload |

## Data flow

```
SMS / Notification
   │
   ▼
parseSms / parseNotification ──► ParserDraft
   │
   ▼
computeDedupKey ──► findMatch ──hit──► dedup.merge ──► learn pattern
   │                  │
   │                  miss
   ▼
fuzzyMatch (±10 min, ±15% amount) ──hit──► dedup.merge ──► learn pattern
   │
   miss
   ▼
patternMatch (merge_patterns, seen_count ≥ 2) ──hit──► dedup.merge (silent)
   │
   miss
   ▼
suggestSubcategory ──► insert as new expense
```

## Testing

Unit tests:

- `dedup.fuzzyMatch`: SMS arriving 7 minutes after a notification for the
  same merchant matches; arriving 11 minutes after does not.
- `dedup.patternMatch`: seeded `merge_patterns` row with `seen_count = 2`
  produces an auto-merge across different `merchant_norm` values within the
  learned delay window. With `seen_count = 1`, no merge.
- `recordMergePattern`: increments count, updates `last_seen_at`, EMA-blends
  delay.
- `suggestSubcategory`: returns the most-frequent subcategory; requires
  `c >= 2`; tie-break by recency.
- Insights window: `period = 'week'` starts at `startOfDay(now - 6 days)`
  and ends at `endOfDay(now)`.

Integration test:

- Process `(notification, "rapido", ₹120)` then
  `(sms, "UPI to 9876543210", ₹120, t + 6 min)` — both land as separate
  expenses (no pattern yet). User manually merges → pattern recorded.
- Repeat the pair → still separate (`seen_count = 1`). User merges again →
  `seen_count = 2`.
- Third pair → auto-merged on ingest, single expense with
  `source = 'merged'`.

## Open questions

None outstanding — all four user questions on aggressiveness, autofill
behavior, and merge review were resolved during brainstorming.

## Out of scope

- Probabilistic / model-based merge scoring.
- Suggest-but-don't-auto-merge banner UI (rejected in favor of the silent
  auto-merge once `seen_count >= 2`).
- Amount-band-conditioned subcategory suggestion (kept simple: most-frequent
  per merchant).
