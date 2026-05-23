# Expense Manager — Plan 2: Ingestion (SMS)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Build the SMS ingestion pipeline end-to-end — parser, dedup, rule-based categorizer (no ML yet), pipeline orchestrator, and the Android-native bits (BroadcastReceiver, NotificationListenerService scaffolding deferred to Plan 4, WorkManager inbox scan, BootReceiver, Headless JS bridge).

**Architecture:** Native receivers/workers serialize raw events to JS via Headless JS. A single JS pipeline (`IngestionPipeline.process`) handles dedup-log lookup → parse → dedup-match → categorize → status decision → expense insert → budget alert check. Everything in JS is unit-tested against `better-sqlite3`.

**Tech Stack:** Plan 1 stack + Android Kotlin (`BroadcastReceiver`, `androidx.work.CoroutineWorker`), RN `HeadlessJsTaskService`.

---

## File structure produced by this plan

```
src/
├── services/
│   ├── parser/
│   │   ├── index.ts                   (Parser interface + dispatcher)
│   │   ├── sms.ts                     (SMS parser: TRAI + rules + heuristic)
│   │   └── rules/
│   │       ├── sms-rules.ts           (curated bank/wallet rules)
│   │       └── normalize.ts           (sender stem, merchant norm)
│   ├── dedup.ts                       (DedupService)
│   ├── categorizer/
│   │   ├── index.ts                   (Categorizer interface)
│   │   └── rules.ts                   (Stage 1+2: user/bundled rules — ML in Plan 3)
│   └── ingestion-pipeline.ts          (orchestrator)
└── ingestion-task.ts                  (Headless JS entry, registers AppRegistry task)

android/app/src/main/
├── AndroidManifest.xml                (modified: perms + receivers)
└── java/com/expensemanager/
    ├── MainApplication.kt             (modified: register HeadlessJsTaskService)
    ├── BootReceiver.kt
    └── ingestion/
        ├── IngestionPayload.kt        (data class)
        ├── SmsReceiver.kt
        ├── InboxScanWorker.kt
        └── HeadlessIngestionTaskService.kt

__tests__/
├── helpers/
│   └── ingestion-fixtures.ts          (raw SMS event fixtures)
└── services/
    ├── parser-sms.test.ts
    ├── dedup.test.ts
    ├── categorizer-rules.test.ts
    └── ingestion-pipeline.test.ts
```

---

## Task 1 — Normalizer helpers

**Files:**
- Create: `src/services/parser/rules/normalize.ts`
- Test: `__tests__/services/parser-normalize.test.ts`

- [ ] **Step 1: Failing test**

Create `__tests__/services/parser-normalize.test.ts`:
```typescript
import { extractTraiSuffix, senderStem, normalizeMerchant, senderBucket } from '../../src/services/parser/rules/normalize';

describe('normalize', () => {
  it('extracts TRAI suffix', () => {
    expect(extractTraiSuffix('VK-HDFCBK-T')).toBe('T');
    expect(extractTraiSuffix('JD-AXISBK-S')).toBe('S');
    expect(extractTraiSuffix('AX-PROMO-P')).toBe('P');
    expect(extractTraiSuffix('GOV-EPFO-G')).toBe('G');
    expect(extractTraiSuffix('VK-HDFCBK')).toBeNull();
    expect(extractTraiSuffix('+919876543210')).toBeNull();
  });

  it('extracts sender stem', () => {
    expect(senderStem('VK-HDFCBK-T')).toBe('HDFCBK');
    expect(senderStem('JD-AXISBK-S')).toBe('AXISBK');
    expect(senderStem('AD-PAYTM-T')).toBe('PAYTM');
    expect(senderStem('HDFCBK')).toBe('HDFCBK');
  });

  it('normalizes merchants', () => {
    expect(normalizeMerchant('SWIGGY BANGALORE')).toBe('swiggy bangalore');
    expect(normalizeMerchant('  Amazon.in*XYZ  ')).toBe('amazon');
    expect(normalizeMerchant('UBER*TRIP12345')).toBe('uber');
    expect(normalizeMerchant('RAPIDO IND')).toBe('rapido');
    expect(normalizeMerchant(null)).toBe('');
  });

  it('buckets senders to coarse families', () => {
    expect(senderBucket('VK-HDFCBK-T')).toBe('hdfc');
    expect(senderBucket('JD-HDFCB-T')).toBe('hdfc');
    expect(senderBucket('AD-PAYTM-T')).toBe('paytm');
    expect(senderBucket('com.ubercab')).toBe('uber');
    expect(senderBucket(null)).toBe('');
  });
});
```

Expect FAIL (module missing).

- [ ] **Step 2: Implementation**

Create `src/services/parser/rules/normalize.ts`:
```typescript
export const extractTraiSuffix = (sender: string | null): 'T' | 'S' | 'P' | 'G' | null => {
  if (!sender) return null;
  const m = sender.match(/-([TSPG])$/i);
  return (m ? m[1].toUpperCase() : null) as 'T' | 'S' | 'P' | 'G' | null;
};

export const senderStem = (sender: string | null): string => {
  if (!sender) return '';
  const stripped = sender.replace(/-([TSPG])$/i, '');
  const parts = stripped.split('-');
  return parts[parts.length - 1].toUpperCase();
};

const BANK_FAMILIES: Record<string, string> = {
  HDFCBK: 'hdfc', HDFCB: 'hdfc', HDFC: 'hdfc',
  ICICIB: 'icici', ICICI: 'icici',
  AXISBK: 'axis', AXIS: 'axis',
  SBIINB: 'sbi', SBI: 'sbi', SBIPSG: 'sbi',
  KOTAKB: 'kotak', KOTAK: 'kotak',
  YESBNK: 'yes', YES: 'yes',
  PAYTM: 'paytm', PYTM: 'paytm',
  PHONEPE: 'phonepe', PHPE: 'phonepe',
  GPAY: 'gpay', GOOGLEPAY: 'gpay',
  AMAZONPAY: 'amazonpay', AMZNPAY: 'amazonpay',
};

const PACKAGE_FAMILIES: Record<string, string> = {
  'com.ubercab': 'uber',
  'com.rapido.passenger': 'rapido',
  'com.olacabs.customer': 'ola',
  'in.swiggy.android': 'swiggy',
  'com.application.zomato': 'zomato',
};

export const senderBucket = (sender: string | null): string => {
  if (!sender) return '';
  if (sender.includes('.')) {
    return PACKAGE_FAMILIES[sender] ?? sender.toLowerCase();
  }
  const stem = senderStem(sender);
  return BANK_FAMILIES[stem] ?? stem.toLowerCase();
};

const NOISE = /\b(in|ind|india|pvt|ltd|llp|the|payments?|services?|transactions?)\b/gi;
const PREFIX_NOISE = /^(amazon\.in|amzn|amz)\b.*$/i;
const STAR_PAYLOAD = /\*[A-Z0-9_]+/g;

export const normalizeMerchant = (raw: string | null): string => {
  if (!raw) return '';
  let s = raw.toLowerCase().trim();
  if (PREFIX_NOISE.test(s)) {
    return s.replace(PREFIX_NOISE, 'amazon');
  }
  s = s.replace(STAR_PAYLOAD, '');
  s = s.replace(NOISE, '');
  s = s.replace(/[^a-z0-9 ]+/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
};
```

