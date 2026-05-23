import type { Database } from '../../data/database';
import { createRuleCategorizer } from './rules';
import { findNearestNeighbor } from './nn-search';
import { UNCATEGORIZED_ID } from '../../data/seed/categories';
import type { Categorizer, CategorizerResult } from './index';
import type { Embedder } from './embedder';

export interface ChainedOptions {
  db: Database;
  embedder: Embedder;
  nnThreshold?: number;
}

export const createChainedCategorizer = (opts: ChainedOptions): Categorizer => {
  const rules = createRuleCategorizer({ db: opts.db });
  const threshold = opts.nnThreshold ?? 0.72;

  const categorize: Categorizer['categorize'] = (merchantNorm): CategorizerResult => {
    const ruleHit = rules.categorize(merchantNorm);
    if (ruleHit.source !== 'uncategorized') return ruleHit;
    if (!merchantNorm.trim()) return ruleHit;
    const q = opts.embedder.embed(merchantNorm);
    const nn = findNearestNeighbor(opts.db, q);
    if (nn && nn.similarity >= threshold) {
      return { categoryId: nn.categoryId, confidence: nn.similarity, source: 'ml_nn' };
    }
    return { categoryId: UNCATEGORIZED_ID, confidence: 0, source: 'uncategorized' };
  };

  return { categorize };
};
