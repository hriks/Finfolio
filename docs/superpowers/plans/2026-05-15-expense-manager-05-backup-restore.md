# Expense Manager — Plan 5: Backup & Restore

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Implement Google Drive `appDataFolder` backup + restore with AES-GCM encryption (Android Keystore key + user passphrase wrap), retention of last 7 backups, and a WorkManager periodic scheduler.

**Architecture:** Backup is a sequence of pure functions composed by `BackupService`:
1. Read DB file + photos dir → archive into a zip bytestream.
2. Encrypt zip with a data key (random 256-bit). Wrap data key with passphrase-derived KEK via Argon2id; write wrapped key + IV to `meta.json` inside an outer container.
3. Upload outer container to Drive `appDataFolder` (resumable).
4. Prune older backups beyond N=7.
5. Insert `backup_meta` row.

Restore inverts the chain with an atomic DB file swap.

JS unit tests cover: archive build/extract, encrypt/decrypt round-trip, retention logic, meta versioning. Drive REST and RN Google Sign-In are exercised through narrow interfaces with mock implementations in tests; production binds to `@react-native-google-signin/google-signin` and a thin REST wrapper using `fetch`.

---

## Dependencies

```bash
npm install @react-native-google-signin/google-signin react-native-zip-archive react-native-fs argon2-browser
```

(`argon2-browser` is pure-JS Argon2; pulls in WebAssembly. Acceptable for backup performance.)

---

## File structure

```
src/services/backup/
├── index.ts                    BackupService interface, retention constants
├── archive.ts                  zip build/extract helpers (uses react-native-zip-archive in prod; node fs+yauzl/yazl in tests)
├── crypto.ts                   AES-GCM encrypt/decrypt, Argon2id passphrase derivation
├── drive.ts                    DriveClient interface; createDriveClient(...) prod impl
├── meta.ts                     meta.json schema + sha256
└── backup-service.ts           orchestrator: backup() and restore()

android/app/src/main/java/com/expensemanager/backup/
└── BackupWorker.kt             periodic WorkManager worker

__tests__/services/backup/
├── crypto.test.ts
├── meta.test.ts
├── retention.test.ts
└── backup-service.test.ts      end-to-end with InMemoryDrive
```

---

## Task 1 — meta.json schema + sha256

- [ ] `src/services/backup/meta.ts`:
```typescript
import { createHash } from 'crypto';

export interface BackupMeta {
  schemaVersion: number;
  appVersion: string;
  deviceId: string;
  createdAt: number;
  kind: 'manual' | 'auto';
  encrypted: boolean;
  /** present when encrypted=true; base64 of Argon2id-wrapped data key */
  wrappedKey?: string;
  /** present when encrypted=true; base64 IV used for inner AES-GCM */
  iv?: string;
  /** present when encrypted=true; base64 salt used for Argon2id KDF */
  salt?: string;
}

export const sha256Hex = (data: Uint8Array | string): string =>
  createHash('sha256').update(data as never).digest('hex');
```

- [ ] Test sha256 determinism; commit `feat(backup): meta + sha256`.

---

## Task 2 — Crypto round-trip

- [ ] `src/services/backup/crypto.ts`:

In Node (tests) use `crypto.webcrypto.subtle`. In RN, use the same `crypto.subtle` via `react-native-quick-crypto` if needed — for v1 use `react-native-aes-crypto` OR fall back to a pure-JS implementation if simpler. The interface to expose:

