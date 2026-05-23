import type { Database } from '../data/database';
import type { Clock } from '../data/clock';
import { AUTO_CONFIRM_CONFIDENCE } from '../types/domain';
import { createExpenseService } from './expense-service';
import { createDedupService, computeDedupKey } from './dedup';
import { createRuleCategorizer } from './categorizer/rules';
import { createIngestionLog, hashBody, type IngestionOutcome } from './ingestion-log';
import { parseSms, type ParserDraft } from './parser/sms';
import { parseNotification } from './parser/notification';
import { suggestSubcategory } from './categorizer/subcategory';
import { normalizeCounterpart } from './parser/rules/normalize';

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

export const createIngestionPipeline = (deps: {
  db: Database;
  clock: Clock;
}): IngestionPipeline => {
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
      draft =
        event.preParsed ??
        (event.source === 'sms'
          ? parseSms({ sender: event.sourceRef, body: event.body, ts: event.ts })
          : event.source === 'notification'
            ? parseNotification({
                packageName: event.sourceRef ?? '',
                title: '',
                text: event.body,
                ts: event.ts,
              })
            : null);
    } catch {
      log.record(bh, event.source, event.sourceRef, 'dropped_error', null);
      return { outcome: 'dropped_error', expenseId: null };
    }

    if (!draft) {
      // TRAI suffixes -P (promotional) and -G (government) are filtered out, not failed parses.
      const isFiltered = event.source === 'sms' && /-[PG]$/i.test(event.sourceRef ?? '');
      const outcome: IngestionOutcome = isFiltered ? 'dropped_promo' : 'dropped_no_parse';
      log.record(bh, event.source, event.sourceRef, outcome, null);
      return { outcome, expenseId: null };
    }

    // Compute dedup key using merchantNorm as the bucket source so that the
    // same transaction observed across different channels (SMS from bank vs
    // notification from merchant app) lands on the same key. Falls back to
    // sourceRef when merchantNorm is unavailable.
    const dedupKey = computeDedupKey({
      amountMinor: draft.amountMinor,
      sourceRef: draft.merchantNorm || draft.sourceRef,
      occurredAt: draft.occurredAt,
    });

    const existing =
      dedup.findMatch(dedupKey) ??
      dedup.fuzzyMatch({
        amountMinor: draft.amountMinor,
        merchantNorm: draft.merchantNorm,
        sourceRef: draft.sourceRef,
        occurredAt: draft.occurredAt,
      }) ??
      dedup.patternMatch({
        amountMinor: draft.amountMinor,
        merchantNorm: draft.merchantNorm,
        sourceRef: draft.sourceRef,
        occurredAt: draft.occurredAt,
      });
    if (existing) {
      const merged = dedup.merge(existing.id, draft);
      // Learn the pairing from this confirmed merge — both directions.
      const cpFromDraft = normalizeCounterpart(draft.merchantNorm);
      const cpFromExisting = normalizeCounterpart(existing.merchantNorm);
      const delay = Math.abs(existing.occurredAt - draft.occurredAt);
      if (existing.merchantNorm && cpFromDraft) {
        dedup.recordMergePattern({
          merchantNorm: existing.merchantNorm,
          counterpart: cpFromDraft,
          delayMs: delay,
        });
      }
      if (draft.merchantNorm && cpFromExisting) {
        dedup.recordMergePattern({
          merchantNorm: draft.merchantNorm,
          counterpart: cpFromExisting,
          delayMs: delay,
        });
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
  };

  return { process };
};
