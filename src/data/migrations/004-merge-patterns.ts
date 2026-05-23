export const up_004_merge_patterns = `
CREATE TABLE IF NOT EXISTS merge_patterns (
  merchant_norm TEXT NOT NULL,
  counterpart TEXT NOT NULL,
  counterpart_kind TEXT NOT NULL,
  seen_count INTEGER NOT NULL DEFAULT 0,
  last_seen_at INTEGER NOT NULL,
  median_delay_ms INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (merchant_norm, counterpart)
);
CREATE INDEX IF NOT EXISTS merge_patterns_counterpart ON merge_patterns(counterpart);
`;
