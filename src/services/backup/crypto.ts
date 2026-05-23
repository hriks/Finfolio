// Web Crypto via globalThis — works in Node 20+ and React Native (Hermes 0.74+).
const subtle: SubtleCrypto = (globalThis as { crypto: Crypto }).crypto.subtle;
const getRandomValues = (arr: Uint8Array): Uint8Array => {
  (globalThis as { crypto: Crypto }).crypto.getRandomValues(arr as Uint8Array<ArrayBuffer>);
  return arr;
};

export interface KdfParams {
  salt: Uint8Array; // 16 bytes
  iterations?: number; // default 250_000 (PBKDF2)
  memoryKiB?: number; // accepted but unused in PBKDF2 fallback
  parallelism?: number; // accepted but unused in PBKDF2 fallback
}

export interface AesGcmEnvelope {
  iv: Uint8Array; // 12 bytes
  ciphertext: Uint8Array; // includes 16-byte auth tag at end (Web Crypto convention)
}

// Override: the plan suggests argon2-browser; we use PBKDF2-SHA256 with 250k
// iterations as the KDF for v1 — same interface, simpler to test, no WASM dep.
const DEFAULT_PBKDF2_ITERATIONS = 250_000;

const u8 = (b: ArrayBuffer | Uint8Array): Uint8Array =>
  b instanceof Uint8Array ? b : new Uint8Array(b);

const asBuffer = (arr: Uint8Array): ArrayBuffer => {
  // Always copy into a standalone ArrayBuffer so Web Crypto doesn't choke on
  // SharedArrayBuffer-backed views.
  const out = new ArrayBuffer(arr.byteLength);
  new Uint8Array(out).set(arr);
  return out;
};

export const deriveKekFromPassphrase = async (
  passphrase: string,
  params: KdfParams,
): Promise<Uint8Array> => {
  const iterations = params.iterations ?? DEFAULT_PBKDF2_ITERATIONS;
  const enc = new TextEncoder();
  const baseKey = await subtle.importKey(
    'raw',
    asBuffer(enc.encode(passphrase)),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: asBuffer(params.salt),
      iterations,
    },
    baseKey,
    256,
  );
  return u8(bits);
};

export const generateDataKey = (): Uint8Array => {
  const out = new Uint8Array(32);
  getRandomValues(out);
  return out;
};

const importAesKey = async (raw: Uint8Array): Promise<CryptoKey> =>
  subtle.importKey('raw', asBuffer(raw), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

export const aesGcmEncrypt = async (
  key: Uint8Array,
  plaintext: Uint8Array,
): Promise<AesGcmEnvelope> => {
  const iv = new Uint8Array(12);
  getRandomValues(iv);
  const cryptoKey = await importAesKey(key);
  const ct = await subtle.encrypt(
    { name: 'AES-GCM', iv: asBuffer(iv) },
    cryptoKey,
    asBuffer(plaintext),
  );
  return { iv, ciphertext: u8(ct) };
};

export const aesGcmDecrypt = async (key: Uint8Array, env: AesGcmEnvelope): Promise<Uint8Array> => {
  const cryptoKey = await importAesKey(key);
  const pt = await subtle.decrypt(
    { name: 'AES-GCM', iv: asBuffer(env.iv) },
    cryptoKey,
    asBuffer(env.ciphertext),
  );
  return u8(pt);
};

export const wrapKey = async (kek: Uint8Array, dataKey: Uint8Array): Promise<AesGcmEnvelope> =>
  aesGcmEncrypt(kek, dataKey);

export const unwrapKey = async (kek: Uint8Array, wrapped: AesGcmEnvelope): Promise<Uint8Array> =>
  aesGcmDecrypt(kek, wrapped);

export const randomSalt = (n = 16): Uint8Array => {
  const out = new Uint8Array(n);
  getRandomValues(out);
  return out;
};
