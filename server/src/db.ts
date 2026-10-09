import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { MANAGER_DB as CFG_MANAGER_DB, OPENCODE_DB as CFG_OPENCODE_DB } from "./config";

export const OPENCODE_DB = CFG_OPENCODE_DB;
export const MANAGER_DB = CFG_MANAGER_DB;

mkdirSync(dirname(MANAGER_DB), { recursive: true });

// Read-only connection to opencode's database.
export const ocRO = new Database(OPENCODE_DB, { readonly: true });
ocRO.exec("PRAGMA busy_timeout = 5000;");
ocRO.exec("PRAGMA query_only = true;");

// Writable connection, used ONLY for the archive flag on session.time_archived.
export const ocRW = new Database(OPENCODE_DB);
ocRW.exec("PRAGMA busy_timeout = 5000;");

// Our own database: folders, per-session metadata, search index, settings.
export const mgr = new Database(MANAGER_DB);
mgr.exec("PRAGMA journal_mode = WAL;");
mgr.exec("PRAGMA busy_timeout = 5000;");

mgr.exec(`
  CREATE TABLE IF NOT EXISTS folders (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    color      TEXT,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS session_meta (
    session_id TEXT PRIMARY KEY,
    folder_id  TEXT,
    tags       TEXT,
    notes      TEXT,
    pinned     INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    disabled      INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS profiles (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS profile_auth (
    profile_id  TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    auth_json   TEXT NOT NULL,
    PRIMARY KEY (profile_id, provider_id)
  );

  CREATE TABLE IF NOT EXISTS user_prefs (
    user_id           TEXT PRIMARY KEY,
    active_profile_id TEXT
  );

  CREATE TABLE IF NOT EXISTS auth_sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    user_agent TEXT,
    ip         TEXT
  );

  /* FTS5 index over conversation parts. rowid mirrors the opencode part rowid. */
  CREATE VIRTUAL TABLE IF NOT EXISTS part_fts USING fts5(
    text,
    part_id    UNINDEXED,
    session_id UNINDEXED,
    message_id UNINDEXED,
    type       UNINDEXED
  );
`);

// ---- lightweight migrations (add columns to existing databases) ----
function ensureColumn(table: string, column: string, decl: string): void {
  const cols = mgr.query(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    mgr.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }
}
ensureColumn("session_meta", "user_id", "TEXT");
ensureColumn("session_meta", "profile_id", "TEXT");
ensureColumn("user_prefs", "onboarded", "INTEGER NOT NULL DEFAULT 0");

export function getSetting(key: string): string | null {
  const row = mgr.query("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  mgr
    .query(
      "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);
}
