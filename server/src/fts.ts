import { ocRO, mgr, getSetting, setSetting } from "./db";

type PartRow = {
  rowid: number;
  id: string;
  message_id: string;
  session_id: string;
  data: string;
  time_updated: number;
};

const MAX_TEXT = 20000;
const MAX_TOOL_OUTPUT = 6000;

/** Extract indexable text from an opencode part payload. */
export function partText(type: string, d: any): string {
  switch (type) {
    case "text":
    case "reasoning":
      return String(d?.text ?? "").slice(0, MAX_TEXT);
    case "tool": {
      const st = d?.state ?? {};
      const input = st.input ? JSON.stringify(st.input) : "";
      const output = String(st.output ?? st.error ?? "").slice(0, MAX_TOOL_OUTPUT);
      return [d?.tool ?? "", st.status ?? "", st.title ?? "", input, output]
        .filter(Boolean)
        .join("\n");
    }
    case "file":
      return [d?.filename ?? "", d?.url ?? ""].join(" ");
    case "patch":
      return Array.isArray(d?.files) ? d.files.join("\n") : "";
    case "agent":
      return String(d?.name ?? "");
    case "subtask":
      return [d?.description ?? "", d?.prompt ?? ""].join("\n");
    default:
      return "";
  }
}

const deleteStmt = () => mgr.query("DELETE FROM part_fts WHERE rowid = ?");
const insertStmt = () =>
  mgr.query(
    "INSERT INTO part_fts(rowid, text, part_id, session_id, message_id, type) VALUES(?,?,?,?,?,?)",
  );

function indexRows(rows: PartRow[]): void {
  if (!rows.length) return;
  const del = deleteStmt();
  const ins = insertStmt();
  const tx = mgr.transaction((batch: PartRow[]) => {
    for (const r of batch) {
      let d: any;
      try {
        d = JSON.parse(r.data);
      } catch {
        continue;
      }
      const type = d?.type ?? "";
      const text = partText(type, d);
      del.run(r.rowid);
      if (text && text.trim().length >= 2) {
        ins.run(r.rowid, text, r.id, r.session_id, r.message_id, type);
      }
    }
  });
  tx(rows);
}

/**
 * One bounded sync pass. On a fresh index it walks opencode's parts table in
 * rowid batches (resumable across calls). Once caught up it switches to an
 * incremental pass keyed on time_updated.
 *
 * Returns the number of rows processed and whether the initial build is done.
 */
export function syncFts(maxRows = 1500): { indexed: number; done: boolean } {
  const bootDone = getSetting("fts_boot_done");

  if (bootDone !== "1") {
    const cursor = Number(getSetting("fts_cursor") ?? "0");
    const rows = ocRO
      .query(
        "SELECT rowid, id, message_id, session_id, data, time_updated FROM part WHERE rowid > ? ORDER BY rowid LIMIT ?",
      )
      .all(cursor, maxRows) as PartRow[];
    if (!rows.length) {
      setSetting("fts_boot_done", "1");
      setSetting("fts_last_sync_ms", String(Date.now()));
      return { indexed: 0, done: true };
    }
    indexRows(rows);
    const next = rows[rows.length - 1]!.rowid;
    if (rows.length < maxRows) {
      setSetting("fts_boot_done", "1");
      setSetting("fts_last_sync_ms", String(Date.now()));
      return { indexed: rows.length, done: true };
    }
    setSetting("fts_cursor", String(next));
    return { indexed: rows.length, done: false };
  }

  const lastRaw = getSetting("fts_last_sync_ms");
  if (lastRaw === null) {
    setSetting("fts_boot_done", "0");
    setSetting("fts_cursor", "0");
    return { indexed: 0, done: false };
  }
  const since = Number(lastRaw) - 2000; // small overlap to avoid missed updates
  const rows = ocRO
    .query(
      "SELECT rowid, id, message_id, session_id, data, time_updated FROM part WHERE time_updated >= ? LIMIT ?",
    )
    .all(since, maxRows) as PartRow[];
  indexRows(rows);
  setSetting("fts_last_sync_ms", String(Date.now()));
  return { indexed: rows.length, done: true };
}

/** Remove index rows for sessions that no longer exist. */
export function pruneFts(): number {
  const ids = ocRO.query("SELECT id FROM session").all() as { id: string }[];
  const valid = new Set(ids.map((r) => r.id));
  const rows = mgr
    .query("SELECT rowid, session_id FROM part_fts")
    .all() as { rowid: number; session_id: string }[];
  const del = deleteStmt();
  let removed = 0;
  const tx = mgr.transaction((batch: { rowid: number; session_id: string }[]) => {
    for (const r of batch) {
      if (!valid.has(r.session_id)) {
        del.run(r.rowid);
        removed++;
      }
    }
  });
  tx(rows);
  return removed;
}

export type SearchHit = {
  part_id: string;
  session_id: string;
  message_id: string;
  type: string;
  snippet: string;
};

export function search(q: string, limit = 200): SearchHit[] {
  const tokens = (q.match(/[\p{L}\p{N}_]+/gu) ?? []).slice(0, 12);
  if (!tokens.length) return [];
  const match = tokens.map((t) => `"${t}"*`).join(" AND ");
  try {
    return mgr
      .query(
        `SELECT part_id, session_id, message_id, type,
                snippet(part_fts, 0, '<mark>', '</mark>', '…', 14) AS snippet
         FROM part_fts
         WHERE part_fts MATCH ?
         ORDER BY rank
         LIMIT ?`,
      )
      .all(match, limit) as SearchHit[];
  } catch {
    // Fallback for malformed FTS queries.
    const like = `%${q}%`;
    return mgr
      .query(
        `SELECT part_id, session_id, message_id, type, substr(text,1,200) AS snippet
         FROM part_fts WHERE text LIKE ? LIMIT ?`,
      )
      .all(like, limit) as SearchHit[];
  }
}
