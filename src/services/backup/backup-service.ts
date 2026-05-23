import { Buffer } from 'buffer';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { Clock } from '../../data/clock';
import type { Database } from '../../data/database';
import { newId } from '../../data/ids';
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  deriveKekFromPassphrase,
  generateDataKey,
  randomSalt,
  unwrapKey,
  wrapKey,
} from './crypto';
import type { DriveClient, DriveFileSummary } from './drive';
import type { BackupMeta } from './meta';
import { pickBackupsToPrune } from './index';

export interface BackupOptions {
  db: Database;
  clock: Clock;
  drive: DriveClient;
  deviceId: string;
  appVersion: string;
  dbBytes: () => Uint8Array;
  setDbBytes: (b: Uint8Array) => void;
  readPhotos: () => Record<string, Uint8Array>;
  writePhotos: (files: Record<string, Uint8Array>) => void;
  /** override KDF params for tests (defaults: 16-byte salt, 250k iterations) */
  kdfIterations?: number;
  /** override RNG-based salt (for deterministic tests) */
  generateSalt?: () => Uint8Array;
}

export interface BackupService {
  backupNow(opts: {
    kind: 'manual' | 'auto';
    passphrase: string | null;
  }): Promise<{ driveId: string; sizeBytes: number }>;
  restore(opts: { driveId: string; passphrase: string | null }): Promise<void>;
  listAvailable(): Promise<DriveFileSummary[]>;
}

const b64encode = (b: Uint8Array): string => Buffer.from(b).toString('base64');
const b64decode = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'base64'));

const readSchemaVersion = (db: Database): number => {
  try {
    const row = db.get<{ user_version: number }>('PRAGMA user_version');
    return row?.user_version ?? 0;
  } catch {
    return 0;
  }
};

const buildInnerZip = (dbData: Uint8Array, photos: Record<string, Uint8Array>): Uint8Array => {
  const z: Record<string, Uint8Array> = {
    'expense-manager.db': dbData,
  };
  for (const [k, v] of Object.entries(photos)) {
    z[`photos/${k}`] = v;
  }
  return zipSync(z);
};

export const createBackupService = (env: BackupOptions): BackupService => {
  const {
    db,
    clock,
    drive,
    deviceId,
    appVersion,
    dbBytes,
    setDbBytes,
    readPhotos,
    writePhotos,
    kdfIterations = 250_000,
    generateSalt = () => randomSalt(16),
  } = env;

  const backupNow = async (opts: {
    kind: 'manual' | 'auto';
    passphrase: string | null;
  }): Promise<{ driveId: string; sizeBytes: number }> => {
    const inner = buildInnerZip(dbBytes(), readPhotos());
    const createdAt = clock.now();

    let outer: Uint8Array;
    const baseMeta: BackupMeta = {
      schemaVersion: readSchemaVersion(db),
      appVersion,
      deviceId,
      createdAt,
      kind: opts.kind,
      encrypted: !!opts.passphrase,
    };

    if (opts.passphrase) {
      const dataKey = generateDataKey();
      const salt = generateSalt();
      const kek = await deriveKekFromPassphrase(opts.passphrase, {
        salt,
        iterations: kdfIterations,
      });
      const wrapped = await wrapKey(kek, dataKey);
      const enc = await aesGcmEncrypt(dataKey, inner);
      const meta: BackupMeta = {
        ...baseMeta,
        wrappedKey: b64encode(wrapped.ciphertext),
        wrappedIv: b64encode(wrapped.iv),
        iv: b64encode(enc.iv),
        salt: b64encode(salt),
      };
      outer = zipSync({
        'payload.bin': enc.ciphertext,
        'meta.json': strToU8(JSON.stringify(meta)),
      });
    } else {
      outer = zipSync({
        'payload.bin': inner,
        'meta.json': strToU8(JSON.stringify(baseMeta)),
      });
    }

    const name = `expense-manager-${createdAt}.embak`;
    const entry = await drive.upload(name, outer);

    // Retention: prune older backups beyond N=7
    const all = await drive.list();
    const toPrune = pickBackupsToPrune(all);
    for (const id of toPrune) {
      await drive.delete(id);
    }

    // Insert backup_meta row
    try {
      db.run(
        'INSERT INTO backup_meta (id, drive_id, size_bytes, created_at, kind) VALUES (?, ?, ?, ?, ?)',
        [newId(), entry.id, entry.size, createdAt, opts.kind],
      );
    } catch {
      // best-effort; tests may not have a real db
    }

    return { driveId: entry.id, sizeBytes: entry.size };
  };

  const restore = async (opts: { driveId: string; passphrase: string | null }): Promise<void> => {
    const bytes = await drive.download(opts.driveId);
    const outer = unzipSync(bytes);
    const metaBytes = outer['meta.json'];
    const payload = outer['payload.bin'];
    if (!metaBytes || !payload) {
      throw new Error('restore: invalid backup container');
    }
    const meta = JSON.parse(strFromU8(metaBytes)) as BackupMeta;

    let inner: Uint8Array;
    if (meta.encrypted) {
      if (!opts.passphrase) {
        throw new Error('restore: passphrase required for encrypted backup');
      }
      if (!meta.iv || !meta.salt || !meta.wrappedKey || !meta.wrappedIv) {
        throw new Error('restore: encrypted backup missing key material');
      }
      const salt = b64decode(meta.salt);
      const kek = await deriveKekFromPassphrase(opts.passphrase, {
        salt,
        iterations: kdfIterations,
      });
      const dataKey = await unwrapKey(kek, {
        iv: b64decode(meta.wrappedIv),
        ciphertext: b64decode(meta.wrappedKey),
      });
      inner = await aesGcmDecrypt(dataKey, {
        iv: b64decode(meta.iv),
        ciphertext: payload,
      });
    } else {
      inner = payload;
    }

    const innerFiles = unzipSync(inner);
    const dbData = innerFiles['expense-manager.db'];
    if (!dbData) {
      throw new Error('restore: inner archive missing expense-manager.db');
    }
    const photos: Record<string, Uint8Array> = {};
    for (const [path, data] of Object.entries(innerFiles)) {
      if (path.startsWith('photos/')) {
        photos[path.slice('photos/'.length)] = data;
      }
    }

    setDbBytes(dbData);
    writePhotos(photos);
  };

  const listAvailable = async (): Promise<DriveFileSummary[]> => drive.list();

  return { backupNow, restore, listAvailable };
};
