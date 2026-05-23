import {
  buildArchive,
  extractArchive,
} from '../../../src/services/backup/archive';

describe('archive', () => {
  it('round-trips files including binary content', async () => {
    const files = [
      { path: 'expense-manager.db', data: new Uint8Array([0, 1, 2, 3, 255]) },
      {
        path: 'photos/a.jpg',
        data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]),
      },
      {
        path: 'meta.json',
        data: new TextEncoder().encode('{"hello":"world"}'),
      },
    ];
    const zip = await buildArchive(files);
    expect(zip).toBeInstanceOf(Uint8Array);
    expect(zip.length).toBeGreaterThan(0);

    const out = await extractArchive(zip);
    const byPath = new Map(out.map((f) => [f.path, f.data]));
    expect(byPath.size).toBe(3);
    for (const f of files) {
      const got = byPath.get(f.path);
      expect(got).toBeDefined();
      expect(Array.from(got!)).toEqual(Array.from(f.data));
    }
  });
});
