import { enqueueInboxScan } from './native/inbox-scan';
import { useScanStore } from './stores/scan';
import { tapHaptic } from './haptic';
import { readSettings, writeSettings } from './services';

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

// Single entry point for "Sync from SMS inbox" used by every place in the UI.
// On first sync we walk the last 6 months; subsequent syncs use last_sync time
// so we only fetch new messages.
export const startSmsScan = async (): Promise<boolean> => {
  tapHaptic();
  const store = useScanStore.getState();
  if (store.scanning) return true;
  store.start();
  try {
    const s = readSettings();
    const since = s.lastSmsSyncAt ?? Date.now() - SIX_MONTHS_MS;
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
