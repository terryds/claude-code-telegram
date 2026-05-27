import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const DATA_DIR = resolve('./data');
mkdirSync(DATA_DIR, { recursive: true });

const dbPath = resolve(DATA_DIR, 'app.db');
export const db = new Database(dbPath, { create: true });
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA foreign_keys = ON');

db.run(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS message_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    direction TEXT NOT NULL,
    text TEXT NOT NULL,
    session_id TEXT,
    ok INTEGER NOT NULL DEFAULT 1,
    error TEXT
  )
`);

db.run('CREATE INDEX IF NOT EXISTS idx_message_log_created_at ON message_log(created_at DESC)');

export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}

export function deleteSetting(key: string): void {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key);
}

export type MessageLogEntry = {
  id: number;
  created_at: number;
  direction: 'in' | 'out';
  text: string;
  session_id: string | null;
  ok: boolean;
  error: string | null;
};

export function logMessage(entry: {
  direction: 'in' | 'out';
  text: string;
  session_id: string | null;
  ok?: boolean;
  error?: string | null;
}): void {
  db.prepare(
    `INSERT INTO message_log (created_at, direction, text, session_id, ok, error)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    Date.now(),
    entry.direction,
    entry.text,
    entry.session_id,
    entry.ok === false ? 0 : 1,
    entry.error ?? null
  );
}

export function recentMessages(limit = 50): MessageLogEntry[] {
  const rows = db
    .prepare(
      `SELECT id, created_at, direction, text, session_id, ok, error
       FROM message_log
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(limit) as Array<{
    id: number;
    created_at: number;
    direction: 'in' | 'out';
    text: string;
    session_id: string | null;
    ok: number;
    error: string | null;
  }>;
  return rows.map((r) => ({ ...r, ok: r.ok === 1 }));
}
