import { makeSeededDb } from '../helpers/test-db';
import { MockEmbedder } from '../../src/services/categorizer/embedder';
import { createChainedCategorizer } from '../../src/services/categorizer/chained';
import { writeEmbedding } from '../../src/services/categorizer/nn-search';
import {
  embedCorpus,
  isCorpusEmbedded,
  corpusEntries,
} from '../../src/services/categorizer/corpus';

const buildCat = () => {
  const db = makeSeededDb();
  // seed three corpus embeddings
  writeEmbedding(db, 'swiggy', 'cat-food', new Float32Array([1, 0, 0]));
  writeEmbedding(db, 'uber', 'cat-transport', new Float32Array([0, 1, 0]));
  writeEmbedding(db, 'amazon', 'cat-shopping', new Float32Array([0, 0, 1]));
  const embedder = new MockEmbedder(
    {
      'pizza palace': [1, 0, 0],
      'metro rides': [0, 1, 0],
      'random shop xyz': [0.4, 0.4, 0.4],
    },
    3,
  );
  const cat = createChainedCategorizer({ db, embedder, nnThreshold: 0.72 });
  return { db, cat };
};

describe('chained categorizer', () => {
  it('Stage 1 (user rule) short-circuits', () => {
    const { db, cat } = buildCat();
    db.run(
      "INSERT INTO merchant_rules (id, merchant_norm, category_id, origin, weight, created_at) VALUES ('u-1','pizza palace','cat-bills','user',10,0)",
    );
    expect(cat.categorize('pizza palace').source).toBe('user_rule');
  });
  it('Stage 2 (bundled exact) wins over ML', () => {
    const { cat } = buildCat();
    expect(cat.categorize('swiggy').source).toBe('bundled_rule');
  });
  it('Stage 3 (ML NN) catches unmapped merchants', () => {
    const { cat } = buildCat();
    const r = cat.categorize('pizza palace');
    expect(r.source).toBe('ml_nn');
    expect(r.categoryId).toBe('cat-food');
    expect(r.confidence).toBeGreaterThan(0.9);
  });
  it('Stage 4 (uncategorized) when similarity below threshold', () => {
    const { cat } = buildCat();
    const r = cat.categorize('random shop xyz');
    expect(r.source).toBe('uncategorized');
    expect(r.categoryId).toBe('cat-uncategorized');
  });
});

describe('corpus embedding', () => {
  it('embeds all corpus entries idempotently', () => {
    const db = makeSeededDb();
    const embedder = new MockEmbedder({}, 8);
    const n = embedCorpus(db, embedder);
    expect(n).toBe(corpusEntries.length);
    expect(isCorpusEmbedded(db)).toBe(true);
  });
});
