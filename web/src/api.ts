export type Usage = {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  cost: number;
  messages: number;
};

export type ModelUsage = Usage & { providerID: string; modelID: string };
export type DayUsage = Usage & { day: string };

export type Session = {
  id: string;
  parentId: string | null;
  slug: string;
  directory: string;
  title: string;
  timeCreated: number;
  timeUpdated: number;
  timeArchived: number | null;
  messageCount: number;
  pinned: number;
  folderId: string | null;
  tags: string | null;
  notes: string | null;
  usage: Usage | null;
};

export type Stats = {
  totals: Usage & { sessions: number; archived: number; userMessages: number };
  models: ModelUsage[];
  days: DayUsage[];
};

export type SessionStats = {
  sessionId: string;
  totals: Usage;
  userMessages: number;
  models: ModelUsage[];
};

export type Folder = {
  id: string;
  name: string;
  color: string | null;
  position: number;
  created_at: number;
};

export type Meta = { folders: Folder[]; directories: string[] };

export type Part = {
  id: string;
  sessionID: string;
  messageID: string;
  type: string;
  text?: string;
  callID?: string;
  tool?: string;
  state?: any;
  filename?: string;
  url?: string;
  [k: string]: any;
};

export type MessageEntry = { info: any; parts: Part[] };

export type Status =
  | { type: "idle" }
  | { type: "busy" }
  | { type: "retry"; attempt: number; message: string; next: number };

export type Permission = {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  metadata: any;
  always: string[];
  tool?: { messageID: string; callID: string };
};

export type QuestionOption = { label: string; description: string };
export type QuestionInfo = {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
  custom?: boolean;
};
export type QuestionRequest = {
  id: string;
  sessionID: string;
  questions: QuestionInfo[];
  tool?: { messageID: string; callID: string };
};

export type Todo = { id: string; content: string; status: string; priority: string };

export type SearchHit = {
  part_id: string;
  session_id: string;
  message_id: string;
  type: string;
  snippet: string;
  title: string;
  directory: string;
};

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

export type AuthUser = { id: string; username: string; is_admin: number };

export type ProfileProvider = { providerID: string; hint: string };
export type Profile = {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  providers: ProfileProvider[];
};