- [ ] **Step 3: Tests pass** — `npm test -- --runTestsByPath __tests__/services/parser-normalize.test.ts`. Expect 4 passing.

- [ ] **Step 4: Commit** — `feat(parser): normalizer helpers`.

---

## Task 2 — Curated SMS rules

**Files:**
- Create: `src/services/parser/rules/sms-rules.ts`
- Test: `__tests__/services/parser-sms-rules.test.ts`

- [ ] **Step 1: Failing test**

Create `__tests__/services/parser-sms-rules.test.ts`:
```typescript
import { matchSmsRule } from '../../src/services/parser/rules/sms-rules';

describe('matchSmsRule', () => {
  it('parses HDFC debit', () => {
    const body = 'Rs.250.00 debited from a/c **1234 on 14-05-26 to SWIGGY. Avl Bal: Rs.10,000. Not you? Call 18002586161';
    const r = matchSmsRule('HDFCBK', body);
    expect(r).toEqual({
      amountMinor: 25000,
      merchantRaw: 'SWIGGY',
      kind: 'debit',
    });
  });

  it('parses ICICI debit with INR prefix', () => {
    const body = 'INR 99.00 spent on ICICI Bank Card xx1234 at AMAZON on 15-MAY-26. Bal: INR 5,432.10';
    const r = matchSmsRule('ICICIB', body);
    expect(r?.amountMinor).toBe(9900);
    expect(r?.merchantRaw).toBe('AMAZON');
  });

  it('parses Paytm wallet debit', () => {
    const body = 'Paid Rs.150 to UBER from Paytm Wallet. Txn ID: 12345';
    const r = matchSmsRule('PAYTM', body);
    expect(r?.amountMinor).toBe(15000);
    expect(r?.merchantRaw).toBe('UBER');
  });

  it('ignores credits/refunds (returns null)', () => {
    const body = 'Rs.500 credited to a/c **1234 from REFUND SWIGGY';
    expect(matchSmsRule('HDFCBK', body)).toBeNull();
  });

  it('returns null for unknown stems', () => {
    expect(matchSmsRule('UNKNOWN', 'Rs.100 to X')).toBeNull();
  });
});
```

Expect FAIL.

- [ ] **Step 2: Implementation**

Create `src/services/parser/rules/sms-rules.ts`:
```typescript
export interface SmsParsed {
  amountMinor: number;
  merchantRaw: string;
  kind: 'debit' | 'credit';
}

type Rule = (body: string) => SmsParsed | null;

const parseAmount = (s: string): number => {
  const n = parseFloat(s.replace(/,/g, ''));
  return Math.round(n * 100);
};

const CREDIT_HINTS = /\b(credited|refund(ed)?|deposited|received from)\b/i;

const debit = (re: RegExp): Rule => (body) => {
  if (CREDIT_HINTS.test(body)) return null;
  const m = body.match(re);
  if (!m) return null;
  return {
    amountMinor: parseAmount(m[1]),
    merchantRaw: m[2].trim(),
    kind: 'debit',
  };
};

const RULES: Record<string, Rule[]> = {
  HDFCBK: [
    debit(/Rs\.?\s*([\d,]+(?:\.\d+)?)\s+debited.*?to\s+([A-Z0-9 .&\-_*]+?)(?:\.|\s+Avl|\s+on)/i),
    debit(/Rs\.?\s*([\d,]+(?:\.\d+)?)\s+(?:spent|paid).*?at\s+([A-Z0-9 .&\-_*]+?)(?:\.|\s+on|\s+Avl)/i),
  ],
  ICICIB: [
    debit(/INR\s+([\d,]+(?:\.\d+)?)\s+spent.*?at\s+([A-Z0-9 .&\-_*]+?)\s+on/i),
    debit(/Rs\.?\s*([\d,]+(?:\.\d+)?)\s+debited.*?to\s+([A-Z0-9 .&\-_*]+?)(?:\.|\s+on)/i),
  ],
  AXISBK: [
    debit(/INR\s+([\d,]+(?:\.\d+)?)\s+(?:spent|debited).*?(?:at|to)\s+([A-Z0-9 .&\-_*]+?)(?:\.|\s+on)/i),
  ],
  SBIINB: [
    debit(/Rs\.?\s*([\d,]+(?:\.\d+)?)\s+(?:debited|withdrawn).*?(?:to|at)\s+([A-Z0-9 .&\-_*]+?)(?:\.|\s+Avl|\s+Ref)/i),
  ],
  KOTAKB: [
    debit(/Rs\.?\s*([\d,]+(?:\.\d+)?)\s+(?:spent|debited).*?(?:at|to)\s+([A-Z0-9 .&\-_*]+?)(?:\.|\s+on)/i),
  ],
  PAYTM: [
    debit(/Paid\s+Rs\.?\s*([\d,]+(?:\.\d+)?)\s+to\s+([A-Z0-9 .&\-_*]+?)(?:\s+from|\.|\s+Txn)/i),
  ],
  PHONEPE: [
    debit(/Rs\.?\s*([\d,]+(?:\.\d+)?)\s+(?:paid|sent)\s+to\s+([A-Z0-9 .&\-_*]+?)(?:\.|\s+via)/i),
  ],
  AMAZONPAY: [
    debit(/Rs\.?\s*([\d,]+(?:\.\d+)?)\s+paid.*?(?:to|for)\s+([A-Z0-9 .&\-_*]+?)(?:\.|\s+via)/i),
  ],
};

export const matchSmsRule = (stem: string, body: string): SmsParsed | null => {
  const rules = RULES[stem];
  if (!rules) return null;
  for (const r of rules) {
    const out = r(body);
    if (out) return out;
  }
  return null;
};
```

