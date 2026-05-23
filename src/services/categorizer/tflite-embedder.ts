import { loadTensorflowModel, type TensorflowModel } from 'react-native-fast-tflite';
import type { Embedder } from './embedder';

const MODEL_DIM = 384;

export class TFLiteEmbedder implements Embedder {
  private model: TensorflowModel | null = null;

  private constructor() {}

  static async load(modelAsset: number): Promise<TFLiteEmbedder> {
    const inst = new TFLiteEmbedder();
    inst.model = await loadTensorflowModel({ url: modelAsset } as never, []);
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
