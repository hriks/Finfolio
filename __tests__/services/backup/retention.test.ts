import { pickBackupsToPrune } from '../../../src/services/backup/index';

describe('pickBackupsToPrune', () => {
  it('returns empty for empty input', () => {
    expect(pickBackupsToPrune([])).toEqual([]);
  });

  it('returns empty when exactly 7 entries', () => {
    const entries = Array.from({ length: 7 }, (_, i) => ({
      id: `id${i}`,
      createdAt: i,
    }));
    expect(pickBackupsToPrune(entries)).toEqual([]);
  });

  it('returns oldest 5 ids when 12 entries', () => {
    const entries = Array.from({ length: 12 }, (_, i) => ({
      id: `id${i}`,
      createdAt: i * 100,
    }));
    // newest = id11 (createdAt 1100); we keep top 7 (id11..id5); prune id4..id0
    expect(pickBackupsToPrune(entries)).toEqual([
      'id4',
      'id3',
      'id2',
      'id1',
      'id0',
    ]);
  });

  it('respects custom keep parameter', () => {
    const entries = [
      { id: 'a', createdAt: 1 },
      { id: 'b', createdAt: 2 },
      { id: 'c', createdAt: 3 },
    ];
    expect(pickBackupsToPrune(entries, 1)).toEqual(['b', 'a']);
  });
});
