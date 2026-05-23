export interface Embedder {
  dim(): number;
  embed(text: string): Float32Array;
}

export class MockEmbedder implements Embedder {
  constructor(
    private map: Record<string, number[]>,
    private dimension: number,
  ) {}
  dim() {
    return this.dimension;
  }
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
