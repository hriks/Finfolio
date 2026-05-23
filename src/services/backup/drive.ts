export interface DriveFileSummary {
  id: string;
  name: string;
  createdAt: number;
  size: number;
}

export interface DriveClient {
  list(): Promise<DriveFileSummary[]>;
  upload(name: string, data: Uint8Array): Promise<DriveFileSummary>;
  download(id: string): Promise<Uint8Array>;
  delete(id: string): Promise<void>;
}

export class InMemoryDrive implements DriveClient {
  private files = new Map<string, { name: string; data: Uint8Array; createdAt: number }>();
  private idSeq = 1;
  private nowFn: () => number;

  constructor(nowFn: () => number = () => Date.now()) {
    this.nowFn = nowFn;
  }

  async list(): Promise<DriveFileSummary[]> {
    return Array.from(this.files.entries()).map(([id, f]) => ({
      id,
      name: f.name,
      createdAt: f.createdAt,
      size: f.data.length,
    }));
  }

  async upload(name: string, data: Uint8Array): Promise<DriveFileSummary> {
    const id = `f${this.idSeq++}`;
    const createdAt = this.nowFn();
    this.files.set(id, { name, data, createdAt });
    return { id, name, createdAt, size: data.length };
  }

  async download(id: string): Promise<Uint8Array> {
    const f = this.files.get(id);
    if (!f) throw new Error(`drive: file ${id} not found`);
    return f.data;
  }

  async delete(id: string): Promise<void> {
    this.files.delete(id);
  }
}
