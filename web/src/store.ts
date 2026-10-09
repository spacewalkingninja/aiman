import { useSyncExternalStore } from "react";
import {
  api,
  type Folder,
  type MessageEntry,
  type Part,
  type Permission,
  type Profile,
  type QuestionRequest,
  type Session,
  type Status,
  type Todo,
} from "./api";

export type View = "chat" | "search" | "terminal" | "users" | "stats" | "profiles";

export type Filters = {
  archived: "0" | "1" | "all";
  folder: string | null; // folder id | "none" | null (all)
  directory: string | null;
  q: string;
  sort: string;
};

type Auth = {
  loading: boolean;
  authenticated: boolean;
  needsSetup: boolean;
  user: { id: string; username: string; is_admin: number } | null;
};

export type ModelOpt = { key: string; label: string; providerID: string; modelID: string };
export type MenuKind = "leader" | "models" | "agents" | "help" | null;

type State = {
  auth: Auth;
  ready: boolean;
  routeReady: boolean;
  connected: boolean;
  sessions: Session[];
  folders: Folder[];
  directories: string[];
  view: View;
  activeSessionId: string | null;
  entries: Record<string, MessageEntry[]>;
  statuses: Record<string, Status>;
  permissions: Record<string, Permission[]>;
  questions: Record<string, QuestionRequest[]>;
  todos: Record<string, Todo[]>;
  filters: Filters;
  toast: string | null;
  models: ModelOpt[];
  agents: string[];
  model: string;
  agent: string;
  menu: MenuKind;
  profiles: Profile[];
  activeProfile: string | null;
};

let state: State = {
  auth: { loading: true, authenticated: false, needsSetup: false, user: null },
  ready: false,
  routeReady: false,
  connected: false,
  sessions: [],
  folders: [],
  directories: [],
  view: "chat",
  activeSessionId: null,
  entries: {},
  statuses: {},
  permissions: {},
  questions: {},
  todos: {},
  filters: { archived: "0", folder: null, directory: null, q: "", sort: "updated" },
  toast: null,
  models: [],
  agents: [],
  model: localStorage.getItem("oc_model") ?? "deepseek/deepseek-flash",
  agent: localStorage.getItem("oc_agent") ?? "build",
  menu: null,
  profiles: [],
  activeProfile: null,
};

const listeners = new Set<() => void>();
function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function useStore(): State {
  return useSyncExternalStore(subscribe, () => state);
}
export const store = { get: () => state, set };

export function toast(msg: string) {
  set({ toast: msg });
  setTimeout(() => set({ toast: null }), 6000);
}

// ---------------- model / agent / menus ----------------

export function setModel(key: string) {
  localStorage.setItem("oc_model", key);
  set({ model: key });
}

export function setAgent(name: string) {
  localStorage.setItem("oc_agent", name);
  set({ agent: name });
}

export function cycleAgent(dir = 1) {
  const list = state.agents;
  if (!list.length) return;
  const i = list.indexOf(state.agent);
  const next = list[(i + dir + list.length) % list.length]!;
  setAgent(next);
  toast(`agent: ${next}`);
}

export function cycleModel(dir = 1) {
  const list = state.models;
  if (!list.length) return;
  const i = list.findIndex((m) => m.key === state.model);
  const next = list[(i + dir + list.length) % list.length]!;
  setModel(next.key);
  toast(`model: ${next.label}`);
}

export function openMenu(menu: MenuKind) {
  set({ menu });
}
export function closeMenu() {
  set({ menu: null });
}

export async function newSession() {
  closeMenu();
  set({ activeSessionId: "__new__", view: "chat" });
}

export async function loadProfiles() {
  try {
    const [profiles, active] = await Promise.all([api.profiles(), api.activeProfile()]);
    set({ profiles, activeProfile: active.profileId });
  } catch {}
}

