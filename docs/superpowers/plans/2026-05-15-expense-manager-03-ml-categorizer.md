# Expense Manager — Plan 3: ML Categorizer

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Add Stage 3 to the categorizer — TFLite sentence embedder + nearest-neighbor lookup against a bundled merchant corpus — and wire it into a chained Categorizer that goes user-rules → bundled-rules → ML → Uncategorized.

**Architecture:** Embedder is an interface. Tests use a `MockEmbedder` that returns deterministic vectors from a JSON map. Production uses `react-native-fast-tflite`. Embeddings for the bundled corpus are precomputed once at install (worker) and stored in `merchant_embeddings`. NN search is brute-force cosine.

**Tech Stack:** Plan 1–2 stack + `react-native-fast-tflite` (loaded but not exercised here — type-only).

---

## File structure

```
src/services/categorizer/
├── index.ts                       (existing — extend with chained Categorizer)
├── rules.ts                       (existing)
├── embedder.ts                    (interface + MockEmbedder)
├── tflite-embedder.ts             (production impl; device-only)
├── nn-search.ts                   (cosine NN search)
├── chained.ts                     (Stage 1+2+3+4 chain)
└── corpus.ts                      (loads bundled merchant→category corpus)

src/assets/
└── merchants-corpus.json          (200 starter entries; can grow)

__tests__/services/
├── categorizer-embedder.test.ts
├── categorizer-nn.test.ts
└── categorizer-chained.test.ts
```

---

## Task 1 — Embedder interface + MockEmbedder

- [ ] Create `src/services/categorizer/embedder.ts`:
```typescript
export interface Embedder {
  dim(): number;
  embed(text: string): Float32Array;
}

export class MockEmbedder implements Embedder {
  constructor(private map: Record<string, number[]>, private dimension: number) {}
  dim() { return this.dimension; }
  embed(text: string): Float32Array {
    const v = this.map[text.toLowerCase()];
    if (v) return Float32Array.from(v);
    // deterministic hash fallback so unknown strings still return a vector
    const out = new Float32Array(this.dimension);
    for (let i = 0; i < text.length; i++) {
      out[i % this.dimension] += text.charCodeAt(i);
    }
    // l2 normalize
    let s = 0;
    for (const x of out) s += x * x;
    const n = Math.sqrt(s) || 1;
    for (let i = 0; i < out.length; i++) out[i] /= n;
    return out;
  }
}
```

- [ ] Create `__tests__/services/categorizer-embedder.test.ts`:
```typescript
import { MockEmbedder } from '../../src/services/categorizer/embedder';

describe('MockEmbedder', () => {
  it('returns mapped vectors verbatim', () => {
    const m = new MockEmbedder({ swiggy: [1, 0, 0] }, 3);
    expect(Array.from(m.embed('swiggy'))).toEqual([1, 0, 0]);
  });
  it('returns deterministic l2-normalized fallback for unknown', () => {
    const m = new MockEmbedder({}, 4);
    const a = m.embed('unknown');
    const b = m.embed('unknown');
    expect(Array.from(a)).toEqual(Array.from(b));
    let s = 0;
    for (const x of a) s += x * x;
    expect(s).toBeCloseTo(1, 5);
  });
});
```

- [ ] Run tests — 2 passing.
- [ ] Commit: `feat(categorizer): embedder interface + mock`.

---

## Task 2 — NN search against `merchant_embeddings`

- [ ] Create `src/services/categorizer/nn-search.ts`:
```typescript
import type { Database } from '../../data/database';

const cosine = (a: Float32Array, b: Float32Array): number => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
};

export interface NeighborHit {
  merchantNorm: string;
  categoryId: string;
  similarity: number;
}

export const findNearestNeighbor = (
  db: Database,
  query: Float32Array,
): NeighborHit | null => {
  const rows = db.all<{ merchant_norm: string; category_id: string; embedding: Buffer | Uint8Array }>(
    'SELECT merchant_norm, category_id, embedding FROM merchant_embeddings',
  );
  let best: NeighborHit | null = null;
  for (const r of rows) {
    const buf = r.embedding instanceof Buffer ? r.embedding : Buffer.from(r.embedding);
    const v = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    const s = cosine(query, v);
    if (!best || s > best.similarity) {
      best = { merchantNorm: r.merchant_norm, categoryId: r.category_id, similarity: s };
    }
  }
  return best;
};

export const writeEmbedding = (
  db: Database,
  merchantNorm: string,
  categoryId: string,
  embedding: Float32Array,
): void => {
  const buf = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
  db.run(
    `INSERT OR REPLACE INTO merchant_embeddings (merchant_norm, category_id, embedding) VALUES (?, ?, ?)`,
    [merchantNorm, categoryId, buf],
  );
};
```

