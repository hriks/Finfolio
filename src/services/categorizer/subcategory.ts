import type { Database } from '../../data/database';
import { BUNDLED_SUBCATEGORY_HINTS } from '../../data/seed/subcategory-hints';

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
  if (row && row.c >= MIN_COUNT) return row.subcategory;
  return BUNDLED_SUBCATEGORY_HINTS[merchantNorm] ?? null;
};
