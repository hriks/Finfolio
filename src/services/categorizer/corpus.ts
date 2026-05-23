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