export async function activateProfile(id: string) {
  try {
    const r = await api.activateProfile(id);
    set({ activeProfile: id });
    const p = state.profiles.find((x) => x.id === id);
    toast(`profile: ${p?.name ?? id}${r.applied?.length ? " · applied " + r.applied.join(", ") : ""}`);
  } catch (e) {
    toast(`profile switch failed: ${e}`);
  }
}

export async function loadModelsAgents() {
  try {
    const [prov, ag] = await Promise.all([api.providers(), api.agents()]);
    const opts: ModelOpt[] = [];
    for (const p of prov.providers ?? [])
      for (const m of Object.values(p.models ?? {}))
        opts.push({
          key: `${p.id}/${m.id}`,
          label: `${p.name} · ${m.name}`,
          providerID: p.id,
          modelID: m.id,
        });
    const hidden = ["compaction", "summary", "title"];
    const primaries = (ag ?? [])
      .filter((a) => a.mode !== "subagent" && !hidden.includes(a.name))
      .map((a) => a.name);
    set({ models: opts, agents: primaries.length ? primaries : ["build"] });
  } catch {}
}

// ---------------- data loading ----------------

let refreshTimer: any = null;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refreshSessions().catch(() => {}), 400);
}

export function filterSessions(sessions: Session[], f: Filters): Session[] {
  const q = f.q.toLowerCase().trim();
  let rows = sessions;
  if (q)
    rows = rows.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.directory.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q),
    );
  if (f.archived !== "all")
    rows = rows.filter((s) => (f.archived === "1" ? s.timeArchived != null : s.timeArchived == null));
  if (f.directory) rows = rows.filter((s) => s.directory === f.directory);
  if (f.folder)
    rows = rows.filter((s) => (f.folder === "none" ? !s.folderId : s.folderId === f.folder));
  rows = rows.slice().sort((a, b) => {
    if (a.pinned !== b.pinned) return b.pinned - a.pinned;
    if (f.sort === "created") return b.timeCreated - a.timeCreated;
    if (f.sort === "title") return a.title.localeCompare(b.title);
    if (f.sort === "messages") return b.messageCount - a.messageCount;
    if (f.sort === "tokens") return (b.usage?.total ?? 0) - (a.usage?.total ?? 0);
    if (f.sort === "cost") return (b.usage?.cost ?? 0) - (a.usage?.cost ?? 0);
    return b.timeUpdated - a.timeUpdated;
  });
  return rows;
}

export async function refreshSessions() {
  const sessions = await api.sessions({ archived: "all" });
  set({ sessions, ready: true });
}

export async function refreshMeta() {
  const meta = await api.meta();
  set({ folders: meta.folders, directories: meta.directories });
}

export async function bootstrapAuth() {
  try {
    const me = await api.authMe();
    set({
      auth: {
        loading: false,
        authenticated: me.authenticated,
        needsSetup: me.needsSetup,
        user: me.user,
      },
    });
    if (me.authenticated) await bootstrap();
  } catch {
    set({ auth: { loading: false, authenticated: false, needsSetup: false, user: null } });
  }
}

export async function login(username: string, password: string) {
  await api.login(username, password);
  const me = await api.authMe();
  set({ auth: { loading: false, authenticated: true, needsSetup: false, user: me.user } });
  await bootstrap();
}

export async function setupAdmin(username: string, password: string) {
  await api.setup(username, password);
  const me = await api.authMe();
  set({ auth: { loading: false, authenticated: true, needsSetup: false, user: me.user } });
  await bootstrap();
}

export async function logout() {
  try {
    await api.logout();
  } catch {}
  try {
    es?.close();
  } catch {}
  es = null;
  set({
    auth: { loading: false, authenticated: false, needsSetup: false, user: null },
    sessions: [],
    folders: [],
    directories: [],
    activeSessionId: null,
    entries: {},
    routeReady: false,
  });
}

export async function bootstrap() {
  await Promise.all([refreshSessions(), refreshMeta(), loadModelsAgents(), loadProfiles()]);
  await applyLocation();
  set({ routeReady: true });
  connectEvents();
}

