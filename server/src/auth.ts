import { mgr } from "./db";

export type User = {
  id: string;
  username: string;
  is_admin: number;
  disabled: number;
  created_at: number;
  updated_at: number;
};

export type SessionUser = Pick<User, "id" | "username" | "is_admin">;

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const COOKIE_NAME = "oc_token";

function strip(u: any): User {
  return u;
}

export function userCount(): number {
  return (mgr.query("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
}

export function findUsername(username: string): (User & { password_hash: string }) | null {
  return (
    (mgr
      .query("SELECT * FROM users WHERE username = ? COLLATE NOCASE")
      .get(username) as any) ?? null
  );
}

export function findUser(id: string): User | null {
  return (mgr.query("SELECT * FROM users WHERE id = ?").get(id) as any) ?? null;
}

export function listUsers(): SessionUser[] {
  return mgr
    .query("SELECT id, username, is_admin FROM users ORDER BY created_at ASC")
    .all() as SessionUser[];
}

export async function createUser(
  username: string,
  password: string,
  isAdmin: boolean,
): Promise<User> {
  const now = Date.now();
  const id = "usr_" + crypto.randomUUID();
  const hash = await Bun.password.hash(password, { algorithm: "argon2id" });
  mgr
    .query(
      `INSERT INTO users(id, username, password_hash, is_admin, disabled, created_at, updated_at)
       VALUES(?,?,?,?,0,?,?)`,
    )
    .run(id, username.trim(), hash, isAdmin ? 1 : 0, now, now);
  return strip(findUser(id));
}

export async function verifyPassword(user: any, password: string): Promise<boolean> {
  try {
    return await Bun.password.verify(password, user.password_hash);
  } catch {
    return false;
  }
}

export async function setPassword(userId: string, password: string): Promise<void> {
  const hash = await Bun.password.hash(password, { algorithm: "argon2id" });
  mgr
    .query("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
    .run(hash, Date.now(), userId);
}

export function setAdmin(userId: string, isAdmin: boolean): void {
  mgr
    .query("UPDATE users SET is_admin = ?, updated_at = ? WHERE id = ?")
    .run(isAdmin ? 1 : 0, Date.now(), userId);
}

export function setDisabled(userId: string, disabled: boolean): void {
  mgr
    .query("UPDATE users SET disabled = ?, updated_at = ? WHERE id = ?")
    .run(disabled ? 1 : 0, Date.now(), userId);
  if (disabled) deleteUserSessions(userId);
}

export function deleteUser(userId: string): void {
  mgr.query("DELETE FROM auth_sessions WHERE user_id = ?").run(userId);
  mgr.query("DELETE FROM users WHERE id = ?").run(userId);
}

export function adminCount(): number {
  return (
    mgr.query("SELECT COUNT(*) AS n FROM users WHERE is_admin = 1 AND disabled = 0").get() as {
      n: number;
    }
  ).n;
}

// ---- sessions ----

export function createSession(userId: string, userAgent: string, ip: string): string {
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const now = Date.now();
  mgr
    .query(
      `INSERT INTO auth_sessions(token, user_id, created_at, expires_at, user_agent, ip)
       VALUES(?,?,?,?,?,?)`,
    )
    .run(token, userId, now, now + SESSION_TTL_MS, userAgent ?? "", ip ?? "");
  purgeExpired();
  return token;
}

export function getSessionUser(token: string | null): SessionUser | null {
  if (!token) return null;
  const row = mgr
    .query(
      `SELECT u.id, u.username, u.is_admin, s.expires_at, u.disabled
       FROM auth_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`,
    )
    .get(token) as any;
  if (!row) return null;
  if (row.expires_at < Date.now() || row.disabled) {
    mgr.query("DELETE FROM auth_sessions WHERE token = ?").run(token);
    return null;
  }
  return { id: row.id, username: row.username, is_admin: row.is_admin };
}

export function deleteSession(token: string): void {
  mgr.query("DELETE FROM auth_sessions WHERE token = ?").run(token);
}

export function deleteUserSessions(userId: string): void {
  mgr.query("DELETE FROM auth_sessions WHERE user_id = ?").run(userId);
}

export function purgeExpired(): void {
  mgr.query("DELETE FROM auth_sessions WHERE expires_at < ?").run(Date.now());
}

// ---- cookie helpers ----

export function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.get("cookie") ?? "";
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function authenticate(req: Request): SessionUser | null {
  return getSessionUser(parseCookies(req)[COOKIE_NAME] ?? null);
}

export function sessionCookie(token: string, secure: boolean): string {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${
    secure ? "; Secure" : ""
  }`;
}

export function clearCookie(secure: boolean): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${
    secure ? "; Secure" : ""
  }`;
}

export function isSecure(req: Request): boolean {
  const p = req.headers.get("x-forwarded-proto");
  if (p) return p.split(",")[0]!.trim() === "https";
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}

export function validateUsername(u: string): string | null {
  if (!u || u.length < 3 || u.length > 32) return "username must be 3–32 characters";
  if (!/^[a-zA-Z0-9._-]+$/.test(u)) return "username may contain letters, digits, . _ -";
  return null;
}

export function validatePassword(p: string): string | null {
  if (!p || p.length < 8) return "password must be at least 8 characters";
  return null;
}
