import { enqueueInboxScan } from './native/inbox-scan';
import { useScanStore } from './stores/scan';
import { tapHaptic } from './haptic';
import { readSettings, writeSettings } from './services';

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Single entry point for "Sync from SMS inbox" used by every place in the UI.
// First sync (no lastSmsSyncAt persisted) walks 6 months. Every subsequent
// sync re-scans the last 7 days unconditionally — the ingestion pipeline
// dedups by body hash so re-runs are cheap and idempotent. This means
// pull-to-refresh always picks up anything that arrived in the last week,
// not just SMSes received after the previous scan timestamp.
export const startSmsScan = async (): Promise<boolean> => {
  tapHaptic();
  const store = useScanStore.getState();
  if (store.scanning) return true;
  store.start();
  try {
    const s = readSettings();
    const isFirstSync = !s.lastSmsSyncAt;
    const since = isFirstSync ? Date.now() - SIX_MONTHS_MS : Date.now() - SEVEN_DAYS_MS;
    const startedAt = Date.now();
    const ok = await enqueueInboxScan(since);
    if (ok) writeSettings({ lastSmsSyncAt: startedAt });
    setTimeout(() => useScanStore.getState().stop(), 35000);
    return ok;
  } catch {
    useScanStore.getState().stop();
    return false;
  }
};
