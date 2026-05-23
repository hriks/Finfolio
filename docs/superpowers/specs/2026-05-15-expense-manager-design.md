# Expense Manager — Design

**Date:** 2026-05-15
**Scope:** Android-only, sideloaded (no Play Store).
**Goal:** Track expenses from SMS + app notifications, locally on device, with manual entry, receipt OCR, charts, budgets, and Google Drive backup. No backend.

A separate Play Store edition will be built later from the same codebase, with the ingestion source swapped behind the existing interfaces.

---

## 1. Decisions summary

| Area | Choice |
|---|---|
| Toolchain | Bare React Native CLI |
| Storage | SQLite via `op-sqlite` |
| SMS parsing | TRAI-suffix routing → curated rules → heuristic fallback → review queue |
| Categorization | User rules > bundled rules > TFLite embedding + nearest-neighbor > Uncategorized |
| Capture | Photo attach + ML Kit receipt OCR |
| Drive backup | Manual + scheduled auto (Wi-Fi/battery-aware), last 7 versions, `appDataFolder` |
| Charts | `react-native-gifted-charts` |
| Real-time SMS | `BroadcastReceiver` → Headless JS |
| SMS history scan | Kotlin `CoroutineWorker` (WorkManager), batched dispatch to Headless JS |
| Notification ingestion | `NotificationListenerService` (one-time Settings toggle by user) |
| Dedup | `(amount, ±2 min, normalized merchant/sender)` fuzzy merge |
| Delete | Hard delete within 5 min (no recovery); "Void" toggle after |
| Budgets | Overall only for v1; day/week/month/year; per-category later |
| Budget alerts | Local notifications at user-configurable thresholds |
| Navigation | Bottom tabs (Home / Expenses / + / Insights / Settings) |
| State | Zustand + `@tanstack/react-query` |
| Backup encryption | AES-GCM with Android Keystore key + user recovery passphrase |

---

## 2. Architecture & module boundaries

Three layers; native is thin and only ingests events; all business logic lives in JS.

```
┌──────────────────────── React Native (JS) ────────────────────────┐
│  UI (screens, charts)                                              │
│  Hooks / state (Zustand + React Query)                             │
│  Services                                                          │
│   ├── ExpenseService     (CRUD, 5-min delete, void)                │
│   ├── ParserService      (SMS + notification → expense draft)      │
│   ├── DedupService       (fuzzy merge incoming drafts)             │
│   ├── CategorizerService (rules → ML, learn-from-edits)            │
│   ├── BudgetService      (rollups, threshold alerts)               │
│   ├── BackupService      (db + photos → Drive appDataFolder)       │
│   └── OcrService         (ML Kit text recognition)                 │
│  Data layer (op-sqlite, migrations, files)                         │
└────────────────────────────────────────────────────────────────────┘
          ▲ Headless JS                          ▲ JSI
┌──────── Native (Kotlin) ───────────────────────────────────────────┐
│  SmsReceiver (BroadcastReceiver)                                   │
│  InboxScanWorker (CoroutineWorker)                                 │
│  ExpenseNotificationListener (NotificationListenerService)         │
│  BootReceiver                                                      │
└────────────────────────────────────────────────────────────────────┘
```

**Boundary rules**

- Native does ingestion only; it hands raw `{source, ref, body, ts}` events to JS. Zero parsing or DB writes in Kotlin.
- Services are stateless and dependency-injected (DB handle, clock, embedder). Easy to unit test.
- Parser and Categorizer are interface-driven — Play Store edition swaps SMS/notification sources without touching anything else.

---

## 3. Data model (SQLite)

