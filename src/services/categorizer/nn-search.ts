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

export const findNearestNeighbor = (db: Database, query: Float32Array): NeighborHit | null => {
  const rows = db.all<{
    merchant_norm: string;
    category_id: string;
    embedding: Buffer | Uint8Array;
  }>('SELECT merchant_norm, category_id, embedding FROM merchant_embeddings');
  let best: NeighborHit | null = null;
  for (const r of rows) {
    const buf = r.embedding instanceof Buffer ? r.embedding : Buffer.from(r.embedding);
    const v = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
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