- [ ] Test `__tests__/services/categorizer-nn.test.ts`:
```typescript
import { makeSeededDb } from '../helpers/test-db';
import { findNearestNeighbor, writeEmbedding } from '../../src/services/categorizer/nn-search';

describe('nn-search', () => {
  it('finds the closest match by cosine', () => {
    const db = makeSeededDb();
    writeEmbedding(db, 'swiggy',  'cat-food',      new Float32Array([1, 0, 0]));
    writeEmbedding(db, 'uber',    'cat-transport', new Float32Array([0, 1, 0]));
    writeEmbedding(db, 'amazon',  'cat-shopping',  new Float32Array([0, 0, 1]));
    const hit = findNearestNeighbor(db, new Float32Array([0.9, 0.1, 0]));
    expect(hit?.merchantNorm).toBe('swiggy');
    expect(hit?.categoryId).toBe('cat-food');
    expect(hit?.similarity).toBeGreaterThan(0.99);
  });

  it('returns null on empty corpus', () => {
    const db = makeSeededDb();
    expect(findNearestNeighbor(db, new Float32Array([1, 0]))).toBeNull();
  });
});
```

- [ ] Run — 2 passing.
- [ ] Commit: `feat(categorizer): NN cosine search`.

---

## Task 3 — Chained categorizer (Stages 1 → 4)

- [ ] Create `src/services/categorizer/chained.ts`:
```typescript
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
```

- [ ] Test `__tests__/services/categorizer-chained.test.ts`:
```typescript
import { makeSeededDb } from '../helpers/test-db';
import { MockEmbedder } from '../../src/services/categorizer/embedder';
import { createChainedCategorizer } from '../../src/services/categorizer/chained';
import { writeEmbedding } from '../../src/services/categorizer/nn-search';

const buildCat = () => {
  const db = makeSeededDb();
  // seed three corpus embeddings
  writeEmbedding(db, 'swiggy', 'cat-food', new Float32Array([1, 0, 0]));
  writeEmbedding(db, 'uber',   'cat-transport', new Float32Array([0, 1, 0]));
  writeEmbedding(db, 'amazon', 'cat-shopping',  new Float32Array([0, 0, 1]));
  const embedder = new MockEmbedder({
    'pizza palace':    [1, 0, 0],
    'metro rides':     [0, 1, 0],
    'random shop xyz': [0.4, 0.4, 0.4],
  }, 3);
  const cat = createChainedCategorizer({ db, embedder, nnThreshold: 0.72 });
  return { db, cat };
};

describe('chained categorizer', () => {
  it('Stage 1 (user rule) short-circuits', () => {
    const { db, cat } = buildCat();
    db.run("INSERT INTO merchant_rules (id, merchant_norm, category_id, origin, weight, created_at) VALUES ('u-1','pizza palace','cat-bills','user',10,0)");
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
```

- [ ] Run — 4 passing.
- [ ] Commit: `feat(categorizer): chained user→bundled→ML→uncategorized`.

---

## Task 4 — Corpus loader and precompute helper

- [ ] Create `src/assets/merchants-corpus.json` (start small; expand later):
```json
[
  { "merchant": "pizza hut",          "categoryId": "cat-food" },
  { "merchant": "burger king",        "categoryId": "cat-food" },
  { "merchant": "haldirams",          "categoryId": "cat-food" },
  { "merchant": "chai point",         "categoryId": "cat-food" },
  { "merchant": "starbucks",          "categoryId": "cat-food" },
  { "merchant": "metro railway",      "categoryId": "cat-transport" },
  { "merchant": "irctc",              "categoryId": "cat-transport" },
  { "merchant": "indigo airlines",    "categoryId": "cat-transport" },
  { "merchant": "vistara",            "categoryId": "cat-transport" },
  { "merchant": "fastrack",           "categoryId": "cat-shopping" },
  { "merchant": "lifestyle stores",   "categoryId": "cat-shopping" },
  { "merchant": "ikea",               "categoryId": "cat-shopping" },
  { "merchant": "decathlon",          "categoryId": "cat-shopping" },
  { "merchant": "reliance trends",    "categoryId": "cat-shopping" },
  { "merchant": "act fibernet",       "categoryId": "cat-bills" },
  { "merchant": "airtel xstream",     "categoryId": "cat-bills" },
  { "merchant": "bsnl",               "categoryId": "cat-bills" },
  { "merchant": "lic premium",        "categoryId": "cat-insurance" },
  { "merchant": "policybazaar",       "categoryId": "cat-insurance" },
  { "merchant": "apollo pharmacy",    "categoryId": "cat-health" },
  { "merchant": "1mg",                "categoryId": "cat-health" },
  { "merchant": "pharmeasy",          "categoryId": "cat-health" },
  { "merchant": "practo",             "categoryId": "cat-health" },
  { "merchant": "fortis hospital",    "categoryId": "cat-health" },
  { "merchant": "byjus",              "categoryId": "cat-education" },
  { "merchant": "unacademy",          "categoryId": "cat-education" },
  { "merchant": "coursera",           "categoryId": "cat-education" },
  { "merchant": "udemy",              "categoryId": "cat-education" },
  { "merchant": "mutual fund",        "categoryId": "cat-investments" },
  { "merchant": "groww",              "categoryId": "cat-investments" },
  { "merchant": "zerodha",            "categoryId": "cat-investments" },
  { "merchant": "smallcase",          "categoryId": "cat-investments" },
  { "merchant": "make my trip",       "categoryId": "cat-travel" },
  { "merchant": "yatra",              "categoryId": "cat-travel" },
  { "merchant": "goibibo",            "categoryId": "cat-travel" },
  { "merchant": "oyo rooms",          "categoryId": "cat-travel" },
  { "merchant": "trivago",            "categoryId": "cat-travel" },
  { "merchant": "atm withdrawal",     "categoryId": "cat-atm" },
  { "merchant": "imps transfer",      "categoryId": "cat-transfer" },
  { "merchant": "neft transfer",      "categoryId": "cat-transfer" }
]
```

