import type { Database } from '../data/database';
import type { Clock } from '../data/clock';
import { newId } from '../data/ids';
import type { Expense, ExpenseSource, ExpenseStatus } from '../types/domain';
import { DELETE_WINDOW_MS } from '../types/domain';

const COLUMNS =
  'id, amount_minor, currency, occurred_at, created_at, updated_at, merchant_raw, merchant_norm, category_id, source, source_ref, source_msg, confidence, status, note, photo_path, dedup_key, verified_by, location_lat, location_lon, location_name, subcategory';

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
  source: r.source as ExpenseSource,
  sourceRef: (r.source_ref as string) ?? null,
  sourceMsg: (r.source_msg as string) ?? null,
  confidence: r.confidence as number,
  status: r.status as ExpenseStatus,
  note: (r.note as string) ?? null,
  photoPath: (r.photo_path as string) ?? null,
  dedupKey: (r.dedup_key as string) ?? null,
  verifiedBy: r.verified_by as number,
  locationLat: (r.location_lat as number | null) ?? null,
  locationLon: (r.location_lon as number | null) ?? null,
  locationName: (r.location_name as string | null) ?? null,
  subcategory: (r.subcategory as string | null) ?? null,
});

export interface InsertExpenseInput {
  amountMinor: number;
  currency?: string;
  occurredAt: number;
  merchantRaw: string | null;
  merchantNorm: string | null;
  categoryId: string | null;
  source: ExpenseSource;
  sourceRef?: string | null;
  sourceMsg?: string | null;
  confidence?: number;
  status?: ExpenseStatus;
  note?: string | null;
  photoPath?: string | null;
  dedupKey?: string | null;
  verifiedBy?: number;
  locationLat?: number | null;
  locationLon?: number | null;
  locationName?: string | null;
  subcategory?: string | null;
}

export interface ListOptions {
  includeVoid?: boolean;
  limit?: number;
  offset?: number;
}

export interface ExpenseService {
  insert(input: InsertExpenseInput): Expense;
  get(id: string): Expense | undefined;
  list(opts?: ListOptions): Expense[];
  setStatus(id: string, status: ExpenseStatus): Expense;
  delete(id: string): void;
  void(id: string): Expense;
  unvoid(id: string): Expense;
  canDelete(id: string): boolean;
  update(
    id: string,
    patch: Partial<
      Pick<
        Expense,
        | 'amountMinor'
        | 'occurredAt'
        | 'merchantRaw'
        | 'merchantNorm'
        | 'categoryId'
        | 'note'
        | 'photoPath'
        | 'confidence'
        | 'subcategory'
        | 'locationName'
        | 'locationLat'
        | 'locationLon'
      >
    >,
  ): Expense;
}

export const createExpenseService = (deps: { db: Database; clock: Clock }): ExpenseService => {
  const { db, clock } = deps;

  const get = (id: string): Expense | undefined => {
    const row = db.get<Record<string, unknown>>(`SELECT ${COLUMNS} FROM expenses WHERE id = ?`, [
      id,
    ]);
    return row ? rowToExpense(row) : undefined;
  };

  const insert: ExpenseService['insert'] = (input) => {
    const id = newId();
    const now = clock.now();
    db.run(
      `INSERT INTO expenses (${COLUMNS})
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        input.amountMinor,
        input.currency ?? 'INR',
        input.occurredAt,
        now,
        now,
        input.merchantRaw ?? null,
        input.merchantNorm ?? null,
        input.categoryId ?? null,
        input.source,
        input.sourceRef ?? null,
        input.sourceMsg ?? null,
        input.confidence ?? 1.0,
        input.status ?? 'active',
        input.note ?? null,
        input.photoPath ?? null,
        input.dedupKey ?? null,
        input.verifiedBy ?? 1,
        input.locationLat ?? null,
        input.locationLon ?? null,
        input.locationName ?? null,
        input.subcategory ?? null,
      ],
    );
    return get(id)!;
  };

  const list: ExpenseService['list'] = (opts = {}) => {
    const where = opts.includeVoid ? '' : "WHERE status != 'void'";
    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;
    const rows = db.all<Record<string, unknown>>(
      `SELECT ${COLUMNS} FROM expenses ${where} ORDER BY occurred_at DESC LIMIT ? OFFSET ?`,
      [limit, offset],
    );
    return rows.map(rowToExpense);
  };

  const setStatus: ExpenseService['setStatus'] = (id, status) => {
    const now = clock.now();
    const res = db.run('UPDATE expenses SET status = ?, updated_at = ? WHERE id = ?', [
      status,
      now,
      id,
    ]);
    if (res.changes === 0) throw new Error(`expense not found: ${id}`);
    return get(id)!;
  };

  const canDelete: ExpenseService['canDelete'] = (id) => {
    const e = get(id);
    if (!e) return false;
    return clock.now() - e.createdAt < DELETE_WINDOW_MS;
  };

  const del: ExpenseService['delete'] = (id) => {
    const e = get(id);
    // Pending-review rows can be deleted at any time (they haven't been
    // committed yet). Active rows still respect the 5-minute window.
    if (e?.status !== 'pending_review' && !canDelete(id)) {
      throw new Error('outside 5-minute delete window; use void instead');
    }
    // ingestion_log.expense_id is a FK to expenses(id); we keep the log row
    // (so re-sync drops the same SMS as dropped_dup by body_hash) but null
    // out the link before removing the expense.
    db.run('UPDATE ingestion_log SET expense_id = NULL WHERE expense_id = ?', [id]);
    db.run('DELETE FROM expenses WHERE id = ?', [id]);
  };

  const setVoid = (id: string, voided: boolean): Expense =>
    setStatus(id, voided ? 'void' : 'active');

  const update: ExpenseService['update'] = (id, patch) => {
    const allowed: Array<[keyof typeof patch, string]> = [
      ['amountMinor', 'amount_minor'],
      ['occurredAt', 'occurred_at'],
      ['merchantRaw', 'merchant_raw'],
      ['merchantNorm', 'merchant_norm'],
      ['categoryId', 'category_id'],
      ['note', 'note'],
      ['photoPath', 'photo_path'],
      ['confidence', 'confidence'],
      ['subcategory', 'subcategory'],
      ['locationName', 'location_name'],
      ['locationLat', 'location_lat'],
      ['locationLon', 'location_lon'],
    ];
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [k, col] of allowed) {
      if (k in patch) {
        sets.push(`${col} = ?`);
        values.push(patch[k] as unknown);
      }
    }
    if (sets.length === 0) {
      const existing = get(id);
      if (!existing) throw new Error(`expense not found: ${id}`);
      return existing;
    }
    sets.push('updated_at = ?');
    values.push(clock.now());
    values.push(id);
    const res = db.run(`UPDATE expenses SET ${sets.join(', ')} WHERE id = ?`, values);
    if (res.changes === 0) throw new Error(`expense not found: ${id}`);
    return get(id)!;
  };

  return {
    insert,
    get,
    list,
    setStatus,
    delete: del,
    void: (id) => setVoid(id, true),
    unvoid: (id) => setVoid(id, false),
    canDelete,
    update,
  };
};