- [ ] **Step 3: Tests pass** — 5 passing.

- [ ] **Step 4: Commit** — `feat(parser): curated SMS rules`.

---

## Task 3 — Heuristic SMS parser fallback

**Files:**
- Create: `src/services/parser/sms.ts`
- Test: `__tests__/services/parser-sms.test.ts`

- [ ] **Step 1: Failing test**

Create `__tests__/services/parser-sms.test.ts`:
```typescript
import { parseSms } from '../../src/services/parser/sms';

describe('parseSms', () => {
  it('drops promotional SMS via TRAI suffix', () => {
    expect(parseSms({ sender: 'AD-OFFER-P', body: 'Rs.100 off on UBER!', ts: 0 })).toBeNull();
  });

  it('drops government SMS', () => {
    expect(parseSms({ sender: 'GOV-EPFO-G', body: 'Rs.5000 credited to your PF', ts: 0 })).toBeNull();
  });

  it('parses transactional with curated rule (high confidence)', () => {
    const r = parseSms({
      sender: 'VK-HDFCBK-T',
      body: 'Rs.250.00 debited from a/c **1234 on 14-05-26 to SWIGGY. Avl Bal: Rs.10,000',
      ts: 1_700_000_000_000,
    });
    expect(r).toMatchObject({
      amountMinor: 25000,
      merchantRaw: 'SWIGGY',
      merchantNorm: 'swiggy',
      confidence: 0.95,
      occurredAt: 1_700_000_000_000,
      sourceRef: 'VK-HDFCBK-T',
    });
  });

  it('falls back to heuristic for unknown transactional sender', () => {
    const r = parseSms({
      sender: 'XX-WEIRDBANK-T',
      body: 'Your card was charged Rs.123.45 at GROCER on 01-01-26',
      ts: 1_700_000_000_000,
    });
    expect(r?.amountMinor).toBe(12345);
    expect(r?.merchantRaw).toBe('GROCER');
    expect(r?.confidence).toBeCloseTo(0.6);
  });

  it('heuristic ignores credits', () => {
    expect(
      parseSms({
        sender: 'XX-BANK-T',
        body: 'Rs.500 credited from REFUND',
        ts: 0,
      }),
    ).toBeNull();
  });

  it('returns null when no amount found', () => {
    expect(parseSms({ sender: 'VK-BANK-T', body: 'Hello world', ts: 0 })).toBeNull();
  });
});
```

Expect FAIL.

- [ ] **Step 2: Implementation**

Create `src/services/parser/sms.ts`:
```typescript
import { extractTraiSuffix, senderStem, normalizeMerchant } from './rules/normalize';
import { matchSmsRule } from './rules/sms-rules';

export interface SmsEvent {
  sender: string | null;
  body: string;
  ts: number;
}

export interface ParserDraft {
  amountMinor: number;
  merchantRaw: string | null;
  merchantNorm: string;
  occurredAt: number;
  sourceRef: string | null;
  sourceMsg: string;
  confidence: number;
}

const CREDIT_HINTS = /\b(credited|refund(ed)?|deposited|received from)\b/i;
const AMOUNT_RE = /(?:rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/i;
const MERCHANT_RE = /(?:to|at|towards|for)\s+([A-Z][A-Z0-9 .&\-_*]{1,40}?)(?:\s+on\b|\.|\s+Avl|\s+via|$)/i;

const heuristicParse = (body: string): { amountMinor: number; merchantRaw: string } | null => {
  if (CREDIT_HINTS.test(body)) return null;
  const am = body.match(AMOUNT_RE);
  if (!am) return null;
  const amountMinor = Math.round(parseFloat(am[1].replace(/,/g, '')) * 100);
  const mm = body.match(MERCHANT_RE);
  const merchantRaw = mm ? mm[1].trim() : '';
  if (!merchantRaw) return null;
  return { amountMinor, merchantRaw };
};

export const parseSms = (event: SmsEvent): ParserDraft | null => {
  const suffix = extractTraiSuffix(event.sender);
  if (suffix === 'P' || suffix === 'G') return null;

  const stem = senderStem(event.sender);
  const ruleHit = matchSmsRule(stem, event.body);
  if (ruleHit) {
    return {
      amountMinor: ruleHit.amountMinor,
      merchantRaw: ruleHit.merchantRaw,
      merchantNorm: normalizeMerchant(ruleHit.merchantRaw),
      occurredAt: event.ts,
      sourceRef: event.sender,
      sourceMsg: event.body,
      confidence: 0.95,
    };
  }

  const heur = heuristicParse(event.body);
  if (!heur) return null;
  return {
    amountMinor: heur.amountMinor,
    merchantRaw: heur.merchantRaw,
    merchantNorm: normalizeMerchant(heur.merchantRaw),
    occurredAt: event.ts,
    sourceRef: event.sender,
    sourceMsg: event.body,
    confidence: 0.6,
  };
};
```

- [ ] **Step 3: Tests pass** — 6 passing.

- [ ] **Step 4: Commit** — `feat(parser): SMS parser with TRAI routing + heuristic fallback`.

---

## Task 4 — DedupService

**Files:**
- Create: `src/services/dedup.ts`
- Test: `__tests__/services/dedup.test.ts`

- [ ] **Step 1: Failing test**