// ---------------- URL routing (handles) ----------------

const VIEW_PATHS: Record<View, string> = {
  chat: "/sessions",
  search: "/search",
  stats: "/stats",
  terminal: "/terminal",
  users: "/users",
  profiles: "/profiles",
};

/** Canonical URL path for a given view + active session. */
export function pathFor(view: View, activeSessionId: string | null): string {
  if (view === "chat") {
    if (activeSessionId === "__new__") return "/sessions/new";
    if (activeSessionId) return `/sessions/${activeSessionId}`;
    return "/sessions";
  }
  return VIEW_PATHS[view] ?? "/sessions";
}

/** Read the current location and apply it to the store. Safe to call on popstate. */
export async function applyLocation() {
  if (typeof location === "undefined") return;
  const segments = location.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const first = segments[0] ?? "";
  const sid = new URLSearchParams(location.search).get("session"); // legacy ?session=

  if (first === "" || first === "sessions") {
    const seg = segments[1];
    if (seg === "new") return set({ view: "chat", activeSessionId: "__new__" });
    if (seg) return openSession(seg);
    if (sid) return openSession(sid);
    return set({ view: "chat", activeSessionId: null });
  }

  const views: View[] = ["search", "stats", "terminal", "users", "profiles"];
  const view = views.find((v) => v === first);
  if (view) return set({ view });
  return set({ view: "chat" });
}

// ---------------- session actions ----------------

export async function openSession(id: string) {
  set({ activeSessionId: id, view: "chat" });
  if (!state.entries[id]) {
    try {
      const entries = await api.messages(id);
      set({ entries: { ...state.entries, [id]: entries } });
    } catch (e) {
      toast(`Failed to load messages: ${e}`);
    }
  }
  try {
    const todos = await fetch(`/oc/session/${id}/todo`).then((r) => r.json());
    set({ todos: { ...state.todos, [id]: todos } });
  } catch {}
  // pick up any pending prompts that may have arrived before we opened
  try {
    const [perms, qs] = await Promise.all([api.listPermissions(), api.listQuestions()]);
    set({
      permissions: {
        ...state.permissions,
        [id]: perms.filter((p) => p.sessionID === id),
      },
      questions: {
        ...state.questions,
        [id]: qs.filter((q) => q.sessionID === id),
      },
    });
  } catch {}
}

export async function reloadMessages(id: string) {
  try {
    const entries = await api.messages(id);
    set({ entries: { ...state.entries, [id]: entries } });
  } catch {}
}

export async function createSession(directory: string, title?: string) {
  const s = await api.createSession(directory, title);
  await refreshSessions();
  await refreshMeta();
  if (s?.id) await openSession(s.id);
  return s;
}

export async function sendPrompt(
  sessionId: string,
  text: string,
  opts: { model?: { providerID: string; modelID: string }; agent?: string },
) {
  const parts = [{ type: "text", text }];
  await api.promptAsync(sessionId, {
    parts,
    model: opts.model,
    agent: opts.agent,
  });
}

export async function abortSession(id: string) {
  try {
    await api.abort(id);
  } catch (e) {
    toast(`Abort failed: ${e}`);
  }
}

export async function archiveSession(id: string, archived: boolean) {
  if (archived) await api.archive(id);
  else await api.unarchive(id);
  await refreshSessions();
  if (archived && state.activeSessionId === id) set({ activeSessionId: null });
}

export async function moveToFolder(id: string, folderId: string | null) {
  await api.setFolder(id, folderId);
  await refreshSessions();
}

export async function togglePin(s: Session) {
  await api.pin(s.id, !s.pinned);
  await refreshSessions();
}

export async function renameSession(id: string, title: string) {
  await api.rename(id, title);
  await refreshSessions();
}

export async function createFolder(name: string, color: string | null) {
  await api.createFolder(name, color ?? undefined);
  await refreshMeta();
}

