# ML dedup, subcategory autofill, insights last-7-days — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the four improvements specified in `docs/superpowers/specs/2026-05-20-ml-dedup-subcategory-insights-design.md`: widen cross-channel dedup window, learn merchant↔counterpart bridging, auto-fill subcategory from history, change Insights "Week" to rolling last 7 days.

**Architecture:** All changes are local — new SQLite table `merge_patterns` for the learned bridge, a new helper for subcategory frequency lookup, and label/range changes in InsightsScreen. No new ML model, just SQL-backed frequency counting.

**Tech Stack:** TypeScript, React Native, SQLite (op-sqlite/better-sqlite3), Jest, date-fns.

---

## File Structure

- `src/data/migrations/004-merge-patterns.ts` — new migration: create `merge_patterns` table + index
- `src/data/migrations/index.ts` — register migration
- `src/services/parser/rules/normalize.ts` — add `normalizeCounterpart` helper
- `src/services/dedup.ts` — widen fuzzy window to ±10 min via column comparison, add `recordMergePattern` + `patternMatch`
- `src/services/categorizer/subcategory.ts` — NEW: `suggestSubcategory(db, merchantNorm)`
- `src/services/ingestion-pipeline.ts` — call `patternMatch` after `fuzzyMatch` miss, learn on every merge, prefill subcategory on insert
- `src/app/screens/add/ManualEntryScreen.tsx` — prefill subcategory when merchant chosen
- `src/app/screens/insights/InsightsScreen.tsx` — last-7-days semantics + label
- `__tests__/services/dedup.test.ts` — new cases
- `__tests__/services/subcategory.test.ts` — NEW
- `__tests__/services/ingestion-pipeline.test.ts` — integration for pattern learning
- `__tests__/services/parser-normalize.test.ts` — counterpart normalizer cases

---

## Task 1: Migration for `merge_patterns`

**Files:**
- Create: `src/data/migrations/004-merge-patterns.ts`
- Modify: `src/data/migrations/index.ts`

- [ ] **Step 1: Create the migration file**

```ts
// src/data/migrations/004-merge-patterns.ts
export const up_004_merge_patterns = `
CREATE TABLE IF NOT EXISTS merge_patterns (
  merchant_norm TEXT NOT NULL,
  counterpart TEXT NOT NULL,
  counterpart_kind TEXT NOT NULL,
  seen_count INTEGER NOT NULL DEFAULT 0,
  last_seen_at INTEGER NOT NULL,
  median_delay_ms INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (merchant_norm, counterpart)
);
CREATE INDEX IF NOT EXISTS merge_patterns_counterpart ON merge_patterns(counterpart);
`;
```

- [ ] **Step 2: Register migration**

In `src/data/migrations/index.ts` add:
```ts
import { up_004_merge_patterns } from './004-merge-patterns';
// ...
{ version: 4, up: up_004_merge_patterns },
```

- [ ] **Step 3: Run smoke + data tests**

Run: `npx jest __tests__/data __tests__/smoke.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/data/migrations/004-merge-patterns.ts src/data/migrations/index.ts
git commit -m "feat(db): merge_patterns table migration"
```

---

## Task 2: Counterpart normalizer

**Files:**
- Modify: `src/services/parser/rules/normalize.ts`
- Create/Modify: `__tests__/services/parser-normalize.test.ts`

- [ ] **Step 1: Add tests first**

Append to `__tests__/services/parser-normalize.test.ts`:

```ts
import { normalizeCounterpart } from '../../src/services/parser/rules/normalize';

describe('normalizeCounterpart', () => {
  it('strips +91 and non-digits for phone-like inputs', () => {
    expect(normalizeCounterpart('+91 98765 43210')).toEqual({ kind: 'phone', value: '9876543210' });
    expect(normalizeCounterpart('919876543210')).toEqual({ kind: 'phone', value: '9876543210' });
  });

  it('lowercases UPI VPAs', () => {
    expect(normalizeCounterpart('Driver@PAYTM')).toEqual({ kind: 'upi', value: 'driver@paytm' });
  });

  it('falls back to merchant kind for free text', () => {
    expect(normalizeCounterpart('Rapido')).toEqual({ kind: 'merchant', value: 'rapido' });
  });

  it('returns null for empty', () => {
    expect(normalizeCounterpart('')).toBeNull();
    expect(normalizeCounterpart(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx jest __tests__/services/parser-normalize.test.ts`