- [ ] Create `src/services/categorizer/corpus.ts`:
```typescript
import type { Database } from '../../data/database';
import type { Embedder } from './embedder';
import { writeEmbedding } from './nn-search';
import corpus from '../../assets/merchants-corpus.json';

export const corpusEntries = corpus as Array<{ merchant: string; categoryId: string }>;

export const isCorpusEmbedded = (db: Database): boolean => {
  const row = db.get<{ c: number }>('SELECT COUNT(*) AS c FROM merchant_embeddings');
  return (row?.c ?? 0) >= corpusEntries.length;
};

export const embedCorpus = (db: Database, embedder: Embedder): number => {
  let written = 0;
  db.transaction(() => {
    for (const entry of corpusEntries) {
      const v = embedder.embed(entry.merchant);
      writeEmbedding(db, entry.merchant, entry.categoryId, v);
      written++;
    }
  });
  return written;
};
```

- [ ] Test in `__tests__/services/categorizer-chained.test.ts` — append:
```typescript
import { embedCorpus, isCorpusEmbedded, corpusEntries } from '../../src/services/categorizer/corpus';

describe('corpus embedding', () => {
  it('embeds all corpus entries idempotently', () => {
    const db = makeSeededDb();
    const embedder = new MockEmbedder({}, 8);
    const n = embedCorpus(db, embedder);
    expect(n).toBe(corpusEntries.length);
    expect(isCorpusEmbedded(db)).toBe(true);
  });
});
```

Modify `tsconfig.json` if needed to enable `resolveJsonModule` and `esModuleInterop`. (RN's default tsconfig already has both, but verify.)

- [ ] Run — 1 new test passing.
- [ ] Commit: `feat(categorizer): bundled corpus loader + precompute helper`.

---

## Task 5 — TFLiteEmbedder production impl (compile-only)

- [ ] Install package:
```bash
npm install react-native-fast-tflite
```

- [ ] Create `src/services/categorizer/tflite-embedder.ts`:
```typescript
import { loadTensorflowModel, type TensorflowModel } from 'react-native-fast-tflite';
import type { Embedder } from './embedder';

const MODEL_DIM = 384;

export class TFLiteEmbedder implements Embedder {
  private model: TensorflowModel | null = null;

  private constructor() {}

  static async load(modelAsset: number): Promise<TFLiteEmbedder> {
    const inst = new TFLiteEmbedder();
    inst.model = await loadTensorflowModel({ url: modelAsset } as never);
    return inst;
  }

  dim(): number {
    return MODEL_DIM;
  }

  embed(_text: string): Float32Array {
    if (!this.model) throw new Error('TFLiteEmbedder not loaded');
    // Sentence-embedder TFLite models typically accept a tokenized
    // input tensor and emit a [1 x dim] embedding. The exact input
    // shape depends on the model file we ship. This is a placeholder
    // signature; the wiring is finalized when the model file lands.
    throw new Error('TFLiteEmbedder.embed: model wiring deferred until model asset is bundled');
  }
}
```

This file is intentionally stub-y on the actual `embed`: the production model file is bundled separately and the tokenization pipeline depends on its exact architecture. The type-clean wrapper exists so the app compiles and any non-ML code can depend on `Embedder`.

- [ ] Typecheck must pass: `npm run typecheck`.
- [ ] Commit: `feat(categorizer): TFLiteEmbedder type-clean shell`.

---

## Task 6 — Full sweep

- [ ] `npm test -- --coverage` — expect all passing.
- [ ] `npm run format && npm run lint && npm run typecheck` — all clean.
- [ ] Commit any format drift: `chore: format pass`.