export async function replyPermissionSafe(perm: Permission, reply: "once" | "always" | "reject") {
  try {
    await api.replyPermission(perm.id, reply);
  } catch (e) {
    toast(`Permission reply failed: ${e}`);
  }
  const list = state.permissions[perm.sessionID] ?? [];
  set({
    permissions: {
      ...state.permissions,
      [perm.sessionID]: list.filter((x) => x.id !== perm.id),
    },
  });
}

export async function answerQuestion(req: QuestionRequest, answers: string[][]) {
  try {
    await api.replyQuestion(req.id, answers);
  } catch (e) {
    toast(`Question reply failed: ${e}`);
  }
  const list = state.questions[req.sessionID] ?? [];
  set({
    questions: { ...state.questions, [req.sessionID]: list.filter((x) => x.id !== req.id) },
  });
}

export async function rejectQuestionSafe(req: QuestionRequest) {
  try {
    await api.rejectQuestion(req.id);
  } catch (e) {
    toast(`Question reject failed: ${e}`);
  }
  const list = state.questions[req.sessionID] ?? [];
  set({
    questions: { ...state.questions, [req.sessionID]: list.filter((x) => x.id !== req.id) },
  });
}

export async function deleteFolder(id: string) {
  await api.deleteFolder(id);
  if (state.filters.folder === id) set({ filters: { ...state.filters, folder: null } });
  await Promise.all([refreshMeta(), refreshSessions()]);
}

// ---------------- live event stream ----------------

let es: EventSource | null = null;

export function connectEvents() {
  if (es) return;
  if (typeof location !== "undefined" && location.search.includes("nosse")) return;
  es = new EventSource("/oc/global/event");
  es.onopen = () => set({ connected: true });
  es.onerror = () => set({ connected: false });
  es.onmessage = (ev) => {
    try {
      const payload = JSON.parse(ev.data).payload;
      if (payload) handleEvent(payload);
    } catch {}
  };
}

function upsertMessage(info: any) {
  const sid = info.sessionID;
  const loaded = state.entries[sid];
  if (!loaded) return;
  const entries = loaded.slice();
  const idx = entries.findIndex((e) => e.info.id === info.id);
  if (idx >= 0) entries[idx] = { ...entries[idx], info: { ...entries[idx].info, ...info } };
  else entries.push({ info, parts: [] });
  entries.sort((a, b) => (a.info.time?.created ?? 0) - (b.info.time?.created ?? 0));
  set({ entries: { ...state.entries, [sid]: entries } });
}

function upsertPart(part: Part, delta?: string) {
  const sid = part.sessionID;
  const loaded = state.entries[sid];
  if (!loaded) return;
  const entries = loaded.slice();
  let entry = entries.find((e) => e.info.id === part.messageID);
  if (!entry) {
    entry = {
      info: { id: part.messageID, sessionID: sid, role: "assistant", time: { created: Date.now() } },
      parts: [],
    };
    entries.push(entry);
    entries.sort((a, b) => (a.info.time?.created ?? 0) - (b.info.time?.created ?? 0));
  } else {
    entry = { ...entry, parts: entry.parts.slice() };
    const i = entries.indexOf(entries.find((e) => e.info?.id === part.messageID)!);
    entries[i] = entry;
  }
  const pIdx = entry.parts.findIndex((p) => p.id === part.id);
  if (pIdx >= 0) {
    const existing = entry.parts[pIdx];
    const merged = { ...existing, ...part };
    if ((merged.text == null || merged.text === "") && delta) merged.text = (existing.text ?? "") + delta;
    else if (delta && part.text != null && part.text === existing.text) merged.text = existing.text + delta;
    entry.parts[pIdx] = merged;
  } else {
    entry.parts.push(part);
  }
  set({ entries: { ...state.entries, [sid]: entries } });
}

