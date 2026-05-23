export interface CategorizerResult {
  categoryId: string;
  confidence: number;
  source: 'user_rule' | 'bundled_rule' | 'ml_nn' | 'uncategorized';
}

export interface Categorizer {
  categorize(merchantNorm: string): CategorizerResult;
}