Create `__tests__/services/dedup.test.ts`:
```typescript
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
    const a = computeDedupKey({ amountMinor: 12500, sourceRef: 'VK-HDFCBK-T', occurredAt: 1_700_000_000_000 });
    const b = computeDedupKey({ amountMinor: 12500, sourceRef: 'JD-HDFCB-T', occurredAt: 1_700_000_000_119_000 });
    expect(a).toBe(b);
  });

  it('finds a match within window for same key', () => {
    const { expense, dedup, clock } = setup();
    const key = computeDedupKey({ amountMinor: 250, sourceRef: 'VK-HDFCBK-T', occurredAt: clock.now() });
    expense.insert({ amountMinor: 250, occurredAt: clock.now(), merchantRaw: null, merchantNorm: null, categoryId: null, source: 'sms', dedupKey: key });
    const match = dedup.findMatch(key);
    expect(match).toBeDefined();
  });

  it('does not match outside the 5-minute window', () => {
    const { expense, dedup, clock } = setup();
    const key = computeDedupKey({ amountMinor: 250, sourceRef: 'VK-HDFCBK-T', occurredAt: clock.now() });
    expense.insert({ amountMinor: 250, occurredAt: clock.now(), merchantRaw: null, merchantNorm: null, categoryId: null, source: 'sms', dedupKey: key });
    clock.advance(6 * 60 * 1000);
    const match = dedup.findMatch(key);
    expect(match).toBeUndefined();
  });

  it('merge bumps verified_by and merges sources', () => {
    const { expense, dedup } = setup();
    const e = expense.insert({ amountMinor: 250, occurredAt: 0, merchantRaw: null, merchantNorm: 'rapido', categoryId: null, source: 'sms', sourceMsg: 'sms body', dedupKey: 'k' });
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
});
```

Expect FAIL.

- [ ] **Step 2: Implementation**

Create `src/services/dedup.ts`:
```typescript
import type { Database } from '../data/database';
import type { Clock } from '../data/clock';
import { senderBucket } from './parser/rules/normalize';
import type { Expense } from '../types/domain';
import { DELETE_WINDOW_MS } from '../types/domain';

const MINUTE_BUCKET_MS = 2 * 60 * 1000;

export const computeDedupKey = (input: {
  amountMinor: number;
  sourceRef: string | null;
  occurredAt: number;
}): string => {
  const bucket = senderBucket(input.sourceRef);
  const minute = Math.floor(input.occurredAt / MINUTE_BUCKET_MS);
  return `${input.amountMinor}|${bucket}|${minute}`;
};

export interface DedupCandidate {
  amountMinor: number;
  merchantRaw: string | null;
  merchantNorm: string;
  occurredAt: number;
  sourceRef: string | null;
  sourceMsg: string;
  confidence: number;
}

export interface DedupService {
  findMatch(dedupKey: string): Expense | undefined;
  merge(existingId: string, incoming: DedupCandidate): Expense;
}

const COLUMNS =
  'id, amount_minor, currency, occurred_at, created_at, updated_at, merchant_raw, merchant_norm, category_id, source, source_ref, source_msg, confidence, status, note, photo_path, dedup_key, verified_by';

const rowToExpense = (r: Record<string, unknown>): Expense => ({
  id: r.id as string,
  amountMinor: r.amount_minor as number,
  currency: r.currency as string,
  occurredAt: r.occurred_at as number,
  createdAt: r.created_at as number,
  updatedAt: r.updated_at as number,
  merchantRaw: (r.merchant_raw as string) ?? null,
  merchantNorm: (r.merchant_norm as string) ?? null,
  categoryId: (r.category_id as string) ?? null,
  source: r.source as Expense['source'],
  sourceRef: (r.source_ref as string) ?? null,
  sourceMsg: (r.source_msg as string) ?? null,
  confidence: r.confidence as number,
  status: r.status as Expense['status'],
  note: (r.note as string) ?? null,
  photoPath: (r.photo_path as string) ?? null,
  dedupKey: (r.dedup_key as string) ?? null,
  verifiedBy: r.verified_by as number,
});

export const createDedupService = (deps: { db: Database; clock: Clock }): DedupService => {
  const { db, clock } = deps;

  const findMatch: DedupService['findMatch'] = (dedupKey) => {
    const cutoff = clock.now() - DELETE_WINDOW_MS;
    const row = db.get<Record<string, unknown>>(
      `SELECT ${COLUMNS} FROM expenses
        WHERE dedup_key = ?
          AND created_at >= ?
          AND status != 'void'
        ORDER BY created_at DESC LIMIT 1`,
      [dedupKey, cutoff],
    );
    return row ? rowToExpense(row) : undefined;
  };

  const merge: DedupService['merge'] = (existingId, incoming) => {
    const now = clock.now();
    const cur = db.get<Record<string, unknown>>(`SELECT ${COLUMNS} FROM expenses WHERE id = ?`, [existingId]);
    if (!cur) throw new Error(`expense not found: ${existingId}`);
    const existing = rowToExpense(cur);

    const mergedMsg = [existing.sourceMsg, incoming.sourceMsg].filter(Boolean).join('\n---\n');
    const newMerchantRaw = incoming.merchantRaw ?? existing.merchantRaw;
    const newMerchantNorm = incoming.merchantNorm || existing.merchantNorm || '';
    const newOccurred = Math.min(existing.occurredAt, incoming.occurredAt);
    const newConfidence = Math.max(existing.confidence, incoming.confidence);

    db.run(
      `UPDATE expenses SET
         merchant_raw = ?,
         merchant_norm = ?,
         occurred_at = ?,
         source = 'merged',
         source_msg = ?,
         confidence = ?,
         verified_by = verified_by + 1,
         updated_at = ?
       WHERE id = ?`,
      [newMerchantRaw, newMerchantNorm, newOccurred, mergedMsg, newConfidence, now, existingId],
    );

    const after = db.get<Record<string, unknown>>(`SELECT ${COLUMNS} FROM expenses WHERE id = ?`, [existingId])!;
    return rowToExpense(after);
  };

  return { findMatch, merge };
};
```

- [ ] **Step 3: Tests pass** — 4 passing.

- [ ] **Step 4: Commit** — `feat(dedup): fuzzy merge service`.

---

## Task 5 — Rule-based Categorizer (Stages 1–2)

**Files:**
- Create: `src/services/categorizer/index.ts`, `src/services/categorizer/rules.ts`
- Test: `__tests__/services/categorizer-rules.test.ts`

- [ ] **Step 1: Failing test**

