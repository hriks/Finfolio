import type { Database } from '../../data/database';
import { BUNDLED_SUBCATEGORY_HINTS } from '../../data/seed/subcategory-hints';

const MIN_COUNT = 2;

export const suggestSubcategory = (db: Database, merchantNorm: string | null): string | null => {
  if (!merchantNorm) return null;
  // Group case-insensitively so spelling variants (e.g. 'Grocery' / 'grocery') count as
  // one group toward MIN_COUNT. Within the winning group, surface the most frequent
  // original spelling, breaking ties by most recent occurrence.
  const row = db.get<{ subcategory: string; group_count: number }>(
    `SELECT spelling.subcategory AS subcategory, grp.group_count AS group_count
       FROM (
         SELECT LOWER(subcategory) AS norm_subcategory, COUNT(*) AS group_count, MAX(occurred_at) AS last_occurred_at
           FROM expenses
          WHERE merchant_norm = ?
            AND subcategory IS NOT NULL
            AND status != 'void'
          GROUP BY norm_subcategory
       ) AS grp
       JOIN (
         SELECT LOWER(subcategory) AS norm_subcategory, subcategory,
                COUNT(*) AS spelling_count, MAX(occurred_at) AS last_occurred_at
           FROM expenses
          WHERE merchant_norm = ?
            AND subcategory IS NOT NULL
            AND status != 'void'
          GROUP BY subcategory
       ) AS spelling ON spelling.norm_subcategory = grp.norm_subcategory
      ORDER BY grp.group_count DESC,
               grp.last_occurred_at DESC,
               spelling.spelling_count DESC,
               spelling.last_occurred_at DESC
      LIMIT 1`,
    [merchantNorm, merchantNorm],
  );
  if (row && row.group_count >= MIN_COUNT) return row.subcategory;
  return BUNDLED_SUBCATEGORY_HINTS[merchantNorm] ?? null;
};