```sql
-- Core ledger
CREATE TABLE expenses (
  id              TEXT PRIMARY KEY,            -- uuid
  amount_minor    INTEGER NOT NULL,            -- paise (₹1 = 100)
  currency        TEXT NOT NULL DEFAULT 'INR',
  occurred_at     INTEGER NOT NULL,            -- unix ms, transaction time
  created_at      INTEGER NOT NULL,            -- unix ms, DB insert time; 5-min clock uses this
  merchant_raw    TEXT,
  merchant_norm   TEXT,                        -- lowercased, stripped
  category_id     TEXT REFERENCES categories(id),
  source          TEXT NOT NULL,               -- 'sms' | 'notification' | 'manual' | 'ocr' | 'merged'
  source_ref      TEXT,                        -- sender id, package name, or null
  source_msg      TEXT,                        -- raw text (audit)
  confidence      REAL NOT NULL DEFAULT 1.0,
  status          TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'void' | 'pending_review'
  note            TEXT,
  photo_path      TEXT,
  dedup_key       TEXT,                        -- amount|sender_bucket|minute_bucket
  verified_by     INTEGER NOT NULL DEFAULT 1,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_expenses_occurred ON expenses(occurred_at DESC);
CREATE INDEX idx_expenses_status   ON expenses(status);
CREATE INDEX idx_expenses_dedup    ON expenses(dedup_key);

CREATE TABLE categories (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL UNIQUE,
  icon      TEXT,
  color     TEXT,
  is_system INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE merchant_rules (
  id            TEXT PRIMARY KEY,
  merchant_norm TEXT NOT NULL,
  category_id   TEXT NOT NULL REFERENCES categories(id),
  origin        TEXT NOT NULL,                 -- 'bundled' | 'user'
  weight        INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_rules_lookup ON merchant_rules(merchant_norm, origin);

CREATE TABLE merchant_embeddings (
  merchant_norm TEXT PRIMARY KEY,
  category_id   TEXT NOT NULL REFERENCES categories(id),
  embedding     BLOB NOT NULL                  -- float32[384]
);

CREATE TABLE budgets (
  id           TEXT PRIMARY KEY,
  period       TEXT NOT NULL,                  -- 'day' | 'week' | 'month' | 'year'
  amount_minor INTEGER NOT NULL,
  category_id  TEXT REFERENCES categories(id), -- NULL = overall
  alert_pct    TEXT NOT NULL DEFAULT '50,80,100',
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_budgets_period ON budgets(period, category_id);

CREATE TABLE budget_alert_state (
  budget_id    TEXT NOT NULL REFERENCES budgets(id),
  period_key   TEXT NOT NULL,                  -- e.g. '2026-05' for monthly
  fired_pcts   TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (budget_id, period_key)
);

CREATE TABLE ingestion_log (
  id          TEXT PRIMARY KEY,
  source      TEXT NOT NULL,
  source_ref  TEXT,
  body_hash   TEXT NOT NULL,                   -- sha1(source+ref+body); idempotency
  expense_id  TEXT REFERENCES expenses(id),
  outcome     TEXT NOT NULL,                   -- 'inserted'|'merged'|'dropped_promo'|'dropped_no_parse'|'dropped_dup'|'dropped_error'
  created_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_ingestion_hash ON ingestion_log(body_hash);

CREATE TABLE backup_meta (
  id         TEXT PRIMARY KEY,
  drive_id   TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  kind       TEXT NOT NULL                     -- 'manual' | 'auto'
);

CREATE TABLE settings (
  id   INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL                           -- JSON blob
);
```

**Notes**

- Amounts stored as integer paise; never floats.
- `occurred_at` ≠ `created_at`; 5-min delete uses `created_at` only.
- Schema version tracked via `PRAGMA user_version`; migrations are additive.

---

## 4. Ingestion pipeline

Three entry points (real-time SMS, real-time notification, one-shot inbox scan) converge on a single JS pipeline.

```
JS: IngestionPipeline.process(event):

  1. body_hash = sha1(source + ref + body)
     └─ already in ingestion_log → 'dropped_dup', return

  2. ParserService.parse(event)
     ├─ SMS:      TRAI-suffix filter → curated rule → heuristic
     └─ Notif:    per-package rule (uber/rapido/swiggy/ola/...)
     returns { draft, confidence } or null

  3. null draft → log 'dropped_promo' or 'dropped_no_parse'

  4. DedupService.findMatch(draft)
     SELECT … FROM expenses WHERE dedup_key=? AND created_at > now-5min
     ├─ match → merge (prefer SMS amount, notification merchant);
     │           verified_by += 1; status may auto-promote to 'active';
     │           log 'merged'
     └─ none  → continue

  5. CategorizerService.categorize(draft.merchant_norm)
     writes category_id + confidence

  6. status =
       'pending_review' if confidence < 0.85 AND verified_by = 1
       'active'         otherwise

  7. ExpenseService.insert(draft) → expense_id
     log 'inserted'

  8. BudgetService.recompute() → fire local notification if a threshold crossed
```

