import { AppRegistry } from 'react-native';
import RNFS from 'react-native-fs';
import { getAppDb } from './data/app-db';
import { systemClock } from './data/clock';
import { createIngestionPipeline } from './services/ingestion-pipeline';
import { postTransactionNotification } from './app/native/permission-status';
import { createExpenseService } from './services/expense-service';
import { createBackupService } from './services/backup';
import { createGoogleDriveClient } from './services/backup/google-drive';
import { readSettings, writeSettings } from './app/services';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require('../package.json') as { version: string };

type Payload = {
  events: Array<{
    source: 'sms' | 'notification';
    sourceRef: string | null;
    body: string;
    ts: number;
  }>;
};

const handle = async (data: Payload) => {
  const events = data?.events ?? [];
  // eslint-disable-next-line no-console
  console.log(`[IngestionTask] received ${events.length} event(s)`);
  if (events.length === 0) return;
  const db = getAppDb();
  const pipeline = createIngestionPipeline({ db, clock: systemClock });
  const expense = createExpenseService({ db, clock: systemClock });
  // Suppress notifications for the bulk inbox-scan (>5 events in a single batch).
  // Real-time SMS or notification ingestion has batch size 1; we want a system
  // notification only in those interactive cases.
  const isBulk = events.length > 5;
  for (const ev of events) {
    try {
      const r = pipeline.process(ev);
      // eslint-disable-next-line no-console
      console.log(`[IngestionTask] ${ev.source} ${ev.sourceRef ?? '(none)'} → ${r.outcome}`);
      if (!isBulk && r.outcome === 'inserted' && r.expenseId) {
        const inserted = expense.get(r.expenseId);
        if (inserted) {
          const major = Math.floor(inserted.amountMinor / 100);
          const minor = String(inserted.amountMinor % 100).padStart(2, '0');
          const amt = `₹${major.toLocaleString('en-IN')}.${minor}`;
          const merchant = inserted.merchantRaw ?? 'Unknown';
          await postTransactionNotification(
            `${amt} at ${merchant}`,
            inserted.status === 'pending_review'
              ? 'Tap to review and confirm.'
              : 'Auto-imported as an expense.',
            inserted.id,
          );
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[IngestionTask] event failed', e);
    }
  }
};

AppRegistry.registerHeadlessTask('IngestionTask', () => handle);

// --- BackupTask --------------------------------------------------------------
// Wires the JS-side BackupService to the WorkManager BackupWorker dispatch.
//
// TODO(device): Assumes Google Sign-In has completed in the Settings flow so
// GoogleSignin.getTokens() inside createGoogleDriveClient() succeeds.
// TODO(device): op-sqlite places the db file under DocumentDirectoryPath; the
// exact location may differ on iOS — verify before shipping iOS.

const DB_FILE = 'expense-manager.db';
const PHOTOS_DIR = 'photos';

const ensureDeviceId = (): string => {
  const s = readSettings();
  if (s.deviceId) return s.deviceId;
  const id = `dev-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  writeSettings({ deviceId: id });
  return id;
};

const dbPath = (): string => `${RNFS.DocumentDirectoryPath}/${DB_FILE}`;
const photosDir = (): string => `${RNFS.DocumentDirectoryPath}/${PHOTOS_DIR}`;

const readBytes = async (path: string): Promise<Uint8Array> => {
  const b64 = await RNFS.readFile(path, 'base64');
  return new Uint8Array(Buffer.from(b64, 'base64'));
};

const writeBytes = async (path: string, data: Uint8Array): Promise<void> => {
  const b64 = Buffer.from(data).toString('base64');
  await RNFS.writeFile(path, b64, 'base64');
};

const readAllPhotos = async (): Promise<Record<string, Uint8Array>> => {
  const dir = photosDir();
  try {
    const exists = await RNFS.exists(dir);
    if (!exists) return {};
    const entries = await RNFS.readDir(dir);
    const out: Record<string, Uint8Array> = {};
    for (const e of entries) {
      if (e.isFile()) {
        try {
          out[e.name] = await readBytes(e.path);
        } catch {
          // skip unreadable
        }
      }
    }
    return out;
  } catch {
    return {};
  }
};

const writeAllPhotos = async (files: Record<string, Uint8Array>): Promise<void> => {
  const dir = photosDir();
  try {
    const exists = await RNFS.exists(dir);
    if (!exists) await RNFS.mkdir(dir);
    for (const [name, data] of Object.entries(files)) {
      await writeBytes(`${dir}/${name}`, data);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('writeAllPhotos failed', e);
  }
};

AppRegistry.registerHeadlessTask('BackupTask', () => async (data: { kind?: 'manual' | 'auto' }) => {
  const kind = data?.kind ?? 'auto';
  try {
    const db = getAppDb();
    const settings = readSettings();
    const deviceId = ensureDeviceId();

    // Snapshot bytes upfront so the service has them synchronously.
    const initialDbBytes = await readBytes(dbPath());
    const initialPhotos = await readAllPhotos();
    let currentDbBytes = initialDbBytes;
    let currentPhotos = initialPhotos;

    const service = createBackupService({
      db,
      clock: systemClock,
      drive: createGoogleDriveClient(),
      deviceId,
      appVersion: pkg.version,
      dbBytes: () => currentDbBytes,
      setDbBytes: (b) => {
        currentDbBytes = b;
        writeBytes(dbPath(), b).catch((err) =>
          // eslint-disable-next-line no-console
          console.warn('writeDb failed', err),
        );
      },
      readPhotos: () => currentPhotos,
      writePhotos: (files) => {
        currentPhotos = files;
        writeAllPhotos(files).catch((err) =>
          // eslint-disable-next-line no-console
          console.warn('writePhotos failed', err),
        );
      },
    });

    const result = await service.backupNow({
      kind,
      passphrase: settings.encryptionPassphrase ?? null,
    });
    // eslint-disable-next-line no-console
    console.log('BackupTask complete', result);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('BackupTask failed', e);
  }
});
