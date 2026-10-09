import { join, normalize } from "node:path";
import { syncFts, pruneFts, search } from "./fts";
import { aggregateStats, sessionStats, usageBySession } from "./stats";
import {
  activateProfileForUser,
  createProfile,
  deleteProfile,
  ensureDefaultProfile,
  getUserActiveProfile,
  getProfile,
  listProfiles,
  removeProfileAuth,
  renameProfile,
  setProfileAuth,
} from "./profiles";
import {
  authenticate,
  clearCookie,
  createSession,
  createUser,
  deleteSession,
  deleteUser,
  findUsername,
  isSecure,
  listUsers,
  adminCount,
  setAdmin,
  setDisabled,
  setPassword,
  sessionCookie,
  userCount,
  parseCookies,
  COOKIE_NAME,
  validatePassword,
  validateUsername,
  verifyPassword,
} from "./auth";
import {
  createFolder,
  deleteFolder,
  distinctDirectories,
  getAllSessions,
  getMetaMap,
  getSession,
  getSessionsByIds,
  listFolders,
  renameSession,
  sessionDirectory,
  setArchived,
  setSessionFolder,
  setSessionPinned,
  updateFolder,
  type SessionRow,
} from "./manager";

import { PORT, HOST, OPENCODE_URL, DIST, TERMINAL_URL } from "./config";

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

const parseCookieToken = (req: Request): string | null =>
  parseCookies(req)[COOKIE_NAME] ?? null;

function serialize(s: SessionRow, meta: ReturnType<typeof getMetaMap>) {
  const m = meta.get(s.id);
  return {
    id: s.id,
    parentId: s.parent_id,
    slug: s.slug,
    directory: s.directory,
    title: s.title,
    timeCreated: s.time_created,
    timeUpdated: s.time_updated,
    timeArchived: s.time_archived,
    messageCount: s.message_count,
    pinned: m?.pinned ? 1 : 0,
    folderId: m?.folder_id ?? null,
    tags: m?.tags ?? null,
    notes: m?.notes ?? null,
  };
}

function listSessions(url: URL) {
  const q = (url.searchParams.get("q") ?? "").toLowerCase().trim();
  const folder = url.searchParams.get("folder"); // folder id | "none"
  const archived = url.searchParams.get("archived") ?? "0"; // "0" | "1" | "all"
  const directory = url.searchParams.get("directory");
  const sort = url.searchParams.get("sort") ?? "updated";

  const meta = getMetaMap();
  let rows = getAllSessions().map((s) => serialize(s, meta));

  if (q) {
    rows = rows.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.directory.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q),
    );
  }
  if (archived !== "all") {
    rows = rows.filter((s) => (archived === "1" ? s.timeArchived != null : s.timeArchived == null));
  }
  if (directory) rows = rows.filter((s) => s.directory === directory);
  if (folder) {
    rows = rows.filter((s) => (folder === "none" ? !s.folderId : s.folderId === folder));
  }

  rows.sort((a, b) => {
    if (a.pinned !== b.pinned) return b.pinned - a.pinned;
    if (sort === "created") return b.timeCreated - a.timeCreated;
    if (sort === "title") return a.title.localeCompare(b.title);
    if (sort === "messages") return b.messageCount - a.messageCount;
    if (sort === "tokens") return (b as any).usage?.total - (a as any).usage?.total;
    if (sort === "cost") return (b as any).usage?.cost - (a as any).usage?.cost;
    return b.timeUpdated - a.timeUpdated;
  });

  const usage = usageBySession();
  return rows.map((r) => ({ ...r, usage: usage.get(r.id) ?? null }));
}

