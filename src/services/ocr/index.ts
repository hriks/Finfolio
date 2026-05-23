import type { ReceiptDraft } from './parse-receipt';

export interface OcrSource {
  uri: string;
}

export interface OcrService {
  scan(source: OcrSource): Promise<ReceiptDraft | null>;
}
