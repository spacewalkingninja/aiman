import { lazy, memo, Suspense, useEffect, useMemo, useRef, useState } from "react";
import Composer from "./Composer";
import PartView from "./PartView";
import ErrorBoundary from "./ErrorBoundary";

const TerminalPane = lazy(() => import("./TerminalPane"));
import { api, type MessageEntry, type QuestionRequest, type SessionStats } from "./api";
import { fmtCost, fmtTokens } from "./StatsView";
import {
  answerQuestion,
  archiveSession,
  createSession,
  openSession,
  refreshSessions,
  rejectQuestionSafe,
  renameSession,
  replyPermissionSafe,
  store,
  toast,
  togglePin,
  useStore,
} from "./store";

export default function ChatView() {
  const s = useStore();
  const id = s.activeSessionId!;

  const session = s.sessions.find((x) => x.id === id);
  const entries = s.entries[id] ?? [];
  const todos = s.todos[id] ?? [];
  const perms = s.permissions[id] ?? [];
  const questions = s.questions[id] ?? [];
  const status = s.statuses[id];
  const bodyRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(session?.title ?? "");
  const [diff, setDiff] = useState<{ files: string[] } | null>(null);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [showStats, setShowStats] = useState(false);

  // ---- windowed rendering for very long histories ----
  const INITIAL = 30;
  const STEP = 30;
  const [windowStart, setWindowStart] = useState(0);
  const prevId = useRef<string | null>(null);
  useEffect(() => {
    if (prevId.current !== id) {
      prevId.current = id;
      setWindowStart(Math.max(0, (s.entries[id]?.length ?? 0) - INITIAL));
    }
  }, [id, s.entries[id]?.length]);

  const loadEarlier = () => {
    const el = bodyRef.current;
    const before = el?.scrollHeight ?? 0;
    setWindowStart((w) => Math.max(0, w - STEP));
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - before + el.scrollTop;
    });
  };

  const lastLen = useMemo(
    () => entries.reduce((n, e) => n + e.parts.length + JSON.stringify(e.info).length, 0),
    [entries],
  );

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [lastLen]);

  useEffect(() => setTitle(session?.title ?? ""), [session?.id, session?.title]);

  const statusType = status?.type ?? "idle";
  useEffect(() => {
    if (id === "__new__") return;
    let alive = true;
    api
      .sessionStats(id)
      .then((st) => alive && setStats(st))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id, statusType]);

  if (id === "__new__") return <NewSession />;

  // Terminal chat mode: embed the opencode TUI attached to this session.
  if (s.chatMode === "terminal") {
    return (
      <div className="chat">
        <div className="chat-head">
          <button
            className="btn ghost sm"
            onClick={() => store.set({ activeSessionId: null })}
            title="Back to list"
          >
            ←
          </button>
          <div className="chat-title">{session?.title || "(untitled)"}</div>
          <span className="badge">{session?.directory}</span>
          <div className="spacer" />
          <button className="btn ghost sm" onClick={() => setShowStats(true)} title="Session statistics">
            stats
          </button>
          <button className="btn ghost sm" onClick={loadDiff} title="Show changed files">
            diff
          </button>
          <button className="btn ghost sm" onClick={() => togglePin(session!)}>
            {session?.pinned ? "★" : "☆"}
          </button>
          <button
            className="btn ghost sm"
            onClick={() => archiveSession(id, session?.timeArchived == null)}
          >
            {session?.timeArchived == null ? "🗄 archive" : "unarchive"}
          </button>
        </div>
        {diff && (
          <div className="small" style={{ padding: "6px 20px", borderBottom: "1px solid var(--border)" }}>
            <b>Changed files:</b> {(diff.files ?? []).join(", ") || "none"}{" "}
            <button className="btn ghost sm" onClick={() => setDiff(null)}>
              hide
            </button>
          </div>
        )}
        {showStats && (
          <SessionStatsCard stats={stats} onClose={() => setShowStats(false)} />
        )}
        <ErrorBoundary label="Terminal error">
          <Suspense fallback={<div className="empty">loading terminal…</div>}>
            <TerminalPane sessionId={id} directory={session?.directory} />
          </Suspense>
        </ErrorBoundary>
      </div>
    );
  }

  async function loadDiff() {
    const d = await api.diff(id).catch(() => null);
    setDiff(d);
  }

  return (
    <div className="chat">
      <div className="chat-head">
        <button className="btn ghost sm" onClick={() => store.set({ activeSessionId: null })} title="Back to list">
          ←
        </button>
        {editing ? (
          <input
            className="rename-input"
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              setEditing(false);
              if (title && title !== session?.title) renameSession(id, title);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        ) : (
          <div className="chat-title" onClick={() => setEditing(true)} title="Click to rename">
            {session?.title || "(untitled)"}
          </div>
        )}
        <span className="badge">{session?.directory}</span>
        {stats && stats.totals.total > 0 && (
          <span className="badge" title="tokens · cost">
            {fmtTokens(stats.totals.total)} tok · {fmtCost(stats.totals.cost)}
          </span>
        )}
        {status && status.type !== "idle" && (
          <span className="badge running">{status.type === "retry" ? `retry ${status.attempt}` : "working"}</span>
        )}
        <div className="spacer" />
        <button className="btn ghost sm" onClick={() => setShowStats(true)} title="Session statistics">
          stats
        </button>
        <button className="btn ghost sm" onClick={loadDiff} title="Show changed files">
          diff
        </button>
        <button className="btn ghost sm" onClick={() => togglePin(session!)}>
          {session?.pinned ? "★" : "☆"}
        </button>
        <button
          className="btn ghost sm"
          onClick={() => archiveSession(id, session?.timeArchived == null)}
        >
          {session?.timeArchived == null ? "🗄 archive" : "unarchive"}
        </button>
      </div>

      {showStats && <SessionStatsCard stats={stats} onClose={() => setShowStats(false)} />}

      {(todos.length > 0 || diff || perms.length > 0 || (stats && stats.models.length > 0)) && (
        <div style={{ padding: "8px 20px", borderBottom: "1px solid var(--border)", background: "var(--bg-2)" }}>
          {stats && stats.models.length > 0 && (
            <div className="small muted" style={{ marginBottom: diff || todos.length ? 6 : 0 }}>
              {stats.models.map((m) => (
                <span key={m.providerID + m.modelID} style={{ marginRight: 14 }}>
                  <b>{m.modelID}</b>: {fmtTokens(m.input)} in / {fmtTokens(m.output)} out /{" "}
                  {fmtTokens(m.reasoning)} think · {fmtCost(m.cost)}
                </span>
              ))}
            </div>
          )}
          {diff && (
            <div className="small">
              <b>Changed files:</b> {(diff.files ?? []).join(", ") || "none"}{" "}
              <button className="btn ghost sm" onClick={() => setDiff(null)}>
                hide
              </button>
            </div>
          )}
          {todos.length > 0 && (
            <div className="small" style={{ marginTop: diff ? 6 : 0 }}>
              {todos.map((t) => (
                <div key={t.id}>
                  {t.status === "completed" ? "✓" : t.status === "in_progress" ? "◐" : t.status === "cancelled" ? "✕" : "○"}{" "}
                  {t.content}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        className="chat-body"
        ref={bodyRef}
        onScroll={() => {
          const el = bodyRef.current;
          if (el && el.scrollTop < 120 && windowStart > 0) loadEarlier();
        }}
      >
        {entries.length === 0 && <div className="empty">No messages yet — say hello below.</div>}
        {windowStart > 0 && (
          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <button className="btn ghost sm" onClick={loadEarlier}>
              ↑ Load earlier messages ({windowStart} hidden)
            </button>
          </div>
        )}
        {entries.slice(windowStart).map((e) => (
          <MessageRow key={e.info?.id ?? Math.random()} entry={e} />
        ))}

        {questions.map((q) => (
          <QuestionPrompt key={q.id} req={q} />
        ))}

        {perms.map((perm) => (
          <div className="permission" key={perm.id}>
            <div className="p-title">
              Permission required: <b>{perm.permission}</b>
            </div>
            <div className="small muted">
              {(perm.patterns ?? []).join(", ")}
              {perm.metadata?.command ? ` · ${perm.metadata.command}` : ""}
            </div>
            <div className="actions">
              <button className="btn primary sm" onClick={() => replyPermissionSafe(perm, "once")}>
                Allow once
              </button>
              <button className="btn sm" onClick={() => replyPermissionSafe(perm, "always")}>
                Allow always
              </button>
              <button className="btn danger sm" onClick={() => replyPermissionSafe(perm, "reject")}>
                Deny
              </button>
            </div>
          </div>
        ))}
      </div>

      <Composer sessionId={id} />
    </div>
  );
}

function QuestionPrompt({ req }: { req: QuestionRequest }) {
  const [sel, setSel] = useState<string[][]>(req.questions.map(() => []));
  const [custom, setCustom] = useState<string[]>(req.questions.map(() => ""));
  const [busy, setBusy] = useState(false);

  const toggle = (qi: number, label: string, multiple: boolean) => {
    setSel((prev) => {
      const next = prev.map((a) => a.slice());
      const cur = next[qi]!;
      if (multiple) {
        const i = cur.indexOf(label);
        if (i >= 0) cur.splice(i, 1);
        else cur.push(label);
      } else {
        next[qi] = cur[0] === label ? [] : [label];
      }
      return next;
    });
  };

  const submit = async () => {
    const answers = req.questions.map((q, i) => {
      const a = sel[i]!.slice();
      const c = custom[i]?.trim();
      if (c && q.custom !== false) a.push(c);
      return a;
    });
    if (answers.some((a) => a.length === 0)) {
      toast("Please answer all questions");
      return;
    }
    setBusy(true);
    try {
      await answerQuestion(req, answers);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="question">
      {req.questions.map((q, i) => (
        <div key={i} className="question-item">
          <div className="q-header">{q.header}</div>
          <div className="q-text">{q.question}</div>
          <div className="q-options">
            {q.options.map((opt) => {
              const active = sel[i]!.includes(opt.label);
              return (
                <div
                  key={opt.label}
                  className={"q-option" + (active ? " active" : "")}
                  onClick={() => toggle(i, opt.label, !!q.multiple)}
                >
                  <span className="q-mark">
                    {q.multiple ? (active ? "☑" : "☐") : active ? "◉" : "○"}
                  </span>
                  <div>
                    <div className="q-label">{opt.label}</div>
                    {opt.description && <div className="small muted">{opt.description}</div>}
                  </div>
                </div>
              );
            })}
          </div>
          {q.custom !== false && (
            <input
              className="input q-custom"
              placeholder="Type a custom answer…"
              value={custom[i]}
              onChange={(e) =>
                setCustom((prev) => {
                  const n = prev.slice();
                  n[i] = e.target.value;
                  return n;
                })
              }
            />
          )}
        </div>
      ))}
      <div className="actions">
        <button className="btn primary sm" disabled={busy} onClick={submit}>
          Submit
        </button>
        <button className="btn danger sm" disabled={busy} onClick={() => rejectQuestionSafe(req)}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

async function forkAt(sessionId: string, messageID: string) {
  try {
    const created = await api.forkSession(sessionId, messageID);
    if (created?.id) {
      await refreshSessions();
      await openSession(created.id);
      toast("Forked to a new session");
    }
  } catch (e) {
    toast(`Fork failed: ${e}`);
  }
}

const MessageRow = memo(function MessageRow({ entry }: { entry: MessageEntry }) {
  const role = entry.info?.role ?? "assistant";
  return (
    <div className={"msg " + role}>
      <div className="msg-head">
        <div className="msg-role">
          {role === "user" ? "You" : role === "assistant" ? "opencode" : role}
        </div>
        {entry.info?.sessionID && entry.info?.id && (
          <button
            className="btn ghost sm fork-btn"
            title="Fork a new session from this message"
            onClick={() => forkAt(entry.info.sessionID, entry.info.id)}
          >
            Fork here
          </button>
        )}
      </div>
      {role === "user" ? (
        <div className="bubble">
          {entry.parts
            .filter((p) => p.type === "text")
            .map((p) => (
              <div key={p.id}>{p.text}</div>
            ))}
        </div>
      ) : (
        entry.parts.map((p) => <PartView key={p.id} part={p} />)
      )}
      {entry.info?.error && (
        <div className="permission">
          <div className="p-title">Error</div>
          <div className="small">{entry.info.error?.data?.message ?? entry.info.error?.name}</div>
        </div>
      )}
    </div>
  );
});

function SessionStatsCard({
  stats,
  onClose,
}: {
  stats: SessionStats | null;
  onClose: () => void;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-box" style={{ width: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="overlay-title">Session statistics</div>
        {!stats ? (
          <div className="muted small">loading…</div>
        ) : (
          <>
            <div className="stat-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              <div className="stat-card">
                <div className="stat-value">{fmtTokens(stats.totals.total)}</div>
                <div className="stat-label">Tokens</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{fmtCost(stats.totals.cost)}</div>
                <div className="stat-label">Cost</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.userMessages}</div>
                <div className="stat-label">User messages</div>
              </div>
            </div>
            <table className="markdown" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Model</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Think</th>
                  <th>Total</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {stats.models.map((m) => (
                  <tr key={m.providerID + m.modelID}>
                    <td style={{ textAlign: "left" }}>
                      {m.providerID}/{m.modelID}
                    </td>
                    <td style={{ textAlign: "center" }}>{fmtTokens(m.input)}</td>
                    <td style={{ textAlign: "center" }}>{fmtTokens(m.output)}</td>
                    <td style={{ textAlign: "center" }}>{fmtTokens(m.reasoning)}</td>
                    <td style={{ textAlign: "center" }}>{fmtTokens(m.total)}</td>
                    <td style={{ textAlign: "center" }}>{fmtCost(m.cost)}</td>
                  </tr>
                ))}
                {stats.models.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted small">
                      no usage yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}
        <div className="overlay-foot">
          <button className="btn sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function NewSession() {
  const s = useStore();
  const [directory, setDirectory] = useState(s.directories[0] ?? "/home/ubuntu/opencode");
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  async function create() {
    if (!directory.trim()) return;
    setCreating(true);
    try {
      await createSession(directory.trim(), title.trim() || undefined);
    } catch (e) {
      alert(`Could not create session: ${e}`);
      setCreating(false);
    }
  }

  return (
    <div className="chat">
      <div className="chat-head">
        <button className="btn ghost sm" onClick={() => store.set({ activeSessionId: null })}>
          ←
        </button>
        <div className="chat-title">New session</div>
      </div>
      <div className="chat-body" style={{ maxWidth: 640 }}>
        <label className="small muted">Working directory</label>
        <input
          className="input"
          style={{ width: "100%", margin: "6px 0 14px" }}
          list="dirs"
          value={directory}
          onChange={(e) => setDirectory(e.target.value)}
        />
        <datalist id="dirs">
          {s.directories.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
        <label className="small muted">Title (optional)</label>
        <input
          className="input"
          style={{ width: "100%", margin: "6px 0 14px" }}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
        />
        <button className="btn primary" disabled={creating} onClick={create}>
          {creating ? "Creating…" : "Create session"}
        </button>
      </div>
    </div>
  );
}
