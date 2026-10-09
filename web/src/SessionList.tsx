import {
  archiveSession,
  filterSessions,
  moveToFolder,
  openSession,
  openSessionWindow,
  store,
  togglePin,
  useStore,
} from "./store";
import { fmtCost, fmtTokens } from "./StatsView";
import CodeMap from "./CodeMap";
import ErrorBoundary from "./ErrorBoundary";

function timeAgo(ms: number) {
  const d = Date.now() - ms;
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
}

export default function SessionList() {
  const s = useStore();
  const rows = filterSessions(s.sessions, s.filters);
  const scopedDirs = [...new Set(rows.map((r) => r.directory))].filter(Boolean);
  const split = !!(s.filters.folder || s.filters.directory);

  const pane = (
    <div className="main">
      <div className="chat-head">
        <div className="chat-title">
          {s.filters.archived === "1"
            ? "Archived"
            : s.filters.folder
              ? s.folders.find((f) => f.id === s.filters.folder)?.name ?? "Folder"
              : s.filters.directory
                ? s.filters.directory
                : "All sessions"}
        </div>
        <span className="muted small">{rows.length} sessions</span>
        <div className="spacer" />
        <input
          className="input"
          placeholder="Filter by title / path…"
          value={s.filters.q}
          onChange={(e) => store.set({ filters: { ...s.filters, q: e.target.value } })}
        />
        <select
          className="input"
          value={s.filters.sort}
          onChange={(e) => store.set({ filters: { ...s.filters, sort: e.target.value } })}
        >
          <option value="updated">Last updated</option>
          <option value="created">Created</option>
          <option value="messages">Most messages</option>
          <option value="tokens">Most tokens</option>
          <option value="cost">Highest cost</option>
          <option value="title">Title</option>
        </select>
      </div>

      <div className="session-list">
        {rows.length === 0 && <div className="empty">No sessions here.</div>}
        {rows.map((sess) => {
          const status = s.statuses[sess.id];
          const busy = status && status.type !== "idle";
          return (
            <div
              key={sess.id}
              className="session-row"
              onClick={() => openSession(sess.id)}
            >
              <div style={{ minWidth: 0 }}>
                <div className="session-title">
                  {sess.pinned ? "★ " : ""}
                  {sess.title || "(untitled)"}
                </div>
                <div className="session-sub">
                  <span title={sess.directory}>{sess.directory}</span>
                  <span>· {timeAgo(sess.timeUpdated)}</span>
                  <span>· {sess.messageCount} msgs</span>
                  {sess.usage && sess.usage.total > 0 && (
                    <span title="tokens · cost">
                      · {fmtTokens(sess.usage.total)} tok · {fmtCost(sess.usage.cost)}
                    </span>
                  )}
                  {busy && (
                    <span className="badge running">
                      {status.type === "retry" ? `retry ${status.attempt}` : "working"}
                    </span>
                  )}
                  {sess.timeArchived != null && <span className="badge">archived</span>}
                </div>
              </div>
              <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                <select
                  className="input"
                  value={sess.folderId ?? ""}
                  onChange={(e) => moveToFolder(sess.id, e.target.value || null)}
                  title="Folder"
                >
                  <option value="">Unfiled</option>
                  {s.folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <button
                  className="btn ghost sm"
                  title="Open in new window"
                  onClick={() => openSessionWindow(sess.id)}
                >
                  ⇗
                </button>
                <button className="btn ghost sm" title="Pin" onClick={() => togglePin(sess)}>
                  {sess.pinned ? "★" : "☆"}
                </button>
                {sess.timeArchived != null ? (
                  <button className="btn sm" onClick={() => archiveSession(sess.id, false)}>
                    Unarchive
                  </button>
                ) : (
                  <button className="btn ghost sm" title="Archive" onClick={() => archiveSession(sess.id, true)}>
                    🗄
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (!split) return pane;

  return (
    <div className="split">
      <div className="split-left">{pane}</div>
      <div className="split-right">
        {scopedDirs.length ? (
          <ErrorBoundary label="Codebase visualizer error">
            <CodeMap directories={scopedDirs} />
          </ErrorBoundary>
        ) : (
          <div className="empty">No directory to visualise.</div>
        )}
      </div>
    </div>
  );
}