```typescript
export interface KdfParams {
  salt: Uint8Array;        // 16 bytes
  iterations?: number;     // for Argon2 t-cost; default 3
  memoryKiB?: number;      // for Argon2 m-cost; default 65536
  parallelism?: number;    // default 1
}

export interface AesGcmEnvelope {
  iv: Uint8Array;          // 12 bytes
  ciphertext: Uint8Array;  // includes 16-byte auth tag at end
}

export const deriveKekFromPassphrase: (passphrase: string, params: KdfParams) => Promise<Uint8Array>;
export const generateDataKey: () => Uint8Array; // 32 random bytes
export const aesGcmEncrypt: (key: Uint8Array, plaintext: Uint8Array) => Promise<AesGcmEnvelope>;
export const aesGcmDecrypt: (key: Uint8Array, env: AesGcmEnvelope) => Promise<Uint8Array>;
export const wrapKey: (kek: Uint8Array, dataKey: Uint8Array) => Promise<AesGcmEnvelope>;
export const unwrapKey: (kek: Uint8Array, wrapped: AesGcmEnvelope) => Promise<Uint8Array>;
```

Use Node `crypto.webcrypto` for portability. For Argon2id, use `argon2-browser` in production; in tests use a deterministic, very-fast stub via PBKDF2 with a fixed iteration count and document the override via a `KdfHook` injectable.

- [ ] Test cases:
  - `aesGcmEncrypt → aesGcmDecrypt` round-trip preserves plaintext (random plaintexts).
  - Wrong key for decrypt throws.
  - `wrapKey / unwrapKey` round-trip with same KEK preserves data key.
  - `deriveKekFromPassphrase` is deterministic with same salt+params.

- [ ] Commit: `feat(backup): AES-GCM + KDF`.

---

## Task 3 — Archive helpers

- [ ] `src/services/backup/archive.ts`:

Interface:
```typescript
export interface ArchiveFile { path: string; data: Uint8Array; }
export interface ArchiveAPI {
  build(files: ArchiveFile[]): Promise<Uint8Array>;     // returns zip bytes
  extract(zip: Uint8Array): Promise<ArchiveFile[]>;
}
```

Production binds to `react-native-zip-archive` (file-system based); tests use a pure-JS zip via `fflate` (small, no native). Add `fflate` as a regular dep:
```bash
npm install fflate
```

Implementation strategy: use `fflate` in BOTH prod and tests since it works in RN's JS engine fine and avoids the native zip dep. (If RN bundle size becomes a concern later, swap in `react-native-zip-archive`.)

- [ ] Test: build → extract round-trip with 3 files including binary content.
- [ ] Commit: `feat(backup): archive build/extract`.

---

## Task 4 — Retention logic

- [ ] In `src/services/backup/index.ts` export:

```typescript
export const BACKUP_RETENTION = 7;

export interface DriveBackupEntry {
  id: string;
  createdAt: number;
}

export const pickBackupsToPrune = (
  entries: DriveBackupEntry[],
  keep = BACKUP_RETENTION,
): string[] => {
  const sorted = [...entries].sort((a, b) => b.createdAt - a.createdAt);
  return sorted.slice(keep).map((e) => e.id);
};
```

- [ ] Test edge cases: empty, exactly 7, 12 (returns oldest 5 IDs).
- [ ] Commit: `feat(backup): retention rule`.

---

## Task 5 — DriveClient interface + InMemoryDrive (test impl)

- [ ] `src/services/backup/drive.ts`:

```typescript
export interface DriveFileSummary {
  id: string;
  name: string;
  createdAt: number;
  size: number;
}

export interface DriveClient {
  list(): Promise<DriveFileSummary[]>;
  upload(name: string, data: Uint8Array): Promise<DriveFileSummary>;
  download(id: string): Promise<Uint8Array>;
  delete(id: string): Promise<void>;
}

export class InMemoryDrive implements DriveClient {
  private files = new Map<string, { name: string; data: Uint8Array; createdAt: number }>();
  private idSeq = 1;
  async list() {
    return Array.from(this.files.entries()).map(([id, f]) => ({
      id, name: f.name, createdAt: f.createdAt, size: f.data.length,
    }));
  }
  async upload(name: string, data: Uint8Array) {
    const id = `f${this.idSeq++}`;
    const createdAt = Date.now();
    this.files.set(id, { name, data, createdAt });
    return { id, name, createdAt, size: data.length };
  }
  async download(id: string) {
    const f = this.files.get(id);
    if (!f) throw new Error('not found');
    return f.data;
  }
  async delete(id: string) { this.files.delete(id); }
}
```

