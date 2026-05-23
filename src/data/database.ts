export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface Database {
  exec(sql: string): void;
  run(sql: string, params?: unknown[]): RunResult;
  get<T = unknown>(sql: string, params?: unknown[]): T | undefined;
  all<T = unknown>(sql: string, params?: unknown[]): T[];
  transaction<T>(fn: () => T): T;
  close(): void;
}
