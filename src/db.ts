import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;

export async function initDb(): Promise<void> {
  db = await Database.load("sqlite:pragmat.db");
  // Durable key-value store (theme, etc.). The webview's localStorage isn't a
  // reliable cross-restart store in WKWebView; this file-backed table is.
  await db.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
}

export async function getSetting(key: string): Promise<string | null> {
  const rows = await all<{ value: string }>("SELECT value FROM settings WHERE key = ?", [key]);
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await run(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
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
