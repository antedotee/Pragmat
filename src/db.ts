import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;

export async function initDb(): Promise<void> {
  db = await Database.load("sqlite:pragmat.db");
}

function conn(): Database {
  if (!db) throw new Error("Database not initialized");
  return db;
}

export interface RunResult {
  rowsAffected: number;
  lastInsertId?: number;
}

export async function run(sql: string, params: unknown[] = []): Promise<RunResult> {
  return conn().execute(sql, params);
}

export async function all<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
  return conn().select(sql, params) as Promise<T[]>;
}