The production Drive client is added in Task 7.

- [ ] (No tests yet — exercised by Task 6.)
- [ ] Commit: `feat(backup): DriveClient interface + InMemoryDrive`.

---

## Task 6 — BackupService (backup + restore)

- [ ] `src/services/backup/backup-service.ts`:

Implementation outline:
```typescript
import type { Database } from '../../data/database';
import type { Clock } from '../../data/clock';
import type { DriveClient } from './drive';
import { pickBackupsToPrune } from './index';
import { aesGcmEncrypt, aesGcmDecrypt, wrapKey, unwrapKey, generateDataKey, deriveKekFromPassphrase } from './crypto';
import { sha256Hex, type BackupMeta } from './meta';
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { newId } from '../../data/ids';

export interface BackupOptions {
  db: Database;
  clock: Clock;
  drive: DriveClient;
  deviceId: string;
  appVersion: string;
  dbBytes: () => Uint8Array;        // injected to abstract platform fs
  setDbBytes: (b: Uint8Array) => void;
  readPhotos: () => Record<string, Uint8Array>;  // {relativePath: bytes}
  writePhotos: (files: Record<string, Uint8Array>) => void;
}

export interface BackupService {
  backupNow(opts: { kind: 'manual' | 'auto'; passphrase: string | null }): Promise<{ driveId: string; sizeBytes: number }>;
  restore(opts: { driveId: string; passphrase: string | null }): Promise<void>;
  listAvailable(): Promise<Awaited<ReturnType<DriveClient['list']>>>;
}

export const createBackupService = (env: BackupOptions): BackupService => { /* ... */ };
```

Key logic:
- `backupNow`:
  1. `inner = zipSync({'expense-manager.db': dbBytes(), 'photos/...': readPhotos()})`.
  2. If passphrase provided: `dataKey = generateDataKey()`, `kek = deriveKekFromPassphrase(passphrase, {salt:randomSalt})`, `wrapped = wrapKey(kek, dataKey)`, `enc = aesGcmEncrypt(dataKey, inner)`.
     - `meta = {schemaVersion: PRAGMA user_version, appVersion, deviceId, createdAt: clock.now(), kind, encrypted: true, wrappedKey: b64(wrapped.ciphertext), iv: b64(enc.iv), salt: b64(salt)}`
     - `outer = zipSync({'payload.bin': enc.ciphertext, 'meta.json': strToU8(JSON.stringify(meta))})`
  3. Else: outer is `inner` with appended `meta.json` (encrypted=false).
  4. `entry = drive.upload(name, outer)`; `pickBackupsToPrune` and `drive.delete` extras.
  5. `db.run(INSERT into backup_meta ...)`.

- `restore`:
  1. `bytes = drive.download(id)`.
  2. Parse outer zip → `meta.json` + `payload.bin`.
  3. If encrypted: derive kek with same salt/params, unwrap data key, decrypt payload.
  4. Inner zip → extract `expense-manager.db` and `photos/*` → `setDbBytes` and `writePhotos`.

- [ ] Tests `__tests__/services/backup/backup-service.test.ts`:
  - Backup → list shows 1 entry; round-trip restore reproduces the same db bytes.
  - With passphrase: encryption is exercised; restoring with wrong passphrase throws.
  - After 8 backups, only 7 remain (oldest pruned).

Use `Buffer` ↔ `Uint8Array` carefully; `fflate` accepts/returns `Uint8Array`.

- [ ] Commit: `feat(backup): BackupService + tests`.

---

## Task 7 — Production DriveClient (Google REST)

- [ ] `src/services/backup/google-drive.ts`:

Uses `GoogleSignin` for the access token, then `fetch` against `https://www.googleapis.com/drive/v3/files` with `spaces=appDataFolder`.

Outline:
```typescript
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import type { DriveClient, DriveFileSummary } from './drive';

const BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3/files';

const accessToken = async () => {
  const tokens = await GoogleSignin.getTokens();
  return tokens.accessToken;
};

export const createGoogleDriveClient = (): DriveClient => ({
  async list(): Promise<DriveFileSummary[]> {
    const tok = await accessToken();
    const url = `${BASE}/files?spaces=appDataFolder&fields=files(id,name,createdTime,size)`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
    const j = await r.json();
    return (j.files ?? []).map((f: { id: string; name: string; createdTime: string; size?: string }) => ({
      id: f.id, name: f.name,
      createdAt: new Date(f.createdTime).getTime(),
      size: parseInt(f.size ?? '0', 10),
    }));
  },
  async upload(name, data) {
    const tok = await accessToken();
    const meta = { name, parents: ['appDataFolder'] };
    const boundary = '----emb-' + Math.random().toString(16).slice(2);
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify(meta),
      `\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
      new Uint8Array(data),
      `\r\n--${boundary}--`,
    ]);
    const r = await fetch(`${UPLOAD_BASE}?uploadType=multipart&fields=id,name,createdTime,size`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    const j = await r.json();
    return { id: j.id, name: j.name, createdAt: new Date(j.createdTime).getTime(), size: parseInt(j.size ?? '0', 10) };
  },
  async download(id) {
    const tok = await accessToken();
    const r = await fetch(`${BASE}/files/${id}?alt=media`, { headers: { Authorization: `Bearer ${tok}` } });
    const buf = await r.arrayBuffer();
    return new Uint8Array(buf);
  },
  async delete(id) {
    const tok = await accessToken();
    await fetch(`${BASE}/files/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tok}` } });
  },
});
```

- [ ] Typecheck.
- [ ] Commit: `feat(backup): Google Drive REST client`.

---

## Task 8 — WorkManager periodic backup

- [ ] `android/app/src/main/java/com/expensemanager/backup/BackupWorker.kt`:

```kotlin
package com.expensemanager.backup

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.facebook.react.HeadlessJsTaskService

class BackupWorker(ctx: Context, p: WorkerParameters) : CoroutineWorker(ctx, p) {
    override suspend fun doWork(): Result {
        // Spawn a Headless JS task with name "BackupTask"; JS calls BackupService.backupNow({kind:'auto'})
        val payload = com.facebook.react.bridge.Arguments.createMap()
        payload.putString("kind", "auto")
        val bundle = com.facebook.react.bridge.Arguments.toBundle(payload) ?: return Result.success()
        val intent = android.content.Intent(applicationContext,
            com.expensemanager.ingestion.HeadlessIngestionTaskService::class.java)
        // (we re-use the existing headless service host; the JS-side task name routes to BackupTask)
        intent.putExtras(bundle)
        applicationContext.startService(intent)
        HeadlessJsTaskService.acquireWakeLockNow(applicationContext)
        return Result.success()
    }
}
```

In `src/ingestion-task.ts` add:
```typescript
import { getAppDb } from './data/app-db';
import { systemClock } from './data/clock';
// (don't actually invoke prod modules in tests; we already gate via AppRegistry)

AppRegistry.registerHeadlessTask('BackupTask', () => async (data: { kind?: 'manual' | 'auto' }) => {
  // wire actual BackupService when env is available
  // eslint-disable-next-line no-console
  console.log('BackupTask invoked', data?.kind ?? 'auto');
});
```

(Full wiring of the prod environment — passphrase storage, photos dir, signed-in user — lands in Plan 6 with the Settings screen. This task just gets the scheduler in place.)

- [ ] Commit: `feat(backup): WorkManager scheduler + JS task stub`.

---

## Task 9 — Full sweep

- [ ] Tests, lint, typecheck, format. Commit drift.