function applyDelta(
  sid: string,
  messageID: string,
  partID: string,
  field: string,
  delta: string,
) {
  const loaded = state.entries[sid];
  if (!loaded) return;
  const entries = loaded.slice();
  let entry = entries.find((e) => e.info.id === messageID);
  if (!entry) {
    entry = {
      info: { id: messageID, sessionID: sid, role: "assistant", time: { created: Date.now() } },
      parts: [],
    };
    entries.push(entry);
    entries.sort((a, b) => (a.info.time?.created ?? 0) - (b.info.time?.created ?? 0));
  } else {
    const i = entries.indexOf(entry);
    entry = { ...entry, parts: entry.parts.slice() };
    entries[i] = entry;
  }
  let p = entry.parts.find((x) => x.id === partID);
  if (!p) {
    p = {
      id: partID,
      messageID,
      sessionID: sid,
      type: field === "reasoning" ? "reasoning" : "text",
      text: "",
    } as Part;
    entry.parts.push(p);
  } else {
    const pi = entry.parts.indexOf(p);
    p = { ...p };
    (p as any)[field] = ((p as any)[field] ?? "") + delta;
    entry.parts[pi] = p;
  }
  set({ entries: { ...state.entries, [sid]: entries } });
}

function removePart(sessionID: string, messageID: string, partID: string) {
  const loaded = state.entries[sessionID];
  if (!loaded) return;
  const entries = loaded.map((e) =>
    e.info.id === messageID ? { ...e, parts: e.parts.filter((p) => p.id !== partID) } : e,
  );
  set({ entries: { ...state.entries, [sessionID]: entries } });
}

function handleEvent(payload: any) {
  const p = payload.properties ?? {};
  switch (payload.type) {
    case "session.created":
    case "session.updated":
    case "session.deleted":
      scheduleRefresh();
      break;
    case "message.updated":
      upsertMessage(p.info);
      break;
    case "message.part.updated":
      upsertPart(p.part, p.delta);
      break;
    case "message.part.delta":
      applyDelta(p.sessionID, p.messageID, p.partID, p.field, p.delta);
      break;
    case "message.part.removed":
      removePart(p.sessionID, p.messageID, p.partID);
      break;
    case "session.status":
      set({ statuses: { ...state.statuses, [p.sessionID]: p.status } });
      break;
    case "session.idle": {
      set({ statuses: { ...state.statuses, [p.sessionID]: { type: "idle" } } });
      scheduleRefresh();
      if (state.activeSessionId === p.sessionID) reloadMessages(p.sessionID);
      break;
    }
    case "todo.updated":
      set({ todos: { ...state.todos, [p.sessionID]: p.todos } });
      break;
    case "permission.asked":
    case "permission.updated": {
      const perm = (p.permission ? p : (p as any).properties ?? p) as Permission;
      if (!perm?.sessionID) break;
      const list = state.permissions[perm.sessionID] ?? [];
      set({
        permissions: {
          ...state.permissions,
          [perm.sessionID]: [...list.filter((x) => x.id !== perm.id), perm],
        },
      });
      break;
    }
    case "permission.replied": {
      const sid = p.sessionID;
      const rid = p.requestID ?? p.permissionID;
      const list = state.permissions[sid] ?? [];
      set({ permissions: { ...state.permissions, [sid]: list.filter((x) => x.id !== rid) } });
      break;
    }
    case "question.asked": {
      const q = p as QuestionRequest;
      if (!q?.sessionID) break;
      const list = state.questions[q.sessionID] ?? [];
      set({
        questions: {
          ...state.questions,
          [q.sessionID]: [...list.filter((x) => x.id !== q.id), q],
        },
      });
      break;
    }
    case "question.replied":
    case "question.rejected": {
      const sid = p.sessionID;
      const rid = p.requestID;
      const list = state.questions[sid] ?? [];
      set({ questions: { ...state.questions, [sid]: list.filter((x) => x.id !== rid) } });
      break;
    }
    case "session.error":
      toast(`Session error: ${p.error?.data?.message ?? p.error?.name ?? "unknown"}`);
      break;
    default:
      break;
  }
}
