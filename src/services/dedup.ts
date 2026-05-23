import type { Database } from '../data/database';
import type { Clock } from '../data/clock';
import { senderBucket, normalizeCounterpart } from './parser/rules/normalize';
import type { NormalizedCounterpart } from './parser/rules/normalize';
import type { Expense } from '../types/domain';
import { DELETE_WINDOW_MS } from '../types/domain';

const MINUTE_BUCKET_MS = 2 * 60 * 1000;
const FUZZY_WINDOW_MS = 10 * 60 * 1000;
const PATTERN_MIN_SEEN = 2;
const PATTERN_BASE_WINDOW_MS = 10 * 60 * 1000;

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

export interface FuzzyInput {
  amountMinor: number;
  merchantNorm: string;
  sourceRef: string | null;
  occurredAt: number;
}

export interface RecordMergePatternInput {
  merchantNorm: string;
  counterpart: NormalizedCounterpart;
  delayMs: number;
}

export interface DedupService {
  findMatch(dedupKey: string): Expense | undefined;
  fuzzyMatch(incoming: FuzzyInput): Expense | undefined;
  patternMatch(incoming: FuzzyInput): Expense | undefined;
  recordMergePattern(input: RecordMergePatternInput): void;
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
  locationLat: (r.location_lat as number | null) ?? null,
  locationLon: (r.location_lon as number | null) ?? null,
  locationName: (r.location_name as string | null) ?? null,
  subcategory: (r.subcategory as string | null) ?? null,
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

  // Fuzzy: same merchant family + ±10-min occurred_at window + amount within ±15%.
  // Catches "SMS says ₹100, app notification says ₹96 for the same Rapido ride".
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

  const recordMergePattern: DedupService['recordMergePattern'] = ({
    merchantNorm,
    counterpart,
    delayMs,
  }) => {
    if (!merchantNorm || !counterpart.value) return;
    if (merchantNorm === counterpart.value) return;
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
    if (!incoming.merchantNorm && !incomingCp) return undefined;
    const patternRows = db.all<Record<string, unknown>>(
      `SELECT merchant_norm, counterpart, seen_count, median_delay_ms FROM merge_patterns
        WHERE seen_count >= ? AND (merchant_norm = ? OR counterpart = ? OR merchant_norm = ? OR counterpart = ?)`,
      [
        PATTERN_MIN_SEEN,
        incoming.merchantNorm,
        incoming.merchantNorm,
        incomingCp?.value ?? '',
        incomingCp?.value ?? '',
      ],
    );
    if (patternRows.length === 0) return undefined;

    const cutoff = clock.now() - DELETE_WINDOW_MS;
    const lo = Math.floor(incoming.amountMinor * 0.85);
    const hi = Math.ceil(incoming.amountMinor * 1.15);

    let best: Expense | null = null;
    let bestDelta = Infinity;

    for (const p of patternRows) {
      const merchantSide = p.merchant_norm as string;
      const counterpartSide = p.counterpart as string;
      // Incoming matches one side of the pair; the partner expense lives under the OTHER side.
      const partner =
        merchantSide === incoming.merchantNorm || merchantSide === incomingCp?.value
          ? counterpartSide
          : merchantSide;
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
        [cutoff, lo, hi, tLo, tHi, partner],
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

  // True when the normalized merchant maps to a known categorizer rule — that
  // identifies the friendly brand name (e.g. "rapido" matches a rule, while
  // "roppen transportation" does not). Used when merging two events to keep
  // the recognizable brand surfaced over the bank-leg legal name.
  const hasMerchantRule = (norm: string | null): boolean => {
    if (!norm) return false;
    const row = db.get<{ c: number }>(
      'SELECT COUNT(*) AS c FROM merchant_rules WHERE merchant_norm = ?',
      [norm],
    );
    return (row?.c ?? 0) > 0;
  };

  const merge: DedupService['merge'] = (existingId, incoming) => {
    const now = clock.now();
    const cur = db.get<Record<string, unknown>>(`SELECT ${COLUMNS} FROM expenses WHERE id = ?`, [
      existingId,
    ]);
    if (!cur) throw new Error(`expense not found: ${existingId}`);
    const existing = rowToExpense(cur);

    const mergedMsg = [existing.sourceMsg, incoming.sourceMsg].filter(Boolean).join('\n---\n');
    // Prefer the merchant identity that maps to a known rule (= recognizable
    // brand). Falls back to incoming when neither side has a rule, preserving
    // prior behavior.
    const existingHasRule = hasMerchantRule(existing.merchantNorm);
    const incomingHasRule = hasMerchantRule(incoming.merchantNorm);
    const preferExisting = existingHasRule && !incomingHasRule;
    const newMerchantRaw = preferExisting
      ? existing.merchantRaw
      : (incoming.merchantRaw ?? existing.merchantRaw);
    const newMerchantNorm = preferExisting
      ? (existing.merchantNorm ?? '')
      : (incoming.merchantNorm || existing.merchantNorm || '');
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

    const after = db.get<Record<string, unknown>>(`SELECT ${COLUMNS} FROM expenses WHERE id = ?`, [
      existingId,
    ])!;
    return rowToExpense(after);
  };

  return { findMatch, fuzzyMatch, patternMatch, recordMergePattern, merge };
};