async function readBody(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

async function proxyOpenCode(req: Request, url: URL): Promise<Response> {
  const upstreamPath = url.pathname.replace(/^\/oc/, "") || "/";
  const target = new URL(OPENCODE_URL + upstreamPath + url.search);

  // Inject the correct directory context for session-scoped calls.
  const m = url.pathname.match(/^\/oc\/session\/(ses_[A-Za-z0-9]+)/);
  if (m && !target.searchParams.has("directory")) {
    const dir = sessionDirectory(m[1]);
    if (dir) target.searchParams.set("directory", dir);
  }

  const isSSE =
    target.pathname === "/global/event" || target.pathname === "/event";

  const headers = new Headers();
  const ct = req.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  headers.set("accept", isSSE ? "text/event-stream" : (req.headers.get("accept") ?? "*/*"));

  const init: RequestInit = { method: req.method, headers, redirect: "manual" };
  if (!["GET", "HEAD"].includes(req.method)) init.body = await req.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (e) {
    return json({ error: "opencode_unreachable", detail: String(e) }, 502);
  }

  const out = new Headers();
  for (const [k, v] of upstream.headers) {
    const lk = k.toLowerCase();
    if (lk === "content-type" || lk === "cache-control" || lk === "vary") out.set(k, v);
  }
  if (isSSE) {
    out.set("content-type", "text/event-stream");
    out.set("cache-control", "no-cache");
    out.set("x-accel-buffering", "no");
    out.set("connection", "keep-alive");
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

const TERMINAL_FALLBACK = `<!doctype html><html><head><meta charset="utf-8">
<title>Terminal unavailable</title>
<style>body{font-family:system-ui,sans-serif;background:#111418;color:#c9d1d9;display:flex;height:100vh;margin:0;align-items:center;justify-content:center}
.box{max-width:520px;padding:24px;line-height:1.5}code{background:#1c2128;padding:2px 6px;border-radius:4px}</style></head>
<body><div class="box"><h2>Legacy terminal backend not running</h2>
<p>This route is the optional legacy <b>pyxtermjs</b> backend. The manager's
built-in terminal uses opencode's native PTY and does not need it.</p>
<p class="muted">Set <code>TERMINAL_URL</code> if you really want the legacy backend.</p></div></body></html>`;

/** HTTP proxy to the optional pyxtermjs terminal backend. */
async function proxyTerminal(req: Request, url: URL): Promise<Response> {
  const upstreamPath = url.pathname.replace(/^\/terminal/, "") || "/";
  const target = new URL(TERMINAL_URL + upstreamPath + url.search);
  const headers = new Headers();
  const ct = req.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  headers.set("accept", req.headers.get("accept") ?? "*/*");
  headers.set("host", new URL(TERMINAL_URL).host);
  const init: RequestInit = { method: req.method, headers, redirect: "manual" };
  if (!["GET", "HEAD"].includes(req.method)) init.body = await req.arrayBuffer();
  try {
    const upstream = await fetch(target, init);
    const out = new Headers();
    for (const [k, v] of upstream.headers) out.set(k, v);
    return new Response(upstream.body, { status: upstream.status, headers: out });
  } catch {
    return new Response(TERMINAL_FALLBACK, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
}

async function serveStatic(url: URL): Promise<Response> {
  const pathname = decodeURIComponent(url.pathname);
  const rel = pathname === "/" ? "/index.html" : pathname;
  const full = normalize(join(DIST, rel));
  if (!full.startsWith(DIST)) return new Response("forbidden", { status: 403 });
  const file = Bun.file(full);
  if (await file.exists()) {
    const headers = new Headers();
    if (rel.startsWith("/assets/")) headers.set("cache-control", "public, max-age=31536000, immutable");
    return new Response(file, { headers });
  }
  const index = Bun.file(join(DIST, "index.html"));
  if (await index.exists()) return new Response(index);
  return new Response("frontend not built yet", { status: 404 });
}

// ---- WebSocket bridge to opencode's native PTY ----------------------------
// The browser cannot reach opencode's port directly, so we upgrade a socket on
// /ptyws/{ptyID} and relay frames to `opencode/pty/{ptyID}/connect`.

const OC_WS = OPENCODE_URL.replace(/^http/, "ws");

type PtySocket = {
  ptyID: string;
  query: string;
  upstream: WebSocket | null;
  pending: unknown[];
};

function ptyUpgrade(req: Request, server: any, url: URL): Response | undefined {
  if (!authenticate(req)) return new Response("unauthorized", { status: 401 });
  const ptyID = decodeURIComponent(url.pathname.slice("/ptyws/".length));
  if (!ptyID) return new Response("missing pty id", { status: 400 });
  const data: PtySocket = { ptyID, query: url.search.slice(1), upstream: null, pending: [] };
  const ok = server.upgrade(req, { data });
  return ok ? undefined : new Response("websocket upgrade failed", { status: 400 });
}

function wsOpen(ws: any) {
  const data = ws.data as PtySocket;
  const target = `${OC_WS}/pty/${encodeURIComponent(data.ptyID)}/connect${
    data.query ? "?" + data.query : ""
  }`;
  let upstream: WebSocket;
  try {
    upstream = new WebSocket(target);
  } catch {
    ws.close();
    return;
  }
  upstream.binaryType = "arraybuffer";
  data.upstream = upstream;
  upstream.addEventListener("open", () => {
    for (const m of data.pending) {
      try {
        upstream.send(m as any);
      } catch {}
    }
    data.pending = [];
  });
  upstream.addEventListener("message", (ev: any) => {
    try {
      ws.send(ev.data);
    } catch {}
  });
  upstream.addEventListener("close", () => {
    try {
      ws.close();
    } catch {}
  });
  upstream.addEventListener("error", () => {
    try {
      ws.close();
    } catch {}
  });
}

function wsMessage(ws: any, msg: string | Uint8Array) {
  const data = ws.data as PtySocket;
  if (data.upstream && data.upstream.readyState === WebSocket.OPEN) {
    try {
      data.upstream.send(msg as any);
    } catch {}
  } else {
    data.pending.push(msg);
  }
}

function wsClose(ws: any) {
  const data = ws.data as PtySocket;
  try {
    data.upstream?.close();
  } catch {}
}

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const p = url.pathname;
  const method = req.method.toUpperCase();
  const secure = isSecure(req);

  // ---------- auth ----------
  if (p === "/api/auth/me" && method === "GET") {
    const user = authenticate(req);
    return json({ authenticated: !!user, needsSetup: userCount() === 0, user });
  }

  if (p === "/api/auth/setup" && method === "POST") {
    if (userCount() > 0) return json({ error: "already_configured" }, 403);
    const b = await readBody(req);
    const uErr = validateUsername(String(b.username ?? ""));
    if (uErr) return json({ error: uErr }, 400);
    const pErr = validatePassword(String(b.password ?? ""));
    if (pErr) return json({ error: pErr }, 400);
    const user = await createUser(String(b.username), String(b.password), true);
    const token = createSession(
      user.id,
      req.headers.get("user-agent") ?? "",
      req.headers.get("x-forwarded-for") ?? "",
    );
    return json(
      { user: { id: user.id, username: user.username, is_admin: user.is_admin } },
      200,
      { "set-cookie": sessionCookie(token, secure) },
    );
  }

  if (p === "/api/auth/login" && method === "POST") {
    const b = await readBody(req);
    const u = findUsername(String(b.username ?? ""));
    if (!u || u.disabled || !(await verifyPassword(u, String(b.password ?? "")))) {
      return json({ error: "invalid credentials" }, 401);
    }
    const token = createSession(
      u.id,
      req.headers.get("user-agent") ?? "",
      req.headers.get("x-forwarded-for") ?? "",
    );
    // apply the user's active config profile (best effort)
    const ap = getUserActiveProfile(u.id);
    if (ap) activateProfileForUser(u.id, ap).catch(() => {});
    return json(
      { user: { id: u.id, username: u.username, is_admin: u.is_admin } },
      200,
      { "set-cookie": sessionCookie(token, secure) },
    );
  }

  if (p === "/api/auth/logout" && method === "POST") {
    const cookie = parseCookieToken(req);
    if (cookie) deleteSession(cookie);
    return json({ ok: true }, 200, { "set-cookie": clearCookie(secure) });
  }

  // everything else (api + opencode proxy) requires a session
  const guard = p.startsWith("/api/") || p === "/oc" || p.startsWith("/oc/");
  const user = authenticate(req);
  if (guard && !user) return json({ error: "unauthorized" }, 401);

  // ---------- admin: user management ----------
  if (p === "/api/users" && method === "GET") {
    if (!user!.is_admin) return json({ error: "forbidden" }, 403);
    return json(listUsers());
  }
  if (p === "/api/users" && method === "POST") {
    if (!user!.is_admin) return json({ error: "forbidden" }, 403);
    const b = await readBody(req);
    const uErr = validateUsername(String(b.username ?? ""));
    if (uErr) return json({ error: uErr }, 400);
    const pErr = validatePassword(String(b.password ?? ""));
    if (pErr) return json({ error: pErr }, 400);
    if (findUsername(String(b.username))) return json({ error: "username taken" }, 409);
    const created = await createUser(String(b.username), String(b.password), !!b.isAdmin);
    return json({ id: created.id, username: created.username, is_admin: created.is_admin }, 201);
  }

  let um = p.match(/^\/api\/users\/([^/]+)$/);
  if (um) {
    if (!user!.is_admin) return json({ error: "forbidden" }, 403);
    const id = um[1]!;
    if (method === "PATCH") {
      const b = await readBody(req);
      const target = findUser(id);
      if (!target) return json({ error: "not found" }, 404);
      if (typeof b.password === "string") {
        const pErr = validatePassword(b.password);
        if (pErr) return json({ error: pErr }, 400);
        await setPassword(id, b.password);
      }
      if (typeof b.isAdmin === "boolean") {
        if (!b.isAdmin && target.is_admin && adminCount() <= 1)
          return json({ error: "cannot remove the last admin" }, 400);
        setAdmin(id, b.isAdmin);
      }
      if (typeof b.disabled === "boolean") {
        if (b.disabled && target.is_admin && adminCount() <= 1)
          return json({ error: "cannot disable the last admin" }, 400);
        if (b.disabled && id === user!.id) return json({ error: "cannot disable yourself" }, 400);
        setDisabled(id, b.disabled);
      }
      return json({ ok: true });
    }
    if (method === "DELETE") {
      const target = findUser(id);
      if (!target) return json({ error: "not found" }, 404);
      if (id === user!.id) return json({ error: "cannot delete yourself" }, 400);
      if (target.is_admin && adminCount() <= 1)
        return json({ error: "cannot delete the last admin" }, 400);
      deleteUser(id);
      return json({ ok: true });
    }
  }

  // ---------- config profiles ----------
  if (p === "/api/profiles" && method === "GET") {
    ensureDefaultProfile();
    return json(listProfiles());
  }
  if (p === "/api/profiles/active" && method === "GET") {
    return json({ profileId: getUserActiveProfile(user!.id) });
  }
  if (p === "/api/profiles" && method === "POST") {
    if (!user!.is_admin) return json({ error: "forbidden" }, 403);
    const b = await readBody(req);
    if (!b.name) return json({ error: "name required" }, 400);
    return json(createProfile(String(b.name)), 201);
  }

  let pm = p.match(/^\/api\/profiles\/([^/]+)$/);
  if (pm) {
    if (!user!.is_admin) return json({ error: "forbidden" }, 403);
    const id = pm[1]!;
    if (method === "PATCH") {
      const b = await readBody(req);
      if (b.name) renameProfile(id, String(b.name));
      return json({ ok: true });
    }
    if (method === "DELETE") {
      deleteProfile(id);
      return json({ ok: true });
    }
  }

  pm = p.match(/^\/api\/profiles\/([^/]+)\/activate$/);
  if (pm && method === "POST") {
    const id = pm[1]!;
    if (!getProfile(id)) return json({ error: "not found" }, 404);
    const res = await activateProfileForUser(user!.id, id);
    return json({ ok: true, ...res });
  }

  pm = p.match(/^\/api\/profiles\/([^/]+)\/auth$/);
  if (pm && method === "PUT") {
    if (!user!.is_admin) return json({ error: "forbidden" }, 403);
    const id = pm[1]!;
    if (!getProfile(id)) return json({ error: "not found" }, 404);
    const b = await readBody(req);
    const list: { providerID: string; key: string }[] = Array.isArray(b.providers)
      ? b.providers
      : b.providerID
        ? [{ providerID: b.providerID, key: b.key }]
        : [];
    for (const entry of list) {
      if (!entry.providerID || !entry.key) continue;
      setProfileAuth(id, String(entry.providerID), { type: b.type ?? "api", key: String(entry.key) });
    }
    return json({ ok: true });
  }

  pm = p.match(/^\/api\/profiles\/([^/]+)\/auth\/([^/]+)$/);
  if (pm && method === "DELETE") {
    if (!user!.is_admin) return json({ error: "forbidden" }, 403);
    removeProfileAuth(pm[1]!, decodeURIComponent(pm[2]!));
    return json({ ok: true });
  }

  if (p === "/api/health") {
    let terminal = false;
    try {
      const r = await fetch(TERMINAL_URL + "/", { method: "HEAD" });
      terminal = r.ok;
    } catch {}
    return json({ ok: true, upstream: OPENCODE_URL, terminal });
  }

  if (p === "/api/meta") {
    return json({
      folders: listFolders(),
      directories: distinctDirectories(),
    });
  }

  if (p === "/api/config") {
    let terminal = false;
    try {
      const r = await fetch(OPENCODE_URL + "/pty", { method: "GET" });
      terminal = r.ok;
    } catch {}
    return json({ opencodeUrl: OPENCODE_URL, terminal, platform: process.platform });
  }

  if (p === "/api/sessions" && method === "GET") return json(listSessions(url));

  if (p === "/api/stats" && method === "GET") return json(aggregateStats());

  let sm = p.match(/^\/api\/sessions\/([^/]+)\/stats$/);
  if (sm && method === "GET") return json(sessionStats(sm[1]!));

  if (p === "/api/search" && method === "GET") {
    const q = url.searchParams.get("q") ?? "";
    const hits = search(q);
    const byId = getSessionsByIds([...new Set(hits.map((h) => h.session_id))]);
    const sessions = hits.map((h) => ({
      ...h,
      title: byId.get(h.session_id)?.title ?? "(unknown)",
      directory: byId.get(h.session_id)?.directory ?? "",
    }));
    return json({ query: q, count: sessions.length, results: sessions });
  }

  if (p === "/api/folders" && method === "GET") return json(listFolders());
  if (p === "/api/folders" && method === "POST") {
    const b = await readBody(req);
    if (!b.name) return json({ error: "name required" }, 400);
    return json(createFolder(String(b.name), b.color ?? null), 201);
  }

  let m = p.match(/^\/api\/folders\/([^/]+)$/);
  if (m) {
    const id = m[1]!;
    if (method === "PATCH") {
      const b = await readBody(req);
      updateFolder(id, b);
      return json({ ok: true });
    }
    if (method === "DELETE") {
      deleteFolder(id);
      return json({ ok: true });
    }
  }

  m = p.match(/^\/api\/sessions\/([^/]+)$/);
  if (m) {
    const id = m[1]!;
    if (method === "GET") {
      const s = getSession(id);
      return s ? json(serialize(s, getMetaMap())) : json({ error: "not found" }, 404);
    }
    if (method === "PATCH") {
      const b = await readBody(req);
      if (typeof b.title === "string") renameSession(id, b.title);
      return json({ ok: true });
    }
  }

  m = p.match(/^\/api\/sessions\/([^/]+)\/(archive|unarchive|folder|pin)$/);
  if (m && method === "POST") {
    const id = m[1]!;
    const action = m[2]!;
    const b = action === "folder" || action === "pin" ? await readBody(req) : {};
    if (!getSession(id)) return json({ error: "not found" }, 404);
    switch (action) {
      case "archive":
        setArchived(id, true);
        break;
      case "unarchive":
        setArchived(id, false);
        break;
      case "folder":
        setSessionFolder(id, b.folderId ?? null);
        break;
      case "pin":
        setSessionPinned(id, Boolean(b.pinned));
        break;
    }
    return json({ ok: true });
  }

  if (p === "/terminal" || p.startsWith("/terminal/")) return proxyTerminal(req, url);

  if (p === "/oc" || p.startsWith("/oc/")) return proxyOpenCode(req, url);

  return serveStatic(url);
}

// ---- background search indexing ----
let syncing = false;
function runSync() {
  if (syncing) return;
  syncing = true;
  try {
    const { indexed, done } = syncFts(1500);
    if (indexed) console.log(`[fts] indexed ${indexed} parts${done ? " (caught up)" : ""}`);
  } catch (e) {
    console.error("[fts] sync error:", e);
  } finally {
    syncing = false;
  }
}

// Defer indexing so the HTTP server starts accepting requests immediately.
setTimeout(() => {
  try {
    console.log(`[fts] removed ${pruneFts()} stale index rows`);
  } catch (e) {
    console.error("[boot] prune failed:", e);
  }
  try {
    ensureDefaultProfile();
    console.log("[profiles] ready");
  } catch (e) {
    console.error("[boot] profiles failed:", e);
  }
  runSync();
}, 500);
const syncTimer = setInterval(runSync, 1500);
if (typeof syncTimer.unref === "function") syncTimer.unref();

Bun.serve({
  port: PORT,
  hostname: HOST,
  idleTimeout: 255,
  development: false,
  async fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/ptyws/")) {
      const res = ptyUpgrade(req, server, url);
      if (res) return res;
      return undefined;
    }
    return handle(req);
  },
  websocket: {
    open: wsOpen,
    message: wsMessage,
    close: wsClose,
  },
});

console.log(`opencode-manager listening on http://${HOST}:${PORT}  (upstream ${OPENCODE_URL})`);
