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
