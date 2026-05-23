import {
  createBackupService,
  InMemoryDrive,
} from '../../../src/services/backup';
import type { Database } from '../../../src/data/database';

class FakeDb implements Database {
  rows: unknown[] = [];
  exec(_sql: string): void {}
  run(_sql: string, params?: unknown[]) {
    this.rows.push(params);
    return { changes: 1, lastInsertRowid: 0 };
  }
  get<T = unknown>(sql: string): T | undefined {
    if (sql.includes('user_version')) {
      return { user_version: 1 } as unknown as T;
    }
    return undefined;
  }
  all<T = unknown>(): T[] {
    return [];
  }
  transaction<T>(fn: () => T): T {
    return fn();
  }
  close(): void {}
}

const makeEnv = (overrides?: {
  initialDb?: Uint8Array;
  nowSeq?: () => number;
}) => {
  let dbStore = overrides?.initialDb ?? new Uint8Array([1, 2, 3, 4, 5]);
  const photos: Record<string, Uint8Array> = {
    'r1.jpg': new Uint8Array([10, 11, 12]),
    'r2.jpg': new Uint8Array([20, 21, 22, 23]),
  };
  let writtenPhotos: Record<string, Uint8Array> | null = null;
  const nowFn = overrides?.nowSeq ?? (() => Date.now());
  const drive = new InMemoryDrive(nowFn);
  const db = new FakeDb();
  const svc = createBackupService({
    db,
    clock: { now: nowFn },
    drive,
    deviceId: 'device-1',
    appVersion: '0.0.1',
    dbBytes: () => dbStore,
    setDbBytes: (b) => {
      dbStore = b;
    },
    readPhotos: () => photos,
    writePhotos: (f) => {
      writtenPhotos = f;
    },
    kdfIterations: 1000,
  });
  return {
    svc,
    drive,
    db,
    getDb: () => dbStore,
    setDb: (b: Uint8Array) => {
      dbStore = b;
    },
    getWrittenPhotos: () => writtenPhotos,
    photos,
  };
};

describe('BackupService', () => {
  it('backup → list shows 1 entry; restore reproduces db + photos', async () => {
    const env = makeEnv();
    const original = env.getDb();
    const res = await env.svc.backupNow({ kind: 'manual', passphrase: null });
    expect(res.driveId).toBeDefined();
    expect(res.sizeBytes).toBeGreaterThan(0);

    const list = await env.svc.listAvailable();
    expect(list).toHaveLength(1);

    // Clobber db before restore
    env.setDb(new Uint8Array([99, 99]));
    await env.svc.restore({ driveId: res.driveId, passphrase: null });
    expect(Array.from(env.getDb())).toEqual(Array.from(original));
    const photos = env.getWrittenPhotos();
    expect(photos).not.toBeNull();
    expect(Array.from(photos!['r1.jpg'])).toEqual([10, 11, 12]);
    expect(Array.from(photos!['r2.jpg'])).toEqual([20, 21, 22, 23]);
  });

  it('with passphrase: encrypts and round-trips', async () => {
    const env = makeEnv();
    const original = env.getDb();
    const res = await env.svc.backupNow({
      kind: 'manual',
      passphrase: 'correct-horse',
    });
    env.setDb(new Uint8Array([0]));
    await env.svc.restore({
      driveId: res.driveId,
      passphrase: 'correct-horse',
    });
    expect(Array.from(env.getDb())).toEqual(Array.from(original));
  });

  it('restoring encrypted backup with wrong passphrase throws', async () => {
    const env = makeEnv();
    const res = await env.svc.backupNow({
      kind: 'manual',
      passphrase: 'correct-horse',
    });
    await expect(
      env.svc.restore({ driveId: res.driveId, passphrase: 'wrong' }),
    ).rejects.toBeDefined();
  });

  it('after 8 backups, only 7 remain (oldest pruned)', async () => {
    let t = 1000;
    const env = makeEnv({ nowSeq: () => t });
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) {
      t = 1000 + i;
      const r = await env.svc.backupNow({ kind: 'auto', passphrase: null });
      ids.push(r.driveId);
    }
    const list = await env.svc.listAvailable();
    expect(list).toHaveLength(7);
    // oldest (ids[0]) should be gone
    expect(list.map((f) => f.id)).not.toContain(ids[0]);
    expect(list.map((f) => f.id)).toContain(ids[7]);
  });
});
