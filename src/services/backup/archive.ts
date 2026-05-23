import { unzipSync, zipSync, type Zippable, type Unzipped } from 'fflate';

export interface ArchiveFile {
  path: string;
  data: Uint8Array;
}

export interface ArchiveAPI {
  build(files: ArchiveFile[]): Promise<Uint8Array>;
  extract(zip: Uint8Array): Promise<ArchiveFile[]>;
}

export const buildArchive = async (files: ArchiveFile[]): Promise<Uint8Array> => {
  const z: Zippable = {};
  for (const f of files) {
    z[f.path] = f.data;
  }
  return zipSync(z);
};

export const extractArchive = async (zip: Uint8Array): Promise<ArchiveFile[]> => {
  const out: Unzipped = unzipSync(zip);
  return Object.entries(out).map(([path, data]) => ({ path, data }));
};

export const fflateArchive: ArchiveAPI = {
  build: buildArchive,
  extract: extractArchive,
};
