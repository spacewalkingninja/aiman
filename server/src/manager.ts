import { ocRO, ocRW, mgr } from "./db";

export type SessionRow = {
  id: string;
  parent_id: string | null;
  slug: string;
  directory: string;
  title: string;
  time_created: number;
  time_updated: number;
  time_archived: number | null;
  message_count: number;
};

export type SessionMeta = {
  session_id: string;
  folder_id: string | null;
  tags: string | null;
  notes: string | null;
  pinned: number;
};

export type Folder = {
  id: string;
  name: string;
  color: string | null;
  position: number;
  created_at: number;
};

export function getSession(id: string): SessionRow | null {
  return (ocRO
    .query(
      `SELECT s.id, s.parent_id, s.slug, s.directory, s.title,
              s.time_created, s.time_updated, s.time_archived,
              (SELECT COUNT(*) FROM message m WHERE m.session_id = s.id) AS message_count
       FROM session s WHERE s.id = ?`,
    )
    .get(id) as SessionRow | undefined) ?? null;
}

export function getAllSessions(): SessionRow[] {
  return ocRO
    .query(
      `SELECT s.id, s.parent_id, s.slug, s.directory, s.title,
              s.time_created, s.time_updated, s.time_archived,
              (SELECT COUNT(*) FROM message m WHERE m.session_id = s.id) AS message_count
       FROM session s`,
    )
    .all() as SessionRow[];
}

export function getMetaMap(): Map<string, SessionMeta> {
  const rows = mgr.query("SELECT * FROM session_meta").all() as SessionMeta[];
  return new Map(rows.map((r) => [r.session_id, r]));
}

export function listFolders(): Folder[] {
  return mgr
    .query("SELECT * FROM folders ORDER BY position ASC, name ASC")
    .all() as Folder[];
}

export function createFolder(name: string, color: string | null): Folder {
  const id = "fld_" + crypto.randomUUID();
  const now = Date.now();
  const pos = ((mgr.query("SELECT MAX(position) AS p FROM folders").get() as any)?.p ?? 0) + 1;
  mgr
    .query(
      "INSERT INTO folders(id, name, color, position, created_at) VALUES(?,?,?,?,?)",
    )
    .run(id, name, color, pos, now);
  return { id, name, color, position: pos, created_at: now };
}

export function updateFolder(
  id: string,
  patch: { name?: string; color?: string | null; position?: number },
): boolean {
  const sets: string[] = [];
  const vals: any[] = [];
  if (patch.name !== undefined) {
    sets.push("name = ?");
    vals.push(patch.name);
  }
  if (patch.color !== undefined) {
    sets.push("color = ?");
    vals.push(patch.color);
  }
  if (patch.position !== undefined) {
    sets.push("position = ?");
    vals.push(patch.position);
  }
  if (!sets.length) return false;
  vals.push(id);
  mgr.query(`UPDATE folders SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  return true;
}

export function deleteFolder(id: string): void {
  mgr.query("UPDATE session_meta SET folder_id = NULL WHERE folder_id = ?").run(id);
  mgr.query("DELETE FROM folders WHERE id = ?").run(id);
}

export function setSessionFolder(sessionId: string, folderId: string | null): void {
  mgr
    .query(
      `INSERT INTO session_meta(session_id, folder_id) VALUES(?, ?)
       ON CONFLICT(session_id) DO UPDATE SET folder_id = excluded.folder_id`,
    )
    .run(sessionId, folderId);
}

export function setSessionPinned(sessionId: string, pinned: boolean): void {
  mgr
    .query(
      `INSERT INTO session_meta(session_id, pinned) VALUES(?, ?)
       ON CONFLICT(session_id) DO UPDATE SET pinned = excluded.pinned`,
    )
    .run(sessionId, pinned ? 1 : 0);
}

export function setArchived(sessionId: string, archived: boolean): void {
  ocRW
    .query("UPDATE session SET time_archived = ? WHERE id = ?")
    .run(archived ? Date.now() : null, sessionId);
}

export function renameSession(sessionId: string, title: string): void {
  ocRW.query("UPDATE session SET title = ? WHERE id = ?").run(title, sessionId);
}

export function getSessionsByIds(ids: string[]): Map<string, { title: string; directory: string }> {
  const out = new Map<string, { title: string; directory: string }>();
  if (!ids.length) return out;
  const placeholders = ids.map(() => "?").join(",");
  const rows = ocRO
    .query(`SELECT id, title, directory FROM session WHERE id IN (${placeholders})`)
    .all(...ids) as { id: string; title: string; directory: string }[];
  for (const r of rows) out.set(r.id, { title: r.title, directory: r.directory });
  return out;
}

export function distinctDirectories(): string[] {
  const rows = ocRO
    .query("SELECT DISTINCT directory FROM session ORDER BY directory")
    .all() as { directory: string }[];
  return rows.map((r) => r.directory).filter(Boolean);
}

export function sessionDirectory(id: string): string | null {
  const r = ocRO.query("SELECT directory FROM session WHERE id = ?").get(id) as
    | { directory: string }
    | undefined;
  return r?.directory ?? null;
}