Create `__tests__/services/categorizer-rules.test.ts`:
```typescript
import { makeSeededDb } from '../helpers/test-db';
import { createRuleCategorizer } from '../../src/services/categorizer/rules';

describe('rule-based categorizer', () => {
  it('matches bundled rule exact', () => {
    const db = makeSeededDb();
    const cat = createRuleCategorizer({ db });
    const r = cat.categorize('swiggy');
    expect(r.categoryId).toBe('cat-food');
    expect(r.source).toBe('bundled_rule');
    expect(r.confidence).toBeGreaterThan(0.9);
  });

  it('matches bundled rule substring', () => {
    const db = makeSeededDb();
    const cat = createRuleCategorizer({ db });
    const r = cat.categorize('swiggy bangalore');
    expect(r.categoryId).toBe('cat-food');
  });

  it('user rule beats bundled rule', () => {
    const db = makeSeededDb();
    db.run(
      `INSERT INTO merchant_rules (id, merchant_norm, category_id, origin, weight, created_at)
       VALUES ('u-1', 'swiggy', 'cat-shopping', 'user', 10, 0)`,
    );
    const cat = createRuleCategorizer({ db });
    const r = cat.categorize('swiggy');
    expect(r.categoryId).toBe('cat-shopping');
    expect(r.source).toBe('user_rule');
    expect(r.confidence).toBe(1.0);
  });

  it('returns Uncategorized when no match', () => {
    const db = makeSeededDb();
    const cat = createRuleCategorizer({ db });
    const r = cat.categorize('quantum widgets pvt ltd');
    expect(r.categoryId).toBe('cat-uncategorized');
    expect(r.source).toBe('uncategorized');
    expect(r.confidence).toBe(0);
  });
});
```

Expect FAIL.

- [ ] **Step 2: Implementations**

Create `src/services/categorizer/index.ts`:
```typescript
export interface CategorizerResult {
  categoryId: string;
  confidence: number;
  source: 'user_rule' | 'bundled_rule' | 'ml_nn' | 'uncategorized';
}

export interface Categorizer {
  categorize(merchantNorm: string): CategorizerResult;
}
```

Create `src/services/categorizer/rules.ts`:
```typescript
import type { Database } from '../../data/database';
import type { Categorizer, CategorizerResult } from './index';
import { UNCATEGORIZED_ID } from '../../data/seed/categories';

export const createRuleCategorizer = (deps: { db: Database }): Categorizer => {
  const { db } = deps;

  const lookup = (origin: 'user' | 'bundled', exact: string): string | null => {
    const row = db.get<{ category_id: string }>(
      'SELECT category_id FROM merchant_rules WHERE merchant_norm = ? AND origin = ?',
      [exact, origin],
    );
    return row?.category_id ?? null;
  };

  const lookupSubstring = (origin: 'bundled', needle: string): string | null => {
    if (!needle) return null;
    const rows = db.all<{ merchant_norm: string; category_id: string }>(
      'SELECT merchant_norm, category_id FROM merchant_rules WHERE origin = ?',
      [origin],
    );
    for (const r of rows) {
      if (needle.includes(r.merchant_norm)) return r.category_id;
    }
    return null;
  };

  const categorize: Categorizer['categorize'] = (merchantNorm): CategorizerResult => {
    const norm = merchantNorm.trim().toLowerCase();
    if (norm) {
      const u = lookup('user', norm);
      if (u) return { categoryId: u, confidence: 1.0, source: 'user_rule' };
      const b = lookup('bundled', norm);
      if (b) return { categoryId: b, confidence: 0.95, source: 'bundled_rule' };
      const bs = lookupSubstring('bundled', norm);
      if (bs) return { categoryId: bs, confidence: 0.9, source: 'bundled_rule' };
    }
    return { categoryId: UNCATEGORIZED_ID, confidence: 0, source: 'uncategorized' };
  };

  return { categorize };
};
```

- [ ] **Step 3: Tests pass** — 4 passing.

- [ ] **Step 4: Commit** — `feat(categorizer): rule-based stages (user + bundled)`.

---

## Task 6 — Ingestion log helper

**Files:**
- Create: `src/services/ingestion-log.ts`
- Test: `__tests__/services/ingestion-log.test.ts`

- [ ] **Step 1: Failing test**

Create `__tests__/services/ingestion-log.test.ts`:
```typescript
import { createHash } from 'crypto';
import { makeSeededDb } from '../helpers/test-db';
import { fixedClock } from '../helpers/fixed-clock';
import { createIngestionLog, hashBody } from '../../src/services/ingestion-log';

describe('IngestionLog', () => {
  it('hashBody is deterministic across same input', () => {
    expect(hashBody('sms', 'VK-HDFCBK-T', 'hello')).toBe(hashBody('sms', 'VK-HDFCBK-T', 'hello'));
    expect(hashBody('sms', 'VK-HDFCBK-T', 'hello').length).toBe(40);
  });

  it('detects already-seen bodies', () => {
    const db = makeSeededDb();
    const clock = fixedClock();
    const log = createIngestionLog({ db, clock });
    const h = hashBody('sms', 'VK-HDFCBK-T', 'first');
    expect(log.seen(h)).toBe(false);
    log.record(h, 'sms', 'VK-HDFCBK-T', 'inserted', 'expense-id-1');
    expect(log.seen(h)).toBe(true);
  });

  it('refuses to double-record same body_hash', () => {
    const db = makeSeededDb();
    const clock = fixedClock();
    const log = createIngestionLog({ db, clock });
    const h = hashBody('sms', 'A', 'x');
    log.record(h, 'sms', 'A', 'inserted', 'e1');
    expect(() => log.record(h, 'sms', 'A', 'inserted', 'e1')).toThrow();
  });
});
```

- [ ] **Step 2: Implementation**

