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
