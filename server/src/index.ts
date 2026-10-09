import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
} from "node:path";
import { readdir, stat } from "node:fs/promises";
import { syncFts, pruneFts, search } from "./fts";
import { aggregateStats, sessionStats, usageBySession } from "./stats";
import {
  activateProfileForUser,
  createProfile,
  deleteProfile,
  ensureDefaultProfile,
  getUserActiveProfile,
  getUserOnboarded,
  getProfile,
  listProfiles,
  removeProfileAuth,
  renameProfile,
  setProfileAuth,
  setUserOnboarded,
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
  sessionIdsByMeta,
  setArchived,
  setSessionFolder,
  setSessionOwner,
  setSessionPinned,
  updateFolder,
  type SessionRow,
} from "./manager";

import {
  PORT,
  HOST,
  OPENCODE_URL,
  DIST,
  TERMINAL_URL,
  APP_ROOT,
  VERSION,
  UPDATE_REPO,
} from "./config";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import {
  serviceStatus,
  installService,
  uninstallService,
  restartSelf,
} from "./service";

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
    userId: m?.user_id ?? null,
    profileId: m?.profile_id ?? null,
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

/** Absolute path to the opencode CLI (so terminals don't rely on PATH). */
const OPENCODE_BIN = (() => {
  try {
    return Bun.which("opencode") ?? "opencode";
  } catch {
    return "opencode";
  }
})();

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

// ---- codebase explorer (treemap data + file access) -----------------------

const FS_IGNORE = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".cache",
  ".parcel-cache",
  ".venv",
  "venv",
  "__pycache__",
  "coverage",
  "target",
  ".turbo",
  ".svelte-kit",
  ".output",
  ".DS_Store",
]);

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".bmp": "image/bmp",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

/** Resolve `rel` inside `root`, refusing paths that escape it. */
function safeResolve(root: string, rel: string): string | null {
  const base = resolve(root);
  const abs = resolve(base, rel || ".");
  const r = relative(base, abs);
  if (r.startsWith("..") || isAbsolute(r)) return null;
  return abs;
}

type TreeNode = {
  name: string;
  path: string;
  type: "dir" | "file";
  size: number;
  ext?: string;
  children?: TreeNode[];
};

async function buildTree(
  root: string,
  absDir: string,
  relDir: string,
  maxDepth: number,
  budget: { left: number },
): Promise<TreeNode[]> {
  if (maxDepth < 0 || budget.left <= 0) return [];
  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: TreeNode[] = [];
  for (const e of entries) {
    if (budget.left <= 0) break;
    if (e.name.startsWith(".") && e.name !== ".env" && e.name !== ".gitignore") continue;
    if (FS_IGNORE.has(e.name)) continue;
    const childRel = relDir ? `${relDir}/${e.name}` : e.name;
    const childAbs = join(absDir, e.name);
    if (e.isDirectory()) {
      budget.left--;
      const children = await buildTree(root, childAbs, childRel, maxDepth - 1, budget);
      const size = children.reduce((n, c) => n + c.size, 0);
      if (size > 0) out.push({ name: e.name, path: childRel, type: "dir", size, children });
    } else if (e.isFile()) {
      let sz = 0;
      try {
        sz = (await stat(childAbs)).size;
      } catch {}
      budget.left--;
      out.push({
        name: e.name,
        path: childRel,
        type: "file",
        size: Math.max(sz, 1),
        ext: extname(e.name).toLowerCase(),
      });
    }
  }
  return out;
}

// ---- update check / apply (GitHub releases) -------------------------------

let updateCache: { at: number; data: any } | null = null;

function semverGt(a: string, b: string): boolean {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
}

