import { sha256 } from 'js-sha256';

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
  /** present when encrypted=true; base64 salt used for KDF */
  salt?: string;
  /** present when encrypted=true; base64 IV used for wrapping the data key */
  wrappedIv?: string;
}

export const sha256Hex = (data: Uint8Array | string): string =>
  typeof data === 'string' ? sha256(data) : sha256(data);
