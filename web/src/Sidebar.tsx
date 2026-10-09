import { useMemo, useState } from "react";
import {
  createFolder,
  deleteFolder,
  filterSessions,
  store,
  useStore,
} from "./store";
import type { Filters } from "./store";

const COLORS = ["#5b9dff", "#34d399", "#fbbf24", "#f87171", "#c084fc", "#22d3ee"];

export default function Sidebar() {
  const s = useStore();
  const [newFolder, setNewFolder] = useState("");

  const counts = useMemo(() => {
    const base = s.sessions;
    return {
      all: base.filter((x) => x.timeArchived == null).length,
      pinned: base.filter((x) => x.timeArchived == null && x.pinned).length,
      archived: base.filter((x) => x.timeArchived != null).length,
      folders: Object.fromEntries(
        s.folders.map((f) => [
          f.id,
          base.filter((x) => x.timeArchived == null && x.folderId === f.id).length,
        ]),
      ) as Record<string, number>,
    };
  }, [s.sessions, s.folders]);

  const apply = (patch: Partial<Filters>) =>
    store.set({ filters: { ...s.filters, ...patch }, activeSessionId: null, view: "chat" });

  const smart = (which: "all" | "pinned" | "archived") => {
    if (which === "archived") apply({ archived: "1", folder: null, directory: null });
    else if (which === "pinned") apply({ archived: "0", folder: null, directory: null, sort: "updated" });
    else apply({ archived: "0", folder: null, directory: null });
  };

  const activeSmart =
    s.filters.archived === "1" && !s.filters.folder && !s.filters.directory
      ? "archived"
      : s.filters.archived === "0" && !s.filters.folder && !s.filters.directory
        ? "all"
        : null;

  return (
    <div className="sidebar">
      <div className="sidebar-head">
        <button className="btn primary full" onClick={() => store.set({ activeSessionId: "__new__", view: "chat" })}>
          + New session
        </button>
      </div>
      <div className="sidebar-scroll">
        <div className="nav-item" onClick={() => smart("all")} style={activeSmart === "all" ? { background: "var(--bg-3)" } : {}}>
          <span>All sessions</span>
          <span className="count">{counts.all}</span>
        </div>
        <div className="nav-item" onClick={() => smart("pinned")}>
          <span>★ Pinned</span>
          <span className="count">{counts.pinned}</span>
        </div>
        <div className="nav-item" onClick={() => smart("archived")}>
          <span>🗄 Archived</span>
          <span className="count">{counts.archived}</span>
        </div>

        <div className="section-title">Folders</div>
        {s.folders.map((f) => (
          <div
            key={f.id}
            className={"nav-item" + (s.filters.folder === f.id ? " active" : "")}
            onClick={() => apply({ archived: "0", folder: f.id, directory: null })}
          >
            <span className="swatch" style={{ background: f.color ?? "var(--muted)" }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
            <span className="count">{counts.folders[f.id] ?? 0}</span>
            <button
              className="btn ghost sm"
              title="Delete folder"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete folder "${f.name}"? Sessions are kept.`)) deleteFolder(f.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
        <div className="nav-item" onClick={() => apply({ archived: "0", folder: "none", directory: null })}>
          <span className="muted">Unfiled</span>
        </div>

        <div style={{ display: "flex", gap: 6, padding: "6px 8px 2px" }}>
          <input
            className="input"
            style={{ flex: 1, minWidth: 0 }}
            placeholder="New folder…"
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newFolder.trim()) {
                createFolder(newFolder.trim(), COLORS[s.folders.length % COLORS.length]!);
                setNewFolder("");
              }
            }}
          />
          <button
            className="btn sm"
            onClick={() => {
              if (newFolder.trim()) {
                createFolder(newFolder.trim(), COLORS[s.folders.length % COLORS.length]!);
                setNewFolder("");
              }
            }}
          >
            Add
          </button>
        </div>

        <div className="section-title">Directories</div>
        {s.directories.slice(0, 40).map((d) => {
          const n = s.sessions.filter((x) => x.timeArchived == null && x.directory === d).length;
          return (
            <div
              key={d}
              className={"nav-item" + (s.filters.directory === d ? " active" : "")}
              title={d}
              onClick={() => apply({ archived: "0", directory: d, folder: null })}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", direction: "rtl", textAlign: "left" }}>
                {d}
              </span>
              <span className="count">{n}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