export const api = {
  authMe: () =>
    fetch("/api/auth/me").then(
      j<{ authenticated: boolean; needsSetup: boolean; user: AuthUser | null }>,
    ),
  setup: (username: string, password: string) =>
    fetch("/api/auth/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "setup failed");
      return r.json();
    }),
  login: (username: string, password: string) =>
    fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "login failed");
      return r.json();
    }),
  logout: () => fetch("/api/auth/logout", { method: "POST" }).then(j),
  users: () => fetch("/api/users").then(j<AuthUser[]>),
  createUser: (username: string, password: string, isAdmin: boolean) =>
    fetch("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password, isAdmin }),
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "failed");
      return r.json();
    }),
  updateUser: (id: string, patch: any) =>
    fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "failed");
      return r.json();
    }),
  deleteUser: (id: string) =>
    fetch(`/api/users/${id}`, { method: "DELETE" }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "failed");
      return r.json();
    }),

  profiles: () => fetch("/api/profiles").then(j<Profile[]>),
  activeProfile: () => fetch("/api/profiles/active").then(j<{ profileId: string | null }>),
  createProfile: (name: string) =>
    fetch("/api/profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }).then(j<Profile>),
  renameProfile: (id: string, name: string) =>
    fetch(`/api/profiles/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }).then(j),
  deleteProfile: (id: string) => fetch(`/api/profiles/${id}`, { method: "DELETE" }).then(j),
  setProfileAuth: (id: string, providers: { providerID: string; key: string }[]) =>
    fetch(`/api/profiles/${id}/auth`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providers }),
    }).then(j),
  removeProfileAuth: (id: string, providerID: string) =>
    fetch(`/api/profiles/${id}/auth/${encodeURIComponent(providerID)}`, { method: "DELETE" }).then(j),
  activateProfile: (id: string) =>
    fetch(`/api/profiles/${id}/activate`, { method: "POST" }).then(
      j<{ ok: boolean; applied: string[]; removed: string[] }>,
    ),

  meta: () => fetch("/api/meta").then(j<Meta>),
  sessions: (params: Record<string, string> = {}) =>
    fetch("/api/sessions?" + new URLSearchParams(params).toString()).then(j<Session[]>),
  folders: () => fetch("/api/folders").then(j<Folder[]>),
  createFolder: (name: string, color?: string) =>
    fetch("/api/folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, color }),
    }).then(j<Folder>),
  updateFolder: (id: string, patch: any) =>
    fetch(`/api/folders/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).then(j),
  deleteFolder: (id: string) =>
    fetch(`/api/folders/${id}`, { method: "DELETE" }).then(j),
  archive: (id: string) => fetch(`/api/sessions/${id}/archive`, { method: "POST" }).then(j),
  unarchive: (id: string) => fetch(`/api/sessions/${id}/unarchive`, { method: "POST" }).then(j),
  setFolder: (id: string, folderId: string | null) =>
    fetch(`/api/sessions/${id}/folder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderId }),
    }).then(j),
  pin: (id: string, pinned: boolean) =>
    fetch(`/api/sessions/${id}/pin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pinned }),
    }).then(j),
  rename: (id: string, title: string) =>
    fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    }).then(j),
  search: (q: string) =>
    fetch("/api/search?" + new URLSearchParams({ q }).toString()).then(
      j<{ query: string; count: number; results: SearchHit[] }>,
    ),

  // ---- opencode proxied ----
  messages: (sessionId: string) =>
    fetch(`/oc/session/${sessionId}/message`).then(j<MessageEntry[]>),
  promptAsync: (sessionId: string, body: any) =>
    fetch(`/oc/session/${sessionId}/prompt_async`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return true;
    }),
  abort: (sessionId: string) =>
    fetch(`/oc/session/${sessionId}/abort`, { method: "POST" }).then(j),
  createSession: (directory: string, title?: string) =>
    fetch(`/oc/session?directory=${encodeURIComponent(directory)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    }).then(j<{ id: string }>),
  providers: () =>
    fetch("/oc/config/providers").then(
      j<{
        providers: {
          id: string;
          name: string;
          models: Record<string, { id: string; name: string; reasoning?: boolean; tool_call?: boolean }>;
        }[];
      }>,
    ),
  agents: () =>
    fetch("/oc/agent").then(j<{ name: string; description: string; mode?: string }[]>),
  commands: () =>
    fetch("/oc/command").then(
      j<{ name: string; description?: string; agent?: string; model?: string }[]>,
    ),
  commandRun: (
    sessionId: string,
    body: { command: string; arguments?: string; agent?: string; model?: string },
  ) =>
    fetch(`/oc/session/${sessionId}/command`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(j),
  share: (sessionId: string) =>
    fetch(`/oc/session/${sessionId}/share`, { method: "POST" }).then(j<{ share?: { url: string } }>),
  unshare: (sessionId: string) =>
    fetch(`/oc/session/${sessionId}/unshare`, { method: "POST" }).then(j),
  unrevert: (sessionId: string) =>
    fetch(`/oc/session/${sessionId}/unrevert`, { method: "POST" }).then(j),
  listPermissions: () => fetch("/oc/permission").then(j<Permission[]>),
  replyPermission: (requestID: string, reply: "once" | "always" | "reject") =>
    fetch(`/oc/permission/${requestID}/reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reply }),
    }).then(j),

  listQuestions: () => fetch("/oc/question").then(j<QuestionRequest[]>),
  replyQuestion: (requestID: string, answers: string[][]) =>
    fetch(`/oc/question/${requestID}/reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers }),
    }).then(j),
  rejectQuestion: (requestID: string) =>
    fetch(`/oc/question/${requestID}/reject`, { method: "POST" }).then(j),
  revert: (sessionId: string, messageID: string) =>
    fetch(`/oc/session/${sessionId}/revert`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messageID }),
    }).then(j),
  summarize: (sessionId: string) =>
    fetch(`/oc/session/${sessionId}/summarize`, { method: "POST" }).then(j),
  diff: (sessionId: string) =>
    fetch(`/oc/session/${sessionId}/diff`).then(j<{ files: string[] }>),
  stats: () => fetch("/api/stats").then(j<Stats>),
  sessionStats: (sessionId: string) =>
    fetch(`/api/sessions/${sessionId}/stats`).then(j<SessionStats>),

  config: () =>
    fetch("/api/config").then(
      j<{ opencodeUrl: string; terminal: boolean; platform: string }>,
    ),

  // ---- opencode native PTY (terminal) ----
  createPty: (body: {
    command?: string;
    args?: string[];
    cwd?: string;
    title?: string;
    env?: Record<string, string>;
  }) =>
    fetch("/oc/pty", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(j<{ id: string; title: string; command: string; args: string[]; cwd: string }>),
  updatePty: (id: string, body: { title?: string; size?: { rows: number; cols: number } }) =>
    fetch(`/oc/pty/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(j),
  deletePty: (id: string) => fetch(`/oc/pty/${id}`, { method: "DELETE" }).then(j),
};