Create `src/services/ingestion-log.ts`:
```typescript
import { createHash } from 'crypto';
import type { Database } from '../data/database';
import type { Clock } from '../data/clock';
import { newId } from '../data/ids';

export type IngestionOutcome =
  | 'inserted'
  | 'merged'
  | 'dropped_promo'
  | 'dropped_no_parse'
  | 'dropped_dup'
  | 'dropped_error';

export const hashBody = (source: string, ref: string | null, body: string): string =>
  createHash('sha1').update(`${source}|${ref ?? ''}|${body}`).digest('hex');

export interface IngestionLog {
  seen(bodyHash: string): boolean;
  record(
    bodyHash: string,
    source: string,
    ref: string | null,
    outcome: IngestionOutcome,
    expenseId: string | null,
  ): void;
}

export const createIngestionLog = (deps: { db: Database; clock: Clock }): IngestionLog => {
  const { db, clock } = deps;
  const seen: IngestionLog['seen'] = (h) =>
    !!db.get('SELECT 1 FROM ingestion_log WHERE body_hash = ?', [h]);
  const record: IngestionLog['record'] = (h, source, ref, outcome, expenseId) => {
    db.run(
      `INSERT INTO ingestion_log (id, source, source_ref, body_hash, expense_id, outcome, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newId(), source, ref, h, expenseId, outcome, clock.now()],
    );
  };
  return { seen, record };
};
```

- [ ] **Step 3: Tests pass** — 3 passing.

- [ ] **Step 4: Commit** — `feat: ingestion log helper`.

---

## Task 7 — IngestionPipeline orchestrator

**Files:**
- Create: `src/services/ingestion-pipeline.ts`
- Test: `__tests__/services/ingestion-pipeline.test.ts`

- [ ] **Step 1: Failing test**

Create `__tests__/services/ingestion-pipeline.test.ts`:
```typescript
import { makeSeededDb } from '../helpers/test-db';
import { fixedClock } from '../helpers/fixed-clock';
import { createIngestionPipeline } from '../../src/services/ingestion-pipeline';

const setup = () => {
  const db = makeSeededDb();
  const clock = fixedClock(1_700_000_000_000);
  const pipeline = createIngestionPipeline({ db, clock });
  return { db, clock, pipeline };
};

describe('IngestionPipeline.process', () => {
  it('drops promotional SMS', () => {
    const { pipeline, db } = setup();
    const out = pipeline.process({
      source: 'sms',
      sourceRef: 'AD-OFFER-P',
      body: 'Buy now Rs.100 off',
      ts: 0,
    });
    expect(out.outcome).toBe('dropped_promo');
    const count = db.get<{ c: number }>("SELECT COUNT(*) AS c FROM expenses")?.c;
    expect(count).toBe(0);
  });

  it('inserts a parsed SMS with bundled categorization', () => {
    const { pipeline, db } = setup();
    const out = pipeline.process({
      source: 'sms',
      sourceRef: 'VK-HDFCBK-T',
      body: 'Rs.250.00 debited from a/c **1234 on 14-05-26 to SWIGGY. Avl Bal: Rs.10,000',
      ts: 1_700_000_000_000,
    });
    expect(out.outcome).toBe('inserted');
    const row = db.get<{ amount_minor: number; category_id: string; status: string; verified_by: number }>(
      "SELECT amount_minor, category_id, status, verified_by FROM expenses LIMIT 1",
    );
    expect(row?.amount_minor).toBe(25000);
    expect(row?.category_id).toBe('cat-food');
    expect(row?.status).toBe('active');
    expect(row?.verified_by).toBe(1);
  });

  it('puts low-confidence parses into pending_review', () => {
    const { pipeline, db } = setup();
    const out = pipeline.process({
      source: 'sms',
      sourceRef: 'XX-WEIRD-T',
      body: 'Your card was charged Rs.99.00 at QUANTUM WIDGETS on 01-01-26',
      ts: 0,
    });
    expect(out.outcome).toBe('inserted');
    const r = db.get<{ status: string }>("SELECT status FROM expenses");
    expect(r?.status).toBe('pending_review');
  });

  it('idempotent: replaying same body returns dropped_dup', () => {
    const { pipeline } = setup();
    const ev = {
      source: 'sms' as const,
      sourceRef: 'VK-HDFCBK-T',
      body: 'Rs.250.00 debited from a/c **1234 to SWIGGY. Avl Bal: Rs.10,000',
      ts: 0,
    };
    expect(pipeline.process(ev).outcome).toBe('inserted');
    expect(pipeline.process(ev).outcome).toBe('dropped_dup');
  });

  it('merges incoming when same dedup key already exists', () => {
    const { pipeline, db } = setup();
    pipeline.process({
      source: 'sms',
      sourceRef: 'VK-HDFCBK-T',
      body: 'Rs.250.00 debited from a/c **1234 to RAPIDO. Avl Bal: Rs.10,000',
      ts: 1_700_000_000_000,
    });
    // simulate a notification draft for the same txn within window
    const out = pipeline.process({
      source: 'notification',
      sourceRef: 'com.rapido.passenger',
      body: 'Paid Rs.250 to RAPIDO for ride',
      ts: 1_700_000_000_119_000, // 119s later — same 2-min bucket
      preParsed: {
        amountMinor: 25000,
        merchantRaw: 'Rapido',
        merchantNorm: 'rapido',
        occurredAt: 1_700_000_000_119_000,
        sourceRef: 'com.rapido.passenger',
        sourceMsg: 'Paid Rs.250 to RAPIDO for ride',
        confidence: 0.9,
      },
    });
    expect(out.outcome).toBe('merged');
    const r = db.get<{ verified_by: number; source: string }>("SELECT verified_by, source FROM expenses");
    expect(r?.verified_by).toBe(2);
    expect(r?.source).toBe('merged');
  });

  it('drops no-parse messages with audit row', () => {
    const { pipeline, db } = setup();
    const out = pipeline.process({
      source: 'sms',
      sourceRef: 'VK-HDFCBK-T',
      body: 'Welcome to HDFC Bank net banking',
      ts: 0,
    });
    expect(out.outcome).toBe('dropped_no_parse');
    const lg = db.get<{ outcome: string }>('SELECT outcome FROM ingestion_log');
    expect(lg?.outcome).toBe('dropped_no_parse');
  });
});
```

Expect FAIL.

- [ ] **Step 2: Implementation**

Create `src/services/ingestion-pipeline.ts`:
```typescript
import type { Database } from '../data/database';
import type { Clock } from '../data/clock';
import { AUTO_CONFIRM_CONFIDENCE } from '../types/domain';
import { createExpenseService } from './expense-service';
import { createDedupService, computeDedupKey } from './dedup';
import { createRuleCategorizer } from './categorizer/rules';
import { createIngestionLog, hashBody, type IngestionOutcome } from './ingestion-log';
import { parseSms, type ParserDraft } from './parser/sms';

