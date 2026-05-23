export const up_001_initial = `
CREATE TABLE IF NOT EXISTS expenses (
  id             TEXT PRIMARY KEY,
  amount_minor   INTEGER NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'INR',
  occurred_at    INTEGER NOT NULL,
  created_at     INTEGER NOT NULL,
  merchant_raw   TEXT,
  merchant_norm  TEXT,
  category_id    TEXT REFERENCES categories(id),
  source         TEXT NOT NULL,
  source_ref     TEXT,
  source_msg     TEXT,
  confidence     REAL NOT NULL DEFAULT 1.0,
  status         TEXT NOT NULL DEFAULT 'active',
  note           TEXT,
  photo_path     TEXT,
  dedup_key      TEXT,
  verified_by    INTEGER NOT NULL DEFAULT 1,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expenses_occurred ON expenses(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_status   ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_dedup    ON expenses(dedup_key);

CREATE TABLE IF NOT EXISTS categories (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL UNIQUE,
  icon      TEXT,
  color     TEXT,
  is_system INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS merchant_rules (
  id            TEXT PRIMARY KEY,
  merchant_norm TEXT NOT NULL,
  category_id   TEXT NOT NULL REFERENCES categories(id),
  origin        TEXT NOT NULL,
  weight        INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rules_lookup ON merchant_rules(merchant_norm, origin);

CREATE TABLE IF NOT EXISTS merchant_embeddings (
  merchant_norm TEXT PRIMARY KEY,
  category_id   TEXT NOT NULL REFERENCES categories(id),
  embedding     BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS budgets (
  id           TEXT PRIMARY KEY,
  period       TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  category_id  TEXT REFERENCES categories(id),
  alert_pct    TEXT NOT NULL DEFAULT '50,80,100',
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets(period, category_id);

CREATE TABLE IF NOT EXISTS budget_alert_state (
  budget_id  TEXT NOT NULL REFERENCES budgets(id),
  period_key TEXT NOT NULL,
  fired_pcts TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (budget_id, period_key)
);

CREATE TABLE IF NOT EXISTS ingestion_log (
  id         TEXT PRIMARY KEY,
  source     TEXT NOT NULL,
  source_ref TEXT,
  body_hash  TEXT NOT NULL,
  expense_id TEXT REFERENCES expenses(id),
  outcome    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ingestion_hash ON ingestion_log(body_hash);

CREATE TABLE IF NOT EXISTS backup_meta (
  id         TEXT PRIMARY KEY,
  drive_id   TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  kind       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  id   INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL
);
`;