Expected: FAIL — `normalizeCounterpart is not a function`.

- [ ] **Step 3: Implement**

Append to `src/services/parser/rules/normalize.ts`:

```ts
export type CounterpartKind = 'phone' | 'upi' | 'merchant';
export interface NormalizedCounterpart {
  kind: CounterpartKind;
  value: string;
}

export const normalizeCounterpart = (raw: string | null): NormalizedCounterpart | null => {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  if (s.includes('@')) {
    return { kind: 'upi', value: s.toLowerCase() };
  }
  const digits = s.replace(/\D+/g, '');
  if (digits.length >= 10) {
    return { kind: 'phone', value: digits.slice(-10) };
  }
  return { kind: 'merchant', value: s.toLowerCase() };
};
```

- [ ] **Step 4: Run tests**

Run: `npx jest __tests__/services/parser-normalize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/parser/rules/normalize.ts __tests__/services/parser-normalize.test.ts
git commit -m "feat(parser): normalizeCounterpart helper"
```

---

## Task 3: Widen `fuzzyMatch` time window to ±10 minutes

**Files:**
- Modify: `src/services/dedup.ts`
- Modify: `__tests__/services/dedup.test.ts`

- [ ] **Step 1: Add failing test**

Append to `__tests__/services/dedup.test.ts`:

```ts
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
    // SMS arrives 7 minutes later
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
```

Note: `fuzzyMatch` currently takes no `occurredAt`. The test signals the API change — add it as a required field.

- [ ] **Step 2: Run, expect failure**

Run: `npx jest __tests__/services/dedup.test.ts`
Expected: FAIL (signature mismatch / 11-minute case currently passes incorrectly via DELETE_WINDOW_MS).

- [ ] **Step 3: Update `fuzzyMatch` signature and SQL**

In `src/services/dedup.ts`:

Change the `DedupService.fuzzyMatch` interface signature:
```ts
fuzzyMatch(incoming: {
  amountMinor: number;
  merchantNorm: string;
  sourceRef: string | null;
  occurredAt: number;
}): Expense | undefined;
```

Replace the implementation body:
```ts
const FUZZY_WINDOW_MS = 10 * 60 * 1000;

const fuzzyMatch: DedupService['fuzzyMatch'] = (incoming) => {
  const cutoff = clock.now() - DELETE_WINDOW_MS;
  const bucket = senderBucket(incoming.sourceRef) || incoming.merchantNorm;
  if (!bucket) return undefined;
  const lo = Math.floor(incoming.amountMinor * 0.85);
  const hi = Math.ceil(incoming.amountMinor * 1.15);
  const tLo = incoming.occurredAt - FUZZY_WINDOW_MS;
  const tHi = incoming.occurredAt + FUZZY_WINDOW_MS;
  const rows = db.all<Record<string, unknown>>(
    `SELECT ${COLUMNS} FROM expenses
      WHERE created_at >= ?
        AND status != 'void'
        AND amount_minor BETWEEN ? AND ?
        AND occurred_at BETWEEN ? AND ?
        AND (merchant_norm = ? OR dedup_key LIKE ?)`,
    [cutoff, lo, hi, tLo, tHi, incoming.merchantNorm, `%|${bucket}|%`],
  );
  if (rows.length === 0) return undefined;
  let best: Expense | null = null;
  let bestDelta = Infinity;
  for (const r of rows) {
    const e = rowToExpense(r);
    const d = Math.abs(e.amountMinor - incoming.amountMinor);
    if (d < bestDelta) {
      bestDelta = d;
      best = e;
    }
  }
  return best ?? undefined;
};
```

- [ ] **Step 4: Update the call site**

