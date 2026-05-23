// Convenience runner for invoking BackupService.backupNow from JS (UI thread).
// Uses the same wiring as the WorkManager-scheduled BackupTask.

import RNFS from 'react-native-fs';
import { Buffer } from 'buffer';
import { getAppDb } from '../data/app-db';
import { systemClock } from '../data/clock';
import { createBackupService } from '../services/backup';
import { createGoogleDriveClient } from '../services/backup/google-drive';
import { readSettings, writeSettings } from './services';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require('../../package.json') as { version: string };

const DB_FILE = 'expense-manager.db';
const PHOTOS_DIR = 'photos';

// op-sqlite stores DBs in the Android `databases/` directory (the standard
// SQLiteOpenHelper location), which is a sibling of RNFS.DocumentDirectoryPath
// (which maps to `files/`). Compute the actual path.
const DB_PATH = `${RNFS.DocumentDirectoryPath.replace(/\/files$/, '')}/databases/${DB_FILE}`;

const ensureDeviceId = (): string => {
  const s = readSettings();
  if (s.deviceId) return s.deviceId;
  const id = `dev-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  writeSettings({ deviceId: id });
  return id;
};

const readBytes = async (path: string): Promise<Uint8Array> => {
  const b64 = await RNFS.readFile(path, 'base64');
  return new Uint8Array(Buffer.from(b64, 'base64'));
};

const writeBytes = async (path: string, data: Uint8Array): Promise<void> => {
  const b64 = Buffer.from(data).toString('base64');
  await RNFS.writeFile(path, b64, 'base64');
};

const readAllPhotos = async (): Promise<Record<string, Uint8Array>> => {
  const dir = `${RNFS.DocumentDirectoryPath}/${PHOTOS_DIR}`;
  try {
    if (!(await RNFS.exists(dir))) return {};
    const entries = await RNFS.readDir(dir);
    const out: Record<string, Uint8Array> = {};
    for (const e of entries) {
      if (e.isFile()) {
        try {
          out[e.name] = await readBytes(e.path);
        } catch {
          // skip
        }
      }
    }
    return out;
  } catch {
    return {};
  }
};

const writeAllPhotos = async (files: Record<string, Uint8Array>): Promise<void> => {
  const dir = `${RNFS.DocumentDirectoryPath}/${PHOTOS_DIR}`;
  if (!(await RNFS.exists(dir))) await RNFS.mkdir(dir);
  for (const [name, data] of Object.entries(files)) {
    await writeBytes(`${dir}/${name}`, data);
  }
};

export const runBackupNow = async (kind: 'manual' | 'auto' = 'manual') => {
  const db = getAppDb();
  const settings = readSettings();
  const deviceId = ensureDeviceId();
  const dbPath = DB_PATH;

  let dbBytes = await readBytes(dbPath);
  let photos = await readAllPhotos();

  const svc = createBackupService({
    db,
    clock: systemClock,
    drive: createGoogleDriveClient(),
    deviceId,
    appVersion: pkg.version,
    dbBytes: () => dbBytes,
    setDbBytes: (b) => {
      dbBytes = b;
      void writeBytes(dbPath, b);
    },
    readPhotos: () => photos,
    writePhotos: (files) => {
      photos = files;
      void writeAllPhotos(files);
    },
  });

  return svc.backupNow({
    kind,
    passphrase: settings.encryptionPassphrase ?? null,
  });
};

export interface RestoreCandidate {
  driveId: string;
  name: string;
  modifiedAt: number;
  sizeBytes: number;
}

const makeService = async () => {
  const db = getAppDb();
  const settings = readSettings();
  const deviceId = ensureDeviceId();
  const dbPath = DB_PATH;
  let dbBytes = await readBytes(dbPath);
  let photos = await readAllPhotos();
  const svc = createBackupService({
    db,
    clock: systemClock,
    drive: createGoogleDriveClient(),
    deviceId,
    appVersion: pkg.version,
    dbBytes: () => dbBytes,
    setDbBytes: (b) => {
      dbBytes = b;
      void writeBytes(dbPath, b);
    },
    readPhotos: () => photos,
    writePhotos: (files) => {
      photos = files;
      void writeAllPhotos(files);
    },
  });
  return { svc, settings };
};

export const listRestoreCandidates = async (): Promise<RestoreCandidate[]> => {
  const { svc } = await makeService();
  const files = await svc.listAvailable();
  return files
    .map((f) => ({
      driveId: f.id,
      name: f.name,
      modifiedAt: f.createdAt,
      sizeBytes: f.size,
    }))
    .sort((a, b) => b.modifiedAt - a.modifiedAt);
};

export const runRestore = async (driveId: string): Promise<void> => {
  const { svc, settings } = await makeService();
  await svc.restore({
    driveId,
    passphrase: settings.encryptionPassphrase ?? null,
  });
};