**SMS parser internals**

- Extract TRAI suffix (`-T`/`-S`/`-P`/`-G`); drop `-P` and most `-S`.
- `senderStem(sender)` → match curated rule table.
- Fallback heuristic looks for currency symbol, amount pattern, debit/credit keywords.
- Curated rules ship with the app; updateable via app update.

**Notification parser internals**

- Per-package regex on `title + text`. Apps with no rule are ignored entirely (no heuristic; too noisy).

**Dedup key**

`amount_minor | senderBucket(source_ref) | minuteBucket(occurred_at, 2)`
`senderBucket` collapses bank-stem variants and merchant package names to a coarse family. Index lookup; O(1) practical cost.

**Merge on dedup hit**

```
amount_minor   ← SMS (banks send exact amount)
merchant_norm  ← notification (apps send cleaner names)
occurred_at    ← earlier of the two
source_msg     ← concatenated
source         ← 'merged'
verified_by    += 1   (≥ 2 → auto-confirm)
```

**Real-time SMS path**

`SmsReceiver` (`BroadcastReceiver` on `SMS_RECEIVED`, priority 999) → Headless JS dispatch. ~1s per event.

**Notification path**

`ExpenseNotificationListener` extends `NotificationListenerService`. Filtered by an allowlist of package names (uber, rapido, ola, swiggy, etc.) before dispatch.

**One-shot SMS inbox scan (background)**

```
InboxScanWorker (androidx.work.CoroutineWorker):
  - reads SMS via ContentResolver in batches of 200
  - per batch: dispatch Headless JS with the batch
  - JS wraps the batch in a single SQLite transaction
  - posts a progress notification
  - persists last-scanned _id between batches (resumable)
  - cancellable from Settings
```

Triggered on first launch (default 6 months) and on demand. Idempotent via `ingestion_log.body_hash`. WorkManager defers under Doze/low battery.

**Notification history**: not available from Android; ingestion is real-time only.

**Failure isolation**

- Parser/categorizer errors caught and logged as `dropped_error`; pipeline never crashes a receiver.
- DB write failure → one immediate retry; second failure surfaced in Settings → "Ingestion issues."
- Headless JS time budget (~30s) is generous; per-event work is well under 1s.

---

## 5. Categorization

`CategorizerService.categorize(merchantNorm) → { categoryId, confidence, source }` with four stages:

1. **User rules** (exact match, `origin='user'`) — confidence 1.0.
2. **Bundled rules** (exact, then substring `LIKE`) — confidence 0.95.
3. **Embedding + nearest neighbor** — `TFLiteEmbedder.embed(text)`; brute-force cosine over `merchant_embeddings`; top-1 above threshold (0.72) wins, confidence = similarity score.
4. **Uncategorized** — system category, confidence 0.

**Embedding model**

- `paraphrase-multilingual-MiniLM-L12-v2`, INT8-quantized (~50 MB).
- Native binding: `react-native-fast-tflite`.
- 384-dim float vector.

**Bundled corpus**

- ~8–12k labeled merchants × ~20 categories (Food, Transport, Shopping, Bills, Entertainment, Health, Travel, Education, Groceries, Personal Care, Fuel, Subscriptions, Investments, Salary, Refund, ATM, Transfer, Rent, Insurance, Uncategorized).
- Shipped as `assets/merchants.csv` (~200 KB).
- Embeddings precomputed on first launch via WorkManager job (~30s on mid-range), written to `merchant_embeddings` (~18 MB). Idempotent and versioned with the model file.

**Brute-force NN**

- 12k × 384 cosine ≈ 5–15 ms per query. No ANN index needed for v1. Swap-in point if corpus grows past ~30k.

**Learn-from-edits**

On user re-categorization:
1. Update the expense.
2. `INSERT OR REPLACE INTO merchant_rules (..., origin='user', weight=10)`.
3. Offer "Apply to 3 other Swiggy entries from this month?" — bounded to 90 days and matching old category.

**Confidence threshold**

- Auto-confirm at ≥ 0.85; below → `pending_review` (shown in Home review inbox).
- Threshold is a setting; default 0.85.

**Failure modes**

- Model missing/corrupt → fall through to Uncategorized; Settings banner offers repair (re-extract from APK assets).
- Embedding throws → same fallthrough.

