import { makeSeededDb } from '../helpers/test-db';
import {
  findNearestNeighbor,
  writeEmbedding,
} from '../../src/services/categorizer/nn-search';

describe('nn-search', () => {
  it('finds the closest match by cosine', () => {
    const db = makeSeededDb();
    writeEmbedding(db, 'swiggy', 'cat-food', new Float32Array([1, 0, 0]));
    writeEmbedding(db, 'uber', 'cat-transport', new Float32Array([0, 1, 0]));
    writeEmbedding(db, 'amazon', 'cat-shopping', new Float32Array([0, 0, 1]));
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