export interface IngestionEvent {
  source: 'sms' | 'notification' | 'manual' | 'ocr';
  sourceRef: string | null;
  body: string;
  ts: number;
  preParsed?: ParserDraft;
}

export interface IngestionResult {
  outcome: IngestionOutcome;
  expenseId: string | null;
}

export interface IngestionPipeline {
  process(event: IngestionEvent): IngestionResult;
}

export const createIngestionPipeline = (deps: { db: Database; clock: Clock }): IngestionPipeline => {
  const { db, clock } = deps;
  const expense = createExpenseService({ db, clock });
  const dedup = createDedupService({ db, clock });
  const categorizer = createRuleCategorizer({ db });
  const log = createIngestionLog({ db, clock });

  const process: IngestionPipeline['process'] = (event) => {
    const bh = hashBody(event.source, event.sourceRef, event.body);
    if (log.seen(bh)) return { outcome: 'dropped_dup', expenseId: null };

    let draft: ParserDraft | null;
    try {
      draft = event.preParsed ?? (event.source === 'sms'
        ? parseSms({ sender: event.sourceRef, body: event.body, ts: event.ts })
        : null);
    } catch {
      log.record(bh, event.source, event.sourceRef, 'dropped_error', null);
      return { outcome: 'dropped_error', expenseId: null };
    }

    if (!draft) {
      const isPromo = event.source === 'sms' && /-P$/i.test(event.sourceRef ?? '');
      const outcome: IngestionOutcome = isPromo ? 'dropped_promo' : 'dropped_no_parse';
      log.record(bh, event.source, event.sourceRef, outcome, null);
      return { outcome, expenseId: null };
    }

    const dedupKey = computeDedupKey({
      amountMinor: draft.amountMinor,
      sourceRef: draft.sourceRef,
      occurredAt: draft.occurredAt,
    });

    const existing = dedup.findMatch(dedupKey);
    if (existing) {
      const merged = dedup.merge(existing.id, draft);
      log.record(bh, event.source, event.sourceRef, 'merged', merged.id);
      return { outcome: 'merged', expenseId: merged.id };
    }

    const cat = categorizer.categorize(draft.merchantNorm);
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
    });
    log.record(bh, event.source, event.sourceRef, 'inserted', inserted.id);
    return { outcome: 'inserted', expenseId: inserted.id };
  };

  return { process };
};
```

- [ ] **Step 3: Tests pass** — 6 passing.

- [ ] **Step 4: Commit** — `feat: ingestion pipeline orchestrator`.

---

## Task 8 — Headless JS task entry

**Files:**
- Create: `src/ingestion-task.ts`
- Modify: `index.js`

- [ ] **Step 1: Create the Headless task**

`src/ingestion-task.ts`:
```typescript
import { AppRegistry } from 'react-native';
import { getAppDb } from './data/app-db';
import { systemClock } from './data/clock';
import { createIngestionPipeline } from './services/ingestion-pipeline';

type Payload = {
  events: Array<{
    source: 'sms' | 'notification';
    sourceRef: string | null;
    body: string;
    ts: number;
  }>;
};

const handle = async (data: Payload) => {
  const pipeline = createIngestionPipeline({ db: getAppDb(), clock: systemClock });
  for (const ev of data.events ?? []) {
    try {
      pipeline.process(ev);
    } catch (e) {
      // swallow per-event; the pipeline already logs dropped_error
      // eslint-disable-next-line no-console
      console.warn('ingestion event failed', e);
    }
  }
};

AppRegistry.registerHeadlessTask('IngestionTask', () => handle);
```

- [ ] **Step 2: Register from `index.js`**

Modify `index.js` (current file just registers the App component). Append:
```javascript
import './src/ingestion-task';
```

- [ ] **Step 3: Typecheck** — `npm run typecheck`. Must pass.

- [ ] **Step 4: Commit** — `feat: Headless JS ingestion task`.

---

## Task 9 — Native: AndroidManifest permissions and receivers

**Files:**
- Modify: `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Update the manifest**

Open `android/app/src/main/AndroidManifest.xml`. Inside the root `<manifest>` element, before the `<application>` tag, add:

```xml
<uses-permission android:name="android.permission.RECEIVE_SMS"/>
<uses-permission android:name="android.permission.READ_SMS"/>
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.WAKE_LOCK"/>
```

Inside the `<application>` element (alongside the existing `<activity>`), add:

```xml
<service
    android:name=".ingestion.HeadlessIngestionTaskService"
    android:exported="false"/>

<receiver
    android:name=".ingestion.SmsReceiver"
    android:exported="true"
    android:permission="android.permission.BROADCAST_SMS">
    <intent-filter android:priority="999">
        <action android:name="android.provider.Telephony.SMS_RECEIVED"/>
    </intent-filter>
</receiver>

<receiver
    android:name=".BootReceiver"
    android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.BOOT_COMPLETED"/>
    </intent-filter>
</receiver>
```

- [ ] **Step 2: Commit** — `feat(android): add SMS + boot permissions and receivers`.

---

## Task 10 — Native: HeadlessIngestionTaskService

**Files:**
- Create: `android/app/src/main/java/com/expensemanager/ingestion/HeadlessIngestionTaskService.kt`
- Create: `android/app/src/main/java/com/expensemanager/ingestion/IngestionPayload.kt`

- [ ] **Step 1: Find the app's package directory**

```bash
ls android/app/src/main/java/com/expensemanager
```

It should contain `MainActivity.kt` and `MainApplication.kt`. If the package path differs (e.g. `com/expense_manager`), adjust accordingly.

- [ ] **Step 2: Create the payload helper**

`android/app/src/main/java/com/expensemanager/ingestion/IngestionPayload.kt`:
```kotlin
package com.expensemanager.ingestion

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap

data class IngestionEvent(
    val source: String,
    val sourceRef: String?,
    val body: String,
    val ts: Long,
)

fun List<IngestionEvent>.toReactPayload(): WritableMap {
    val arr: WritableArray = Arguments.createArray()
    for (e in this) {
        val m: WritableMap = Arguments.createMap()
        m.putString("source", e.source)
        m.putString("sourceRef", e.sourceRef)
        m.putString("body", e.body)
        m.putDouble("ts", e.ts.toDouble())
        arr.pushMap(m)
    }
    val out: WritableMap = Arguments.createMap()
    out.putArray("events", arr)
    return out
}
```

