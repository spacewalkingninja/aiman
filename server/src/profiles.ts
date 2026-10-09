import { existsSync, readFileSync, copyFileSync } from "node:fs";
import { mgr } from "./db";
import { OPENCODE_AUTH, AUTH_BACKUP, OPENCODE_URL } from "./config";

const AUTH_JSON = OPENCODE_AUTH;

export type ProfileProvider = { providerID: string; hint: string };
export type Profile = {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  providers: ProfileProvider[];
};

function maskKey(auth: any): string {
  const k = String(auth?.key ?? "");
  if (!k) return auth?.type === "oauth" ? "oauth" : "(set)";
  return k.length <= 4 ? "••••" : "••••" + k.slice(-4);
}

export function listProfiles(): Profile[] {
  const rows = mgr
    .query("SELECT * FROM profiles ORDER BY created_at ASC")
    .all() as any[];
  return rows.map((r) => {
    const provs = mgr
      .query("SELECT provider_id, auth_json FROM profile_auth WHERE profile_id = ? ORDER BY provider_id")
      .all(r.id) as any[];
    return {
      id: r.id,
      name: r.name,
      created_at: r.created_at,
      updated_at: r.updated_at,
      providers: provs.map((p) => {
        let auth: any = {};
        try {
          auth = JSON.parse(p.auth_json);
        } catch {}
        return { providerID: p.provider_id, hint: maskKey(auth) };
      }),
    };
  });
}

export function getProfile(id: string): Profile | null {
  return listProfiles().find((p) => p.id === id) ?? null;
}

export function createProfile(name: string): Profile {
  const id = "prf_" + crypto.randomUUID();
  const now = Date.now();
  mgr
    .query("INSERT INTO profiles(id, name, created_at, updated_at) VALUES(?,?,?,?)")
    .run(id, name.trim() || "profile", now, now);
  return getProfile(id)!;
}

export function renameProfile(id: string, name: string): void {
  mgr
    .query("UPDATE profiles SET name = ?, updated_at = ? WHERE id = ?")
    .run(name.trim() || "profile", Date.now(), id);
}

export function deleteProfile(id: string): void {
  mgr.query("DELETE FROM profile_auth WHERE profile_id = ?").run(id);
  mgr.query("DELETE FROM profiles WHERE id = ?").run(id);
  mgr.query("UPDATE user_prefs SET active_profile_id = NULL WHERE active_profile_id = ?").run(id);
}

export function setProfileAuth(
  profileId: string,
  providerID: string,
  auth: { type?: string; key: string; metadata?: any },
): void {
  const authJson = JSON.stringify({
    type: auth.type ?? "api",
    key: auth.key,
    ...(auth.metadata ? { metadata: auth.metadata } : {}),
  });
  mgr
    .query(
      `INSERT INTO profile_auth(profile_id, provider_id, auth_json) VALUES(?,?,?)
       ON CONFLICT(profile_id, provider_id) DO UPDATE SET auth_json = excluded.auth_json`,
    )
    .run(profileId, providerID, authJson);
  mgr.query("UPDATE profiles SET updated_at = ? WHERE id = ?").run(Date.now(), profileId);
}

export function removeProfileAuth(profileId: string, providerID: string): void {
  mgr
    .query("DELETE FROM profile_auth WHERE profile_id = ? AND provider_id = ?")
    .run(profileId, providerID);
}

export function getProfileAuthMap(profileId: string): Map<string, any> {
  const rows = mgr
    .query("SELECT provider_id, auth_json FROM profile_auth WHERE profile_id = ?")
    .all(profileId) as any[];
  const map = new Map<string, any>();
  for (const r of rows) {
    try {
      map.set(r.provider_id, JSON.parse(r.auth_json));
    } catch {}
  }
  return map;
}

export function getUserActiveProfile(userId: string): string | null {
  const r = mgr.query("SELECT active_profile_id FROM user_prefs WHERE user_id = ?").get(userId) as
    | { active_profile_id: string | null }
    | undefined;
  return r?.active_profile_id ?? null;
}

export function setUserActiveProfile(userId: string, profileId: string | null): void {
  mgr
    .query(
      `INSERT INTO user_prefs(user_id, active_profile_id) VALUES(?,?)
       ON CONFLICT(user_id) DO UPDATE SET active_profile_id = excluded.active_profile_id`,
    )
    .run(userId, profileId);
}

export function getUserOnboarded(userId: string): boolean {
  const r = mgr.query("SELECT onboarded FROM user_prefs WHERE user_id = ?").get(userId) as
    | { onboarded: number }
    | undefined;
  return !!r?.onboarded;
}

export function setUserOnboarded(userId: string, onboarded: boolean): void {
  mgr
    .query(
      `INSERT INTO user_prefs(user_id, onboarded) VALUES(?, ?)
       ON CONFLICT(user_id) DO UPDATE SET onboarded = excluded.onboarded`,
    )
    .run(userId, onboarded ? 1 : 0);
}

/** Create a "default" profile from the current opencode auth if none exist. */
export function ensureDefaultProfile(): void {
  const n = (mgr.query("SELECT COUNT(*) AS n FROM profiles").get() as { n: number }).n;
  if (n > 0) return;
  const prof = createProfile("default");
  try {
    if (existsSync(AUTH_JSON)) {
      const cur = JSON.parse(readFileSync(AUTH_JSON, "utf8")) as Record<string, any>;
      for (const [providerID, auth] of Object.entries(cur)) {
        if (auth?.type === "api" && auth.key) setProfileAuth(prof.id, providerID, auth);
      }
    }
  } catch {}
}

function readCurrentAuth(): Record<string, any> {
  try {
    return existsSync(AUTH_JSON) ? JSON.parse(readFileSync(AUTH_JSON, "utf8")) : {};
  } catch {
    return {};
  }
}

function backupAuth(): void {
  try {
    if (existsSync(AUTH_JSON)) copyFileSync(AUTH_JSON, AUTH_BACKUP);
  } catch {}
}

/**
 * Apply a profile to the running opencode server: remove API-key providers that
 * are no longer in the profile, then set the profile's keys.
 *
 * NOTE: opencode serve keeps a single global auth store, so activation is
 * server-wide. The previous auth.json is backed up first.
 */
export async function applyProfile(profileId: string): Promise<{ applied: string[]; removed: string[] }> {
  const target = getProfileAuthMap(profileId);
  backupAuth();
  const cur = readCurrentAuth();
  const removed: string[] = [];
  const applied: string[] = [];

  for (const [providerID, auth] of Object.entries(cur)) {
    if (auth?.type === "api" && !target.has(providerID)) {
      try {
        await fetch(`${OPENCODE_URL}/auth/${encodeURIComponent(providerID)}`, { method: "DELETE" });
        removed.push(providerID);
      } catch {}
    }
  }
  for (const [providerID, auth] of target) {
    try {
      const res = await fetch(`${OPENCODE_URL}/auth/${encodeURIComponent(providerID)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(auth),
      });
      if (res.ok) applied.push(providerID);
    } catch {}
  }
  return { applied, removed };
}

export async function activateProfileForUser(userId: string, profileId: string) {
  const res = await applyProfile(profileId);
  setUserActiveProfile(userId, profileId);
  return res;
}
