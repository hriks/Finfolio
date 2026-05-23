import TextRecognition from '@react-native-ml-kit/text-recognition';
import { parseReceiptText } from './parse-receipt';
import type { OcrService, OcrSource } from './index';

export const createMlKitOcr = (): OcrService => ({
  async scan(source: OcrSource) {
    const result = await TextRecognition.recognize(source.uri);
    return parseReceiptText(result.text);
  },
});