async function fetchLatest(force = false): Promise<any> {
  if (!force && updateCache && Date.now() - updateCache.at < 60 * 60 * 1000) {
    return updateCache.data;
  }
  try {
    const res = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
      headers: { "user-agent": "aiman", accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error(`github ${res.status}`);
    const j: any = await res.json();
    const latest = String(j.tag_name ?? "").replace(/^v/, "");
    const data = {
      current: VERSION,
      latest,
      available: latest ? semverGt(latest, VERSION) : false,
      url: j.html_url ?? null,
      notes: String(j.body ?? "").slice(0, 2000),
      publishedAt: j.published_at ?? null,
      assets: (j.assets ?? []).map((a: any) => ({ name: a.name, url: a.browser_download_url })),
    };
    updateCache = { at: Date.now(), data };
    return data;
  } catch (e) {
    return { current: VERSION, latest: null, available: false, error: String(e) };
  }
}

function copyRecursive(src: string, dest: string): void {
  const st = statSync(src);
  if (st.isDirectory()) {
    mkdirSync(dest, { recursive: true });
    for (const name of readdirSync(src)) copyRecursive(join(src, name), join(dest, name));
  } else {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  }
}

/**
 * Download the latest release tarball and overlay its app files onto APP_ROOT.
 * User data lives in AIMAN_HOME, so it is untouched. A server restart is needed
 * for new server code to take effect.
 */
async function applyUpdate(): Promise<{ ok: boolean; latest: string; restartRequired: boolean }> {
  const info = await fetchLatest(true);
  if (!info?.available || !info.latest) throw new Error(info?.error ?? "no update available");
  const asset =
    (info.assets || []).find((a: any) => a.name.endsWith(".tar.gz")) ??
    (info.assets || []).find((a: any) => a.name.endsWith(".zip"));
  if (!asset) throw new Error("release has no downloadable asset");

  const tmp = mkdtempSync(join(tmpdir(), "aiman-update-"));
  try {
    const file = join(tmp, asset.name);
    const res = await fetch(asset.url);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    await Bun.write(file, res);

    // `tar` handles .tar.gz on all platforms and .zip on Windows/macOS (bsdtar).
    const extract = Bun.spawnSync(["tar", "-xf", file, "-C", tmp]);
    if (!extract.success) throw new Error(`extract failed: ${extract.stderr.toString()}`);

    const dir = readdirSync(tmp).find((n) => n.startsWith("aiman-"));
    if (!dir) throw new Error("unexpected archive layout");
    const src = join(tmp, dir);

    const items = [
      "bin",
      "server",
      "dist",
      "scripts",
      "deploy",
      "package.json",
      "README.md",
      "LICENSE",
      "CHANGELOG.md",
    ];
    for (const item of items) {
      const from = join(src, item);
      if (existsSync(from)) copyRecursive(from, join(APP_ROOT, item));
    }
    return { ok: true, latest: info.latest, restartRequired: true };
  } finally {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {}
  }
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
    return json({
      opencodeUrl: OPENCODE_URL,
      opencodeBin: OPENCODE_BIN,
      terminal,
      platform: process.platform,
      onboarded: getUserOnboarded(user!.id),
      version: VERSION,
    });
  }

  if (p === "/api/update" && method === "GET") {
    return json(await fetchLatest(url.searchParams.has("check")));
  }

  if (p === "/api/update/apply" && method === "POST") {
    if (!user!.is_admin) return json({ error: "forbidden" }, 403);
    try {
      const r = await applyUpdate();
      setTimeout(restartSelf, 800); // reboot into the new version
      return json({ ...r, restarting: true });
    } catch (e) {
      return json({ error: String(e) }, 500);
    }
  }

  if (p === "/api/restart" && method === "POST") {
    if (!user!.is_admin) return json({ error: "forbidden" }, 403);
    setTimeout(restartSelf, 400);
    return json({ ok: true, restarting: true });
  }

  if (p === "/api/service" && method === "GET") return json(serviceStatus());
  if (p === "/api/service/install" && method === "POST") {
    if (!user!.is_admin) return json({ error: "forbidden" }, 403);
    return json(await installService());
  }
  if (p === "/api/service/uninstall" && method === "POST") {
    if (!user!.is_admin) return json({ error: "forbidden" }, 403);
    return json(await uninstallService());
  }

  if (p === "/api/me/onboarded" && method === "POST") {
    const b = await readBody(req);
    setUserOnboarded(user!.id, b.onboarded !== false);
    return json({ ok: true, onboarded: getUserOnboarded(user!.id) });
  }

  if (p === "/api/me/password" && method === "POST") {
    const b = await readBody(req);
    const err = validatePassword(String(b.password ?? ""));
    if (err) return json({ error: err }, 400);
    await setPassword(user!.id, String(b.password));
    return json({ ok: true });
  }

  if (p === "/api/sessions" && method === "GET") return json(listSessions(url));

  if (p === "/api/stats" && method === "GET") {
    const userId = url.searchParams.get("user") || undefined;
    const profileId = url.searchParams.get("profile") || undefined;
    if (userId || profileId) {
      return json(aggregateStats(sessionIdsByMeta({ userId, profileId })));
    }
    return json(aggregateStats());
  }

  if (p === "/api/stats/filters" && method === "GET") {
    return json({
      users: listUsers(),
      profiles: listProfiles().map((x) => ({ id: x.id, name: x.name })),
    });
  }

  let sm = p.match(/^\/api\/sessions\/([^/]+)\/stats$/);
  if (sm && method === "GET") return json(sessionStats(sm[1]!));

  // ---- codebase explorer ----
  if (p === "/api/tree" && method === "GET") {
    const directory = url.searchParams.get("directory");
    if (!directory) return json({ error: "directory required" }, 400);
    const root = resolve(directory);
    const maxDepth = Number(url.searchParams.get("depth") ?? "6");
    try {
      if (!(await stat(root)).isDirectory()) return json({ error: "not a directory" }, 400);
    } catch {
      return json({ error: "directory not found" }, 404);
    }
    const budget = { left: Number(url.searchParams.get("max") ?? "6000") };
    const children = await buildTree(root, root, "", maxDepth, budget);
    const size = children.reduce((n, c) => n + c.size, 0);
    return json({ root, name: basename(root), type: "dir", path: "", size, children });
  }

  if (p === "/api/file" && method === "GET") {
    const directory = url.searchParams.get("directory");
    const relPath = url.searchParams.get("path");
    if (!directory || !relPath) return json({ error: "directory and path required" }, 400);
    const abs = safeResolve(directory, relPath);
    if (!abs) return json({ error: "forbidden" }, 403);
    const f = Bun.file(abs);
    if (!(await f.exists())) return json({ error: "not found" }, 404);
    const ext = extname(abs).toLowerCase();
    const mime = MIME[ext];
    if (mime) return json({ type: "binary", mime, size: f.size, ext });
    const text = await f.text();
    return json({
      type: "text",
      ext,
      size: f.size,
      content: text.length > 400_000 ? text.slice(0, 400_000) : text,
      truncated: text.length > 400_000,
    });
  }

  if (p === "/api/file" && method === "PUT") {
    const b = await readBody(req);
    const directory = String(b.directory ?? "");
    const relPath = String(b.path ?? "");
    if (!directory || !relPath) return json({ error: "directory and path required" }, 400);
    const abs = safeResolve(directory, relPath);
    if (!abs) return json({ error: "forbidden" }, 403);
    if (typeof b.content !== "string") return json({ error: "content required" }, 400);
    try {
      await Bun.write(abs, b.content);
    } catch (e) {
      return json({ error: String(e) }, 500);
    }
    return json({ ok: true, size: b.content.length });
  }

  if (p === "/api/raw" && method === "GET") {
    const directory = url.searchParams.get("directory");
    const relPath = url.searchParams.get("path");
    if (!directory || !relPath) return new Response("bad request", { status: 400 });
    const abs = safeResolve(directory, relPath);
    if (!abs) return new Response("forbidden", { status: 403 });
    const f = Bun.file(abs);
    if (!(await f.exists())) return new Response("not found", { status: 404 });
    const headers = new Headers();
    headers.set("content-type", MIME[extname(abs).toLowerCase()] ?? "application/octet-stream");
    headers.set("cache-control", "private, max-age=60");
    return new Response(f, { headers });
  }

  let cm = p.match(/^\/api\/sessions\/([^/]+)\/claim$/);
  if (cm && method === "POST") {
    setSessionOwner(cm[1]!, user!.id, getUserActiveProfile(user!.id));
    return json({ ok: true });
  }

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