In `src/services/ingestion-pipeline.ts`, change the `fuzzyMatch` invocation:
```ts
dedup.fuzzyMatch({
  amountMinor: draft.amountMinor,
  merchantNorm: draft.merchantNorm,
  sourceRef: draft.sourceRef,
  occurredAt: draft.occurredAt,
});
```

- [ ] **Step 5: Run dedup + pipeline tests**

Run: `npx jest __tests__/services/dedup.test.ts __tests__/services/ingestion-pipeline.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/dedup.ts src/services/ingestion-pipeline.ts __tests__/services/dedup.test.ts
git commit -m "feat(dedup): widen fuzzy window to 10 minutes via occurred_at"
```

---

## Task 4: `merge_patterns` store + `patternMatch` + learning

**Files:**
- Modify: `src/services/dedup.ts`
- Modify: `__tests__/services/dedup.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `__tests__/services/dedup.test.ts`:

```ts
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
```

- [ ] **Step 2: Run, expect failure**

Run: `npx jest __tests__/services/dedup.test.ts`
Expected: FAIL — methods don't exist.

- [ ] **Step 3: Implement in `src/services/dedup.ts`**

Add imports and helpers near top:

```ts
import type { NormalizedCounterpart } from './parser/rules/normalize';
import { normalizeCounterpart } from './parser/rules/normalize';

const PATTERN_MIN_SEEN = 2;
const PATTERN_BASE_WINDOW_MS = 10 * 60 * 1000;
```

Extend the interface:

```ts
export interface RecordMergePatternInput {
  merchantNorm: string;
  counterpart: NormalizedCounterpart;
  delayMs: number;
}

export interface DedupService {
  findMatch(dedupKey: string): Expense | undefined;
  fuzzyMatch(incoming: {
    amountMinor: number;
    merchantNorm: string;
    sourceRef: string | null;
    occurredAt: number;
  }): Expense | undefined;
  patternMatch(incoming: {
    amountMinor: number;
    merchantNorm: string;
    sourceRef: string | null;
    occurredAt: number;
  }): Expense | undefined;
  recordMergePattern(input: RecordMergePatternInput): void;
  merge(existingId: string, incoming: DedupCandidate): Expense;
}
```

Implement inside `createDedupService`:

```ts
const recordMergePattern: DedupService['recordMergePattern'] = ({ merchantNorm, counterpart, delayMs }) => {
  if (!merchantNorm || !counterpart.value) return;
  const now = clock.now();
  const existing = db.get<Record<string, unknown>>(
    `SELECT seen_count, median_delay_ms FROM merge_patterns WHERE merchant_norm = ? AND counterpart = ?`,
    [merchantNorm, counterpart.value],
  );
  if (existing) {
    const oldCount = existing.seen_count as number;
    const oldDelay = existing.median_delay_ms as number;
    const blended = Math.round(0.7 * oldDelay + 0.3 * delayMs);
    db.run(
      `UPDATE merge_patterns SET seen_count = ?, last_seen_at = ?, median_delay_ms = ? WHERE merchant_norm = ? AND counterpart = ?`,
      [oldCount + 1, now, blended, merchantNorm, counterpart.value],
    );
  } else {
    db.run(
      `INSERT INTO merge_patterns (merchant_norm, counterpart, counterpart_kind, seen_count, last_seen_at, median_delay_ms) VALUES (?, ?, ?, 1, ?, ?)`,
      [merchantNorm, counterpart.value, counterpart.kind, now, delayMs],
    );
  }
};

