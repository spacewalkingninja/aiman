import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Central, cross-platform path/port configuration.
 *
 * Everything can be overridden with environment variables so the same build
 * runs on Linux, macOS and Windows:
 *
 *   AIMAN_HOME   base directory for our own data (manager.db, backups, …)
 *   MANAGER_DB   explicit path to our SQLite database
 *   OPENCODE_DB  explicit path to opencode's SQLite database
 *   OPENCODE_AUTH explicit path to opencode's auth.json
 *   DIST         directory containing the built web UI
 *   PORT / HOST / OPENCODE_URL
 */

const isWindows = process.platform === "win32";
const isMac = process.platform === "darwin";

function ensureEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

/** Pick the first existing path, falling back to the last candidate. */
function firstExisting(candidates: string[], fallback: string): string {
  for (const c of candidates) {
    try {
      if (existsSync(c)) return c;
    } catch {}
  }
  return fallback;
}

/** Platform-appropriate data directory for our own files. */
export function defaultHome(): string {
  const override = ensureEnv("AIMAN_HOME");
  if (override) return resolve(override);

  if (isWindows) {
    const base = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
    return join(base, "aiman");
  }
  if (isMac) return join(homedir(), "Library", "Application Support", "aiman");
  const xdg = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return join(xdg, "aiman");
}

export const AIMAN_HOME = defaultHome();

export const DIST =
  ensureEnv("DIST") ?? resolve(import.meta.dir, "..", "..", "dist");

export const MANAGER_DB = ensureEnv("MANAGER_DB") ?? join(AIMAN_HOME, "manager.db");

/** Candidate opencode data directories, most specific platform first. */
function opencodeDataDir(): string {
  const home = homedir();
  const candidates: string[] = [];
  if (isWindows) {
    if (process.env.APPDATA) candidates.push(join(process.env.APPDATA, "opencode"));
    if (process.env.LOCALAPPDATA) candidates.push(join(process.env.LOCALAPPDATA, "opencode"));
    candidates.push(join(home, ".local", "share", "opencode"));
  } else if (isMac) {
    candidates.push(join(home, "Library", "Application Support", "opencode"));
    candidates.push(join(home, ".local", "share", "opencode"));
  } else {
    if (process.env.XDG_DATA_HOME) candidates.push(join(process.env.XDG_DATA_HOME, "opencode"));
    candidates.push(join(home, ".local", "share", "opencode"));
  }
  return firstExisting(candidates, candidates[candidates.length - 1]!);
}

export const OPENCODE_DATA_DIR = opencodeDataDir();

export const OPENCODE_DB =
  ensureEnv("OPENCODE_DB") ?? join(OPENCODE_DATA_DIR, "opencode.db");

export const OPENCODE_AUTH =
  ensureEnv("OPENCODE_AUTH") ?? join(OPENCODE_DATA_DIR, "auth.json");

export const AUTH_BACKUP =
  ensureEnv("AUTH_BACKUP") ?? join(AIMAN_HOME, "opencode-auth-backup.json");

export const PORT = Number(ensureEnv("PORT") ?? 4097);
export const HOST = ensureEnv("HOST") ?? "127.0.0.1";
export const OPENCODE_URL = ensureEnv("OPENCODE_URL") ?? "http://127.0.0.1:4096";
export const TERMINAL_URL = ensureEnv("TERMINAL_URL") ?? "http://127.0.0.1:4098";