---

## 6. Backup & restore

Backup unit:

```
expense-manager-backup-YYYYMMDD-HHmm.zip  (AES-GCM encrypted)
  ├── expense-manager.db
  ├── photos/<expense_id>.jpg
  ├── meta.json   { schema_version, app_version, device_id, created_at }
  └── checksum.txt   sha256 over the above
```

**Auth**

- `@react-native-google-signin/google-signin`.
- Scope: `https://www.googleapis.com/auth/drive.appdata` only (private folder, deleted on uninstall).

**Encryption**

- AES-256-GCM key generated on first backup, stored in **Android Keystore** (hardware-backed where available).
- User sets a **recovery passphrase** on first backup. Argon2id-derived key wraps the data key inside `meta.json`. Restoring on a new device requires the passphrase.
- Encryption is **on by default**. Settings → Backup → "Encrypt backups" can be toggled off (warning shown); without encryption the recovery-passphrase step is skipped during onboarding.

**Triggers**

- Manual from Settings.
- Auto periodic WorkManager job, every 24h, with `NetworkType.UNMETERED + requiresBatteryNotLow`.
- Pre-restore safety backup runs unconditionally.

**Backup flow**

1. Acquire DB write lock; `PRAGMA wal_checkpoint(FULL)`.
2. Stream zip into `cacheDir`; write `checksum.txt`.
3. AES-GCM encrypt with data key (wrapped key written to `meta.json`).
4. Resumable upload to Drive `appDataFolder`.
5. Insert `backup_meta` row.
6. Prune to last 7; delete older via Drive API.
7. Release lock.

**Restore flow**

1. Destructive-confirmation modal.
2. Pre-restore safety auto-backup.
3. Download zip; verify checksum.
4. Unwrap key using passphrase; decrypt.
5. Validate `schema_version ≤ current` (newer → abort, ask user to update app; older → run migrations after restore).
6. Acquire DB lock, close handle.
7. Atomic replace: write `<db>.new`, fsync, rename.
8. Restore photos; reopen DB; run migrations; clear caches; force UI reload.
9. On any failure, staged files deleted; original DB untouched.

**Auto-backup scheduling**

- Skipped if Wi-Fi unavailable or battery low.
- Stale banner on Home after 48h without success: "Last backup 3 days ago — connect to Wi-Fi to back up."
- User can toggle off / daily / weekly and "back up on any network."

**Multi-device defense**

- Backups tagged with `device_id`.
- If cloud has newer backup from an unrecognized device, auto-backup skips and prompts; manual override always allowed.

**Failure surfaces**

- Mid-upload network failure → resumable session resumes next run.
- Quota exceeded / OAuth revoked → Settings banner with single-tap remediation.
- Checksum mismatch on restore → abort with explicit error.

---

## 7. UI shell, permissions, lifecycle

### Navigation

Bottom-tab navigator with five tabs: Home, Expenses, ＋ (modal), Insights, Settings.

- **Home** — today summary, current-period budget bar, pending-review inbox, last-backup banner if stale, recent 5 expenses.
- **Expenses** — infinite list, day-grouped, filters (date, category, source, status), search.
- **＋ FAB** — Manual entry / Scan receipt (OCR) / Quick photo.
- **Insights** — pie by category, bar by day/week, line trend, budget vs actual.
- **Settings** — permissions status, backup, budgets, categories, parsers/rules, ML model status, advanced (thresholds, export raw db).
- **Expense detail** — fields + Delete (only if `now - created_at < 5 min`) or Void/Unvoid toggle; raw source text collapsible; edit history.

State: Zustand stores + `@tanstack/react-query` for SQLite-backed queries (cache + invalidation).
Theming: small token files; system dark mode with explicit toggle.

### Onboarding wizard (first launch)

1. Welcome.
2. Notifications (POST_NOTIFICATIONS, Android 13+) — runtime prompt.
3. SMS (READ_SMS, RECEIVE_SMS) — runtime prompt; deny → Home banner offers retry.
4. Notification Listener — deep-link `ACTION_NOTIFICATION_LISTENER_SETTINGS`; verify via `NotificationManagerCompat.getEnabledListenerPackages` on resume.
5. Battery optimization exemption — deep-link `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`.
6. One-shot inbox scan (default 6 months) — runs in background worker.
7. Backup — Google Sign-In → recovery passphrase → first backup.
8. Done → Home.

