import { sha1 } from 'js-sha1';
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
  sha1(`${source}|${ref ?? ''}|${body}`);

export interface IngestionLog {
  seen(bodyHash: string): boolean;
  record(
    bodyHash: string,
    source: string,
    ref: string | null,
    outcome: IngestionOutcome,
    expenseId: string | null,
    body: string | null,
  ): void;
}

export const createIngestionLog = (deps: { db: Database; clock: Clock }): IngestionLog => {
  const { db, clock } = deps;
  const seen: IngestionLog['seen'] = (h) =>
    !!db.get('SELECT 1 FROM ingestion_log WHERE body_hash = ?', [h]);
  const record: IngestionLog['record'] = (h, source, ref, outcome, expenseId, body) => {
    db.run(
      `INSERT INTO ingestion_log (id, source, source_ref, body_hash, expense_id, outcome, created_at, body)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId(), source, ref, h, expenseId, outcome, clock.now(), body],
    );
  };
  return { seen, record };
};
