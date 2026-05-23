import { NativeModules, Platform } from 'react-native';

interface InboxScanNative {
  enqueue(sinceMs: number): Promise<boolean>;
  cancel(): Promise<boolean>;
}

const NOOP: InboxScanNative = {
  enqueue: async () => false,
  cancel: async () => false,
};

const native: InboxScanNative =
  Platform.OS === 'android' && NativeModules.InboxScanModule
    ? (NativeModules.InboxScanModule as InboxScanNative)
    : NOOP;

export const enqueueInboxScan = (sinceMs: number): Promise<boolean> => native.enqueue(sinceMs);
export const cancelInboxScan = (): Promise<boolean> => native.cancel();