Subsequent launches skip the wizard; permission gaps surface as dismissible banners on Home.

### Background lifecycle

- `BroadcastReceiver` and `NotificationListenerService` are manifest-registered; OS wakes the app for them.
- `BootReceiver` re-enqueues the WorkManager periodic backup job (defensive; WorkManager already persists).
- No always-on foreground service. The app stays cold-startable.

### File structure

```
expense-manager/
├── android/                     # Kotlin
│   └── app/src/main/java/com/expensemanager/
│       ├── MainApplication.kt
│       ├── ingestion/
│       │   ├── SmsReceiver.kt
│       │   ├── InboxScanWorker.kt
│       │   ├── ExpenseNotificationListener.kt
│       │   └── HeadlessIngestionTask.kt
│       └── BootReceiver.kt
├── src/
│   ├── app/
│   │   ├── navigation.tsx
│   │   └── screens/{home,expenses,detail,add,insights,settings}/
│   ├── services/
│   │   ├── expense.ts
│   │   ├── parser/{index.ts,sms.ts,notification.ts,rules/...}
│   │   ├── dedup.ts
│   │   ├── categorizer/{index.ts,embedder.ts,rules.ts}
│   │   ├── budget.ts
│   │   ├── backup.ts
│   │   └── ocr.ts
│   ├── data/
│   │   ├── db.ts
│   │   └── migrations/
│   ├── assets/
│   │   ├── model/                # TFLite file
│   │   └── merchants.csv
│   ├── ui/
│   └── ingestion-task.ts         # Headless JS entry
├── __tests__/
└── package.json
```

---

## 8. Testing

- **Unit (jest, pure JS):**
  - `parser/sms.ts` — corpus of 200+ anonymized real bank SMS, positive and negative.
  - `dedup.ts` — exhaustive cases (exact, near-window, no match, both sources, void).
  - `categorizer/rules.ts` and the precedence chain (mock embedder for Stage 3).
  - `expense.ts` — 5-min delete window and void semantics (`jest.useFakeTimers`).
  - `budget.ts` — rollups across periods, alert firing and idempotency.
- **Integration (jest + in-memory sqlite):**
  - `IngestionPipeline.process` end-to-end with fixtures.
  - Backup → restore round-trip on populated DB; row counts and checksums.
- **Golden categorization set:** 100 hand-labeled merchant strings; CI gate at ≥ 80% to start.
- **Native (kotlin):** thin — assert receiver/worker enqueue correct Headless JS payload.
- **Manual device test plan** in `docs/test-plan.md` covering permissions flow, real SMS arrival, notification arrival, dedup case (Uber + bank SMS), 5-min delete window, void, backup/restore on a real device.
- No Detox/Appium in v1.

### Logging

- Rotating `logs/app.log` (1 MB × 3) for ingestion outcomes and errors.
- Settings → Diagnostics → "Export log" share-sheets the log + recent `ingestion_log` rows + schema_version.
- No third-party crash/analytics in v1.

---

## 9. Out of scope (v1)

- Multi-device sync (Drive is one-way snapshots).
- Currencies other than INR (display layer parameterized; ship INR only).
- Recurring/subscription detection (future `recurrences` table fits cleanly).
- Receipt OCR beyond total/date/merchant (no line items).
- iOS (schema and services portable; ingestion would need a wholly different approach).
- Per-category budgets at launch (schema already supports; UI added later).

---

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| TRAI suffix enforcement incomplete in 2026 | Heuristic fallback still parses unsuffixed transactional SMS; `pending_review` queue catches errors. |
| Notification listener disabled by user | Banner on Home; SMS-only ingestion still works. |
| Battery optimization kills receiver | Onboarding deep-link prompts exemption; receivers re-arm on `BOOT_COMPLETED`. |
| ML model size or accuracy issues | Stages 1–2 (rules) cover the common case; ML is fallback; threshold tunable; user edits learn fast. |
| Drive quota / OAuth issues | Settings banners; manual backup as always-available fallback; user keeps the encrypted zip locally on demand (Export). |
| Schema drift between devices on restore | `schema_version` check + migrations; newer-schema restores blocked with explicit guidance. |
