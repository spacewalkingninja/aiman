import { useEffect, useRef, useState } from "react";
import { api, type SearchHit } from "./api";
import { openSession, store } from "./store";

export default function SearchView() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef<any>(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await api.search(q.trim());
        setHits(r.results);
      } catch {
        setHits([]);
      } finally {
        setBusy(false);
      }
    }, 250);
    return () => clearTimeout(timer.current);
  }, [q]);

  return (
    <div className="search-wrap">
      <input
        className="input search-input"
        autoFocus
        placeholder="Full-text search across all conversations…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="muted small" style={{ margin: "8px 0" }}>
        {busy ? "searching…" : q.trim().length < 2 ? "type at least 2 characters" : `${hits.length} matches`}
      </div>
      {hits.map((h) => (
        <div
          key={h.part_id}
          className="hit"
          onClick={() => {
            store.set({ view: "chat" });
            openSession(h.session_id);
          }}
        >
          <div className="session-title">{h.title}</div>
          <div className="session-sub">
            <span>{h.directory}</span>
            <span className="badge">{h.type}</span>
          </div>
          <div className="snip" dangerouslySetInnerHTML={{ __html: h.snippet }} />
        </div>
      ))}
    </div>
  );
}