- [ ] **Step 3: Create the headless task service**

`android/app/src/main/java/com/expensemanager/ingestion/HeadlessIngestionTaskService.kt`:
```kotlin
package com.expensemanager.ingestion

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class HeadlessIngestionTaskService : HeadlessJsTaskService() {
    override fun getTaskConfig(intent: Intent): HeadlessJsTaskConfig? {
        val extras = intent.extras ?: return null
        val data = Arguments.fromBundle(extras)
        return HeadlessJsTaskConfig(
            "IngestionTask",
            data,
            30_000L,
            true,
        )
    }
}
```

- [ ] **Step 4: Commit** — `feat(android): HeadlessIngestionTaskService`.

---

## Task 11 — Native: SmsReceiver

**Files:**
- Create: `android/app/src/main/java/com/expensemanager/ingestion/SmsReceiver.kt`

- [ ] **Step 1: Implementation**

```kotlin
package com.expensemanager.ingestion

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.provider.Telephony
import com.facebook.react.HeadlessJsTaskService

class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        if (messages.isEmpty()) return

        val grouped = messages.groupBy { it.originatingAddress to it.timestampMillis }
        val events = grouped.map { (key, parts) ->
            val (sender, ts) = key
            val body = parts.joinToString(separator = "") { it.displayMessageBody ?: "" }
            IngestionEvent("sms", sender, body, ts)
        }
        if (events.isEmpty()) return

        val payload: Bundle = Arguments.toBundle(events.toReactPayload()) ?: return

        val svc = Intent(context.applicationContext, HeadlessIngestionTaskService::class.java)
        svc.putExtras(payload)
        context.applicationContext.startService(svc)
        HeadlessJsTaskService.acquireWakeLockNow(context.applicationContext)
    }
}

private object Arguments {
    fun toBundle(map: com.facebook.react.bridge.WritableMap): Bundle? =
        com.facebook.react.bridge.Arguments.toBundle(map)
}
```

- [ ] **Step 2: Commit** — `feat(android): SmsReceiver dispatches to Headless JS`.

---

## Task 12 — Native: BootReceiver

**Files:**
- Create: `android/app/src/main/java/com/expensemanager/BootReceiver.kt`

- [ ] **Step 1: Implementation**

```kotlin
package com.expensemanager

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        // SmsReceiver is registered statically in the manifest, so no work needed here.
        // This receiver exists so Android knows our app wants to run after boot
        // (manifest-registered SMS receivers don't need explicit re-arming).
    }
}
```

- [ ] **Step 2: Commit** — `feat(android): BootReceiver stub`.

---

## Task 13 — Native: InboxScanWorker

**Files:**
- Create: `android/app/src/main/java/com/expensemanager/ingestion/InboxScanWorker.kt`
- Modify: `android/app/build.gradle` (add WorkManager dependency)

- [ ] **Step 1: Add WorkManager to `android/app/build.gradle`**

Open `android/app/build.gradle`. Locate the `dependencies { ... }` block. Inside it, add (if not already present):

```gradle
implementation "androidx.work:work-runtime-ktx:2.9.1"
```

- [ ] **Step 2: Implementation**

`android/app/src/main/java/com/expensemanager/ingestion/InboxScanWorker.kt`:
```kotlin
package com.expensemanager.ingestion

import android.content.Context
import android.net.Uri
import android.os.Bundle
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.facebook.react.HeadlessJsTaskService
import kotlinx.coroutines.delay

private const val BATCH_SIZE = 200

class InboxScanWorker(
    appContext: Context,
    workerParams: WorkerParameters,
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val sinceMs = inputData.getLong("sinceMs", 0L)
        val ctx = applicationContext

        val cursor = ctx.contentResolver.query(
            Uri.parse("content://sms/inbox"),
            arrayOf("_id", "address", "body", "date"),
            "date >= ?",
            arrayOf(sinceMs.toString()),
            "date ASC",
        ) ?: return Result.success()

        cursor.use { c ->
            val idIdx = c.getColumnIndex("_id")
            val addrIdx = c.getColumnIndex("address")
            val bodyIdx = c.getColumnIndex("body")
            val dateIdx = c.getColumnIndex("date")

            val batch = ArrayList<IngestionEvent>(BATCH_SIZE)
            while (c.moveToNext()) {
                if (isStopped) return Result.success()
                batch.add(
                    IngestionEvent(
                        source = "sms",
                        sourceRef = c.getString(addrIdx),
                        body = c.getString(bodyIdx) ?: "",
                        ts = c.getLong(dateIdx),
                    ),
                )
                if (batch.size >= BATCH_SIZE) {
                    flushBatch(ctx, batch)
                    batch.clear()
                    delay(50)
                }
            }
            if (batch.isNotEmpty()) flushBatch(ctx, batch)
        }
        return Result.success()
    }

    private fun flushBatch(ctx: Context, batch: List<IngestionEvent>) {
        val payload: Bundle = com.facebook.react.bridge.Arguments.toBundle(batch.toReactPayload()) ?: return
        val svc = android.content.Intent(ctx, HeadlessIngestionTaskService::class.java)
        svc.putExtras(payload)
        ctx.startService(svc)
        HeadlessJsTaskService.acquireWakeLockNow(ctx)
    }
}
```

- [ ] **Step 3: Commit** — `feat(android): InboxScanWorker for one-shot SMS history scan`.

---

## Task 14 — Full sweep

- [ ] **Step 1: Run tests** — `npm test`. Expect all passing (Plan 1 tests + new Plan 2 tests, ~50+ total).
- [ ] **Step 2: Lint and typecheck** — `npm run lint && npm run typecheck`. Must pass.
- [ ] **Step 3: Format pass** — `npm run format`. Commit any drift: `git add -A && (git diff --cached --quiet || git commit -m "chore: format pass")`.

## What lands after Plan 2

- Full SMS ingestion path tested end-to-end in JS.
- Native receivers + worker wired (compile path validated by typecheck/lint only — device run deferred).
- The pipeline is ready to receive notification events too (Plan 4 adds the `NotificationListenerService` that produces them).
