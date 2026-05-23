import { sha256Hex } from '../../../src/services/backup/meta';

describe('sha256Hex', () => {
  it('is deterministic for strings', () => {
    expect(sha256Hex('hello')).toBe(sha256Hex('hello'));
    expect(sha256Hex('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('is deterministic for bytes', () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3, 4]);
    expect(sha256Hex(a)).toBe(sha256Hex(b));
  });

  it('differs for different input', () => {
    expect(sha256Hex('a')).not.toBe(sha256Hex('b'));
  });
});
