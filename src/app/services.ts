import { getAppDb } from '../data/app-db';
import { systemClock } from '../data/clock';
import { createExpenseService } from '../services/expense-service';
import type { ExpenseService } from '../services/expense-service';
import type { Database } from '../data/database';
import type { Clock } from '../data/clock';

let _expense: ExpenseService | null = null;

export const getDb = (): Database => getAppDb();
export const getClock = (): Clock => systemClock;

export const getExpenseService = (): ExpenseService => {
  if (!_expense) _expense = createExpenseService({ db: getDb(), clock: getClock() });
  return _expense;
};

// --- Settings JSON blob helpers ---

export interface AppSettings {
  onboardingComplete?: boolean;
  theme?: 'dark' | 'light';
  currency?: string;
  alertHours?: number[];
  autoBackup?: boolean;
  backupFrequencyHours?: number;
  encryptionOn?: boolean;
  encryptionPassphrase?: string | null;
  autoConfirmThreshold?: number;
  deviceId?: string;
  // permission states (last-known)
  perms?: {
    sms?: boolean;
    notificationListener?: boolean;
    batteryExempt?: boolean;
    postNotifications?: boolean;
  };
  // Google Drive
  googleWebClientId?: string;
  googleEmail?: string;
  // Last successful SMS sync (epoch ms). Used so re-sync only fetches
  // newer messages instead of re-walking the last 6 months every time.
  lastSmsSyncAt?: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  onboardingComplete: false,
  theme: 'dark',
  currency: 'INR',
  alertHours: [50, 80, 100],
  autoBackup: false,
  backupFrequencyHours: 24,
  encryptionOn: false,
  encryptionPassphrase: null,
  autoConfirmThreshold: 0.85,
};

export const readSettings = (): AppSettings => {
  try {
    const row = getDb().get<{ data: string }>('SELECT data FROM settings WHERE id = 1');
    if (!row) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(row.data) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

export const writeSettings = (patch: Partial<AppSettings>): AppSettings => {
  const current = readSettings();
  const next = { ...current, ...patch };
  const data = JSON.stringify(next);
  const db = getDb();
  db.run(
    'INSERT INTO settings (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
    [data],
  );
  return next;
};
