import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { Buffer } from 'buffer';
import type { DriveClient, DriveFileSummary } from './drive';

const BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3/files';

const accessToken = async (): Promise<string> => {
  const tokens = await GoogleSignin.getTokens();
  return tokens.accessToken;
};

interface DriveFileJson {
  id: string;
  name: string;
  createdTime: string;
  size?: string;
}

const toSummary = (f: DriveFileJson): DriveFileSummary => ({
  id: f.id,
  name: f.name,
  createdAt: new Date(f.createdTime).getTime(),
  size: parseInt(f.size ?? '0', 10),
});

export const createGoogleDriveClient = (): DriveClient => ({
  async list(): Promise<DriveFileSummary[]> {
    const tok = await accessToken();
    const url = `${BASE}/files?spaces=appDataFolder&fields=files(id,name,createdTime,size)`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${tok}` },
    });
    const j = (await r.json()) as { files?: DriveFileJson[] };
    return (j.files ?? []).map(toSummary);
  },

  async upload(name: string, data: Uint8Array): Promise<DriveFileSummary> {
    const tok = await accessToken();
    // RN's fetch cannot reliably send binary bodies (Uint8Array silently drops
    // to 0 bytes; Blob can't be constructed from a typed array). Workaround:
    // Drive's multipart upload accepts a string body where the binary part is
    // base64-encoded and tagged with Content-Transfer-Encoding: base64. The
    // server decodes it back to bytes.
    const meta = { name, parents: ['appDataFolder'] };
    const boundary = '----emb-' + Math.random().toString(16).slice(2);
    const b64 = Buffer.from(data).toString('base64');
    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(meta)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/octet-stream\r\n` +
      `Content-Transfer-Encoding: base64\r\n\r\n` +
      `${b64}\r\n` +
      `--${boundary}--`;
    const r = await fetch(`${UPLOAD_BASE}?uploadType=multipart&fields=id,name,createdTime,size`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tok}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`drive upload failed (${r.status}): ${t}`);
    }
    const j = (await r.json()) as DriveFileJson;
    return toSummary(j);
  },

  async download(id: string): Promise<Uint8Array> {
    const tok = await accessToken();
    const r = await fetch(`${BASE}/files/${id}?alt=media`, {
      headers: { Authorization: `Bearer ${tok}` },
    });
    const buf = await r.arrayBuffer();
    return new Uint8Array(buf);
  },

  async delete(id: string): Promise<void> {
    const tok = await accessToken();
    await fetch(`${BASE}/files/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tok}` },
    });
  },
});
