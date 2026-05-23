export type ExpenseStatus = 'active' | 'void' | 'pending_review';
export type ExpenseSource = 'sms' | 'notification' | 'manual' | 'ocr' | 'merged';

export interface Expense {
  id: string;
  amountMinor: number;
  currency: string;
  occurredAt: number;
  createdAt: number;
  updatedAt: number;
  merchantRaw: string | null;
  merchantNorm: string | null;
  categoryId: string | null;
  source: ExpenseSource;
  sourceRef: string | null;
  sourceMsg: string | null;
  confidence: number;
  status: ExpenseStatus;
  note: string | null;
  photoPath: string | null;
  dedupKey: string | null;
  verifiedBy: number;
  locationLat: number | null;
  locationLon: number | null;
  locationName: string | null;
  subcategory: string | null;
}

export interface Category {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  isSystem: boolean;
}

export const DELETE_WINDOW_MS = 5 * 60 * 1000;
export const AUTO_CONFIRM_CONFIDENCE = 0.85;