const patternMatch: DedupService['patternMatch'] = (incoming) => {
  const incomingCp = normalizeCounterpart(incoming.merchantNorm);
  if (!incomingCp && !incoming.merchantNorm) return undefined;
  // Find any pattern row where either side matches the incoming.
  const patternRows = db.all<Record<string, unknown>>(
    `SELECT merchant_norm, counterpart, seen_count, median_delay_ms FROM merge_patterns
      WHERE seen_count >= ? AND (merchant_norm = ? OR counterpart = ?)`,
    [PATTERN_MIN_SEEN, incoming.merchantNorm, incomingCp?.value ?? ''],
  );
  if (patternRows.length === 0) return undefined;

  const cutoff = clock.now() - DELETE_WINDOW_MS;
  const lo = Math.floor(incoming.amountMinor * 0.85);
  const hi = Math.ceil(incoming.amountMinor * 1.15);

  let best: Expense | null = null;
  let bestDelta = Infinity;

  for (const p of patternRows) {
    const partnerMerchant =
      (p.merchant_norm as string) === incoming.merchantNorm
        ? (p.counterpart as string)
        : (p.merchant_norm as string);
    const window = Math.max(PATTERN_BASE_WINDOW_MS, 2 * (p.median_delay_ms as number));
    const tLo = incoming.occurredAt - window;
    const tHi = incoming.occurredAt + window;
    const rows = db.all<Record<string, unknown>>(
      `SELECT ${COLUMNS} FROM expenses
        WHERE created_at >= ?
          AND status != 'void'
          AND amount_minor BETWEEN ? AND ?
          AND occurred_at BETWEEN ? AND ?
          AND merchant_norm = ?`,
      [cutoff, lo, hi, tLo, tHi, partnerMerchant],
    );
    for (const r of rows) {
      const e = rowToExpense(r);
      const d = Math.abs(e.amountMinor - incoming.amountMinor);
      if (d < bestDelta) {
        bestDelta = d;
        best = e;
      }
    }
  }

  return best ?? undefined;
};
```

Add `patternMatch` and `recordMergePattern` to the returned object:
```ts
return { findMatch, fuzzyMatch, patternMatch, recordMergePattern, merge };
```

- [ ] **Step 4: Run tests**

Run: `npx jest __tests__/services/dedup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/dedup.ts __tests__/services/dedup.test.ts
git commit -m "feat(dedup): merge_patterns store and patternMatch"
```

---

## Task 5: Subcategory autofill helper

**Files:**
- Create: `src/services/categorizer/subcategory.ts`
- Create: `__tests__/services/subcategory.test.ts`

- [ ] **Step 1: Add tests**

```ts
// __tests__/services/subcategory.test.ts
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

  it('returns null when no history', () => {
    const { db } = setup();
    expect(suggestSubcategory(db, 'zomato')).toBeNull();
  });

  it('requires at least 2 prior matches', () => {
    const { db, expense, clock } = setup();
    expense.insert({
      amountMinor: 200, occurredAt: clock.now(), merchantRaw: 'Z', merchantNorm: 'zomato',
      categoryId: null, source: 'manual', subcategory: 'lunch',
    });
    expect(suggestSubcategory(db, 'zomato')).toBeNull();
  });

  it('returns most-frequent subcategory for the merchant', () => {
    const { db, expense, clock } = setup();
    for (let i = 0; i < 3; i++) {
      expense.insert({
        amountMinor: 200, occurredAt: clock.now() - i * 1000,
        merchantRaw: 'Z', merchantNorm: 'zomato',
        categoryId: null, source: 'manual', subcategory: 'lunch',
      });
    }
    expense.insert({
      amountMinor: 800, occurredAt: clock.now(),
      merchantRaw: 'Z', merchantNorm: 'zomato',
      categoryId: null, source: 'manual', subcategory: 'dinner',
    });
    expect(suggestSubcategory(db, 'zomato')).toBe('lunch');
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx jest __tests__/services/subcategory.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// src/services/categorizer/subcategory.ts
import type { Database } from '../../data/database';

const MIN_COUNT = 2;

export const suggestSubcategory = (db: Database, merchantNorm: string | null): string | null => {
  if (!merchantNorm) return null;
  const row = db.get<{ subcategory: string; c: number }>(
    `SELECT subcategory, COUNT(*) AS c
       FROM expenses
      WHERE merchant_norm = ?
        AND subcategory IS NOT NULL
        AND status != 'void'
      GROUP BY subcategory
      ORDER BY c DESC, MAX(occurred_at) DESC
      LIMIT 1`,
    [merchantNorm],
  );
  if (!row || row.c < MIN_COUNT) return null;
  return row.subcategory;
};
```

- [ ] **Step 4: Run tests**

Run: `npx jest __tests__/services/subcategory.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/categorizer/subcategory.ts __tests__/services/subcategory.test.ts
git commit -m "feat(categorizer): suggestSubcategory from history"
```

---

## Task 6: Wire pipeline — pattern apply, learning, subcategory prefill

**Files:**
- Modify: `src/services/ingestion-pipeline.ts`
- Modify: `__tests__/services/ingestion-pipeline.test.ts`

- [ ] **Step 1: Add integration test**

Append to `__tests__/services/ingestion-pipeline.test.ts`:

```ts
  it('learns merchant↔phone pattern and auto-merges on 3rd occurrence', () => {
    const { pipeline, db, clock } = setup();
    // Helper: feed a rapido notification and a UPI sms for ~the same amount, 5 min apart.
    const feedPair = (baseTs: number) => {
      pipeline.process({
        source: 'notification',
        sourceRef: 'com.rapido.passenger',
        body: 'Trip with Rapido completed Rs.120',
        ts: baseTs,
      });
      pipeline.process({
        source: 'sms',
        sourceRef: 'VK-HDFCBK-T',
        body: 'Rs.120 debited from A/c **1234 to 9876543210 UPI Ref 1',
        ts: baseTs + 5 * 60 * 1000,
      });
    };

    // First two pairs: user manually merges (simulated via direct recordMergePattern).
    // The pipeline-level confirmation of fuzzyMatch-misses going through manual merge
    // is covered separately; here we focus on the apply path.
    const dedup = require('../../src/services/dedup').createDedupService({ db, clock });
    dedup.recordMergePattern({ merchantNorm: 'rapido', counterpart: { kind: 'phone', value: '9876543210' }, delayMs: 5 * 60 * 1000 });
    dedup.recordMergePattern({ merchantNorm: 'rapido', counterpart: { kind: 'phone', value: '9876543210' }, delayMs: 5 * 60 * 1000 });

    const beforeCount = db.all<{ id: string }>(`SELECT id FROM expenses`).length;
    feedPair(1_700_000_500_000);
    const afterCount = db.all<{ id: string }>(`SELECT id FROM expenses`).length;
    expect(afterCount - beforeCount).toBe(1);
  });
```

(If the existing test file's `setup()` lacks `db`/`clock` exposed, adjust accordingly — read the file first.)

- [ ] **Step 2: Implement the wiring in `src/services/ingestion-pipeline.ts`**

Replace the pipeline body to:

```ts
import { suggestSubcategory } from './categorizer/subcategory';
import { normalizeCounterpart } from './parser/rules/normalize';

// ... inside process(), after the existing fuzzyMatch:
const fuzzy = dedup.fuzzyMatch({
  amountMinor: draft.amountMinor,
  merchantNorm: draft.merchantNorm,
  sourceRef: draft.sourceRef,
  occurredAt: draft.occurredAt,
});

const existing = dedup.findMatch(dedupKey) ?? fuzzy ?? dedup.patternMatch({
  amountMinor: draft.amountMinor,
  merchantNorm: draft.merchantNorm,
  sourceRef: draft.sourceRef,
  occurredAt: draft.occurredAt,
});

if (existing) {
  const merged = dedup.merge(existing.id, draft);
  // Learn from any successful merge — store both directions of the pair.
  const cpA = normalizeCounterpart(draft.merchantNorm);
  const cpB = normalizeCounterpart(existing.merchantNorm);
  const delay = Math.abs((existing.occurredAt ?? 0) - draft.occurredAt);
  if (cpA && existing.merchantNorm) {
    dedup.recordMergePattern({ merchantNorm: existing.merchantNorm, counterpart: cpA, delayMs: delay });
  }
  if (cpB && draft.merchantNorm) {
    dedup.recordMergePattern({ merchantNorm: draft.merchantNorm, counterpart: cpB, delayMs: delay });
  }
  log.record(bh, event.source, event.sourceRef, 'merged', merged.id);
  return { outcome: 'merged', expenseId: merged.id };
}

const cat = categorizer.categorize(draft.merchantNorm);
const subcategory = suggestSubcategory(db, draft.merchantNorm);
const status = draft.confidence >= AUTO_CONFIRM_CONFIDENCE ? 'active' : 'pending_review';
const inserted = expense.insert({
  amountMinor: draft.amountMinor,
  occurredAt: draft.occurredAt,
  merchantRaw: draft.merchantRaw,
  merchantNorm: draft.merchantNorm,
  categoryId: cat.categoryId,
  source: event.source,
  sourceRef: draft.sourceRef,
  sourceMsg: draft.sourceMsg,
  confidence: draft.confidence,
  status,
  dedupKey,
  verifiedBy: 1,
  subcategory,
});
log.record(bh, event.source, event.sourceRef, 'inserted', inserted.id);
return { outcome: 'inserted', expenseId: inserted.id };
```

- [ ] **Step 3: Run full pipeline + dedup tests**

Run: `npx jest __tests__/services/ingestion-pipeline.test.ts __tests__/services/dedup.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/services/ingestion-pipeline.ts __tests__/services/ingestion-pipeline.test.ts
git commit -m "feat(pipeline): apply patternMatch, learn merges, prefill subcategory"
```

---

## Task 7: Manual entry subcategory prefill

**Files:**
- Modify: `src/app/screens/add/ManualEntryScreen.tsx`

- [ ] **Step 1: Read the screen**

Read the file to locate where merchant is committed/selected and where the subcategory field state lives.

- [ ] **Step 2: Wire suggestSubcategory**

Import:
```ts
import { suggestSubcategory } from '../../../services/categorizer/subcategory';
```

When the user finishes editing the merchant field (or selects a known one), call:
```ts
const suggestion = suggestSubcategory(db, normalizeMerchant(merchantInput));
if (suggestion && !subcategory) setSubcategory(suggestion);
```

The `db` instance is available from the same context that already supplies it elsewhere in the screen — follow the existing pattern.

- [ ] **Step 3: Manual UI sanity (TODO(device))**

Mark this as `TODO(device)` — verify on phone after the full build that opening manual entry and typing a known merchant prefills subcategory.

- [ ] **Step 4: Commit**

```bash
git add src/app/screens/add/ManualEntryScreen.tsx
git commit -m "feat(add): prefill subcategory from past expenses"
```

---

## Task 8: Insights "Last 7 days"

**Files:**
- Modify: `src/app/screens/insights/InsightsScreen.tsx`

- [ ] **Step 1: Update imports**

Ensure `subDays` and `startOfDay` are imported from `date-fns` (alongside the existing `startOfWeek`, `endOfDay`).

- [ ] **Step 2: Replace the `case 'week'` block**

```ts
case 'week': {
  const start = startOfDay(subDays(now, 6)).getTime();
  return { start, end: endOfDay(now).getTime(), label: 'Last 7 days' };
}
```

- [ ] **Step 3: Update pill text**

Change the `PeriodPill` label from `"Week"` to `"7d"` (and `active`/`onPress` unchanged).

- [ ] **Step 4: Drop unused import**

Remove `startOfWeek` from the date-fns import if no longer referenced. Run TypeScript check.

- [ ] **Step 5: Run insights-related tests**

Run: `npx jest -t Insights` (if any). Otherwise run smoke + type check:
```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/screens/insights/InsightsScreen.tsx
git commit -m "feat(insights): Week pill becomes rolling Last 7 days"
```

---

## Task 9: Final sweep

- [ ] **Step 1: Full test run**

```bash
npx jest
```
Expected: all PASS.

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 3: Lint**

```bash
npm run lint --silent || true
```
Note any issues only in changed files.

- [ ] **Step 4: Record `TODO(device)` items in memory**

Items needing physical-phone validation:
- Manual-entry subcategory prefill.
- Real cross-channel Rapido ingestion learning over 3 trips.
- Insights "Last 7 days" pill renders correctly.

- [ ] **Step 5: No commit (sweep is verification only)**
