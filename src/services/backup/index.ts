export const BACKUP_RETENTION = 7;

export interface DriveBackupEntry {
  id: string;
  createdAt: number;
}

export const pickBackupsToPrune = (
  entries: DriveBackupEntry[],
  keep = BACKUP_RETENTION,
): string[] => {
  const sorted = [...entries].sort((a, b) => b.createdAt - a.createdAt);
  return sorted.slice(keep).map((e) => e.id);
};

export type { BackupMeta } from './meta';
export { sha256Hex } from './meta';
export type { ArchiveFile, ArchiveAPI } from './archive';
export type { DriveClient, DriveFileSummary } from './drive';
export { InMemoryDrive } from './drive';
export type { BackupOptions, BackupService } from './backup-service';
export { createBackupService } from './backup-service';
