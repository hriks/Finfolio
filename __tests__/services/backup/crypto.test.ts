import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  deriveKekFromPassphrase,
  generateDataKey,
  randomSalt,
  unwrapKey,
  wrapKey,
} from '../../../src/services/backup/crypto';

describe('crypto', () => {
  it('AES-GCM round-trip preserves plaintext', async () => {
    const key = generateDataKey();
    const pt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const env = await aesGcmEncrypt(key, pt);
    const out = await aesGcmDecrypt(key, env);
    expect(Array.from(out)).toEqual(Array.from(pt));
  });

  it('wrong key for decrypt throws', async () => {
    const key = generateDataKey();
    const other = generateDataKey();
    const env = await aesGcmEncrypt(key, new Uint8Array([42]));
    await expect(aesGcmDecrypt(other, env)).rejects.toBeDefined();
  });

  it('wrapKey/unwrapKey round-trip preserves data key', async () => {
    const kek = generateDataKey();
    const dk = generateDataKey();
    const wrapped = await wrapKey(kek, dk);
    const out = await unwrapKey(kek, wrapped);
    expect(Array.from(out)).toEqual(Array.from(dk));
  });

  it('deriveKekFromPassphrase is deterministic with same salt+params', async () => {
    const salt = randomSalt(16);
    const a = await deriveKekFromPassphrase('hunter2', {
      salt,
      iterations: 1000,
    });
    const b = await deriveKekFromPassphrase('hunter2', {
      salt,
      iterations: 1000,
    });
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(a.length).toBe(32);
  });

  it('different passphrases derive different KEKs', async () => {
    const salt = randomSalt(16);
    const a = await deriveKekFromPassphrase('one', {
      salt,
      iterations: 1000,
    });
    const b = await deriveKekFromPassphrase('two', {
      salt,
      iterations: 1000,
    });
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });
});
