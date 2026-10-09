import { useEffect, useMemo, useRef, useState } from "react";
import { api, type TreeNode } from "./api";

type Rect = { x: number; y: number; w: number; h: number };
type Placed = { node: TreeNode; rect: Rect };

/** Squarified treemap layout (values scaled to fill the unit rectangle). */
function squarify(children: TreeNode[], w: number, h: number): Placed[] {
  const total = children.reduce((n, c) => n + c.size, 0) || 1;
  const area = w * h;
  const items = children
    .map((node, orig) => ({ node, orig, value: (node.size / total) * area }))
    .sort((a, b) => b.value - a.value);

  const results: Rect[] = new Array(items.length);
  let rect: Rect = { x: 0, y: 0, w, h };
  const values = items.map((it) => it.value);

  const worst = (row: number[], short: number) => {
    const sum = row.reduce((n, j) => n + values[j]!, 0);
    const thickness = sum / short || 1;
    let worstRatio = 0;
    for (const j of row) {
      const len = values[j]! / thickness || 1;
      const ratio = Math.max(thickness / len, len / thickness);
      if (ratio > worstRatio) worstRatio = ratio;
    }
    return worstRatio;
  };

  const layoutRow = (row: number[], r: Rect): Rect => {
    const sum = row.reduce((n, j) => n + values[j]!, 0);
    const short = Math.min(r.w, r.h);
    const thickness = sum / short || 1;
    let pos = 0;
    for (const j of row) {
      const len = values[j]! / thickness || 1;
      if (r.w >= r.h) results[j] = { x: r.x, y: r.y + pos, w: thickness, h: len };
      else results[j] = { x: r.x + pos, y: r.y, w: len, h: thickness };
      pos += len;
    }
    return r.w >= r.h
      ? { x: r.x + thickness, y: r.y, w: r.w - thickness, h: r.h }
      : { x: r.x, y: r.y + thickness, w: r.w, h: r.h - thickness };
  };

  let row: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const short = Math.min(rect.w, rect.h) || 1;
    if (row.length === 0) {
      row.push(i);
      continue;
    }
    if (worst(row, short) >= worst([...row, i], short)) {
      row.push(i);
    } else {
      rect = layoutRow(row, rect);
      row = [i];
    }
  }
  if (row.length) layoutRow(row, rect);

  return items.map((it, j) => ({ node: it.node, rect: results[j]! }));
}

const IMG_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg", ".ico", ".bmp"]);

function fileIcon(ext?: string): string {
  if (!ext) return "📄";
  if (IMG_EXT.has(ext)) return "🖼️";
  if ([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"].includes(ext)) return "🟨";
  if ([".py"].includes(ext)) return "🐍";
  if ([".go"].includes(ext)) return "🐹";
  if ([".rs"].includes(ext)) return "🦀";
  if ([".json"].includes(ext)) return "🔧";
  if ([".md", ".mdx"].includes(ext)) return "📝";
  if ([".css", ".scss", ".less"].includes(ext)) return "🎨";
  if ([".html", ".htm"].includes(ext)) return "🌐";
  if ([".sh", ".bash", ".zsh"].includes(ext)) return "⌨️";
  if ([".yml", ".yaml", ".toml", ".ini", ".env"].includes(ext)) return "⚙️";
  return "📄";
}

function humanSize(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

type FileData = { type: "text" | "binary"; content?: string; ext?: string; mime?: string };

export default function CodeMap({ directories }: { directories: string[] }) {
  const [dir, setDir] = useState(directories[0] ?? "");
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [stack, setStack] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view3d, setView3d] = useState(false);
  const [files, setFiles] = useState<Record<string, FileData>>({});
  const [editor, setEditor] = useState<{ path: string; content: string; dirty: boolean } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const inflight = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (directories.length && !directories.includes(dir)) setDir(directories[0]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directories.join("|")]);

  async function load(force = false) {
    if (!dir) return;
    setLoading(true);
    setError(null);
    try {
      const t = await api.tree(dir, { depth: 6, max: 6000 });
      setTree(t);
      setStack(force ? [] : [t]);
      setEditor(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (dir) load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir]);

  const current = stack[stack.length - 1] ?? tree;

  // Prefetch previews for the larger visible files.
  useEffect(() => {
    if (!current?.children) return;
    const total = current.size || 1;
    const big = current.children
      .filter((c) => c.type === "file" && c.size / total > 0.02)
      .sort((a, b) => b.size - a.size)
      .slice(0, 30);
    for (const f of big) {
      if (files[f.path] || inflight.current.has(f.path)) continue;
      inflight.current.add(f.path);
      api
        .fileGet(dir, f.path)
        .then((d) => setFiles((prev) => ({ ...prev, [f.path]: d })))
        .catch(() => {})
        .finally(() => inflight.current.delete(f.path));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, dir]);

  const placed = useMemo(() => {
    if (!current?.children?.length) return [];
    return squarify(current.children, 100, 100);
  }, [current]);

  async function openEditor(node: TreeNode) {
    let data = files[node.path];
    if (!data) {
      try {
        data = await api.fileGet(dir, node.path);
        setFiles((prev) => ({ ...prev, [node.path]: data! }));
      } catch {
        return;
      }
    }
    if (data.type !== "text") return;
    setEditor({ path: node.path, content: data.content ?? "", dirty: false });
  }

  async function saveEditor() {
    if (!editor) return;
    setSaving(true);
    try {
      await api.filePut(dir, editor.path, editor.content);
      setFiles((prev) => ({ ...prev, [editor.path]: { type: "text", content: editor.content } }));
      setEditor({ ...editor, dirty: false });
    } finally {
      setSaving(false);
    }
  }

  if (editor) {
    return (
      <div className="codemap">
        <div className="cm-toolbar">
          <button className="btn ghost sm" onClick={() => setEditor(null)}>
            ← map
          </button>
          <span className="cm-path" title={editor.path}>
            {editor.path}
          </span>
          <div className="spacer" />
          <button className="btn sm primary" disabled={saving || !editor.dirty} onClick={saveEditor}>
            {saving ? "saving…" : "Save"}
          </button>
        </div>
        <textarea
          className="cm-editor"
          spellCheck={false}
          value={editor.content}
          onChange={(e) => setEditor({ ...editor, content: e.target.value, dirty: true })}
        />
      </div>
    );
  }

  return (
    <div className="codemap">
      <div className="cm-toolbar">
        {directories.length > 1 && (
          <select className="input" value={dir} onChange={(e) => setDir(e.target.value)}>
            {directories.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}
        <nav className="cm-crumbs">
          {stack.map((n, i) => (
            <span key={n.path || "root"}>
              <a onClick={() => setStack(stack.slice(0, i + 1))}>{n.name || "root"}</a>
              {i < stack.length - 1 && <span className="muted"> / </span>}
            </span>
          ))}
        </nav>
        <div className="spacer" />
        <button className="btn ghost sm" onClick={() => setView3d((v) => !v)} title="Toggle 2D/3D">
          {view3d ? "2D" : "3D"}
        </button>
        <button className="btn ghost sm" onClick={() => load(true)} title="Reload">
          ⟳
        </button>
      </div>

      {loading && <div className="empty">building treemap…</div>}
      {error && <div className="empty">{error}</div>}
      {!loading && !error && !current && (
        <div className="empty">No directory to visualise.</div>
      )}

      {current && (
        <div className={"cm-map" + (view3d ? " cm-3d" : "")}>
          {placed.map(({ node, rect }) => {
            const area = rect.w * rect.h;
            const showCode = area > 60 && node.type === "file";
            const data = files[node.path];
            const isImg = node.type === "file" && IMG_EXT.has(node.ext ?? "");
            return (
              <div
                key={node.path}
                className={"cm-cell " + node.type}
                style={{
                  left: rect.x + "%",
                  top: rect.y + "%",
                  width: `calc(${rect.w}% - 2px)`,
                  height: `calc(${rect.h}% - 2px)`,
                }}
                title={`${node.path} · ${humanSize(node.size)}`}
                onClick={() => node.type === "dir" && setStack([...stack, node])}
                onDoubleClick={() => node.type === "file" && openEditor(node)}
              >
                <div className="cm-label">
                  {node.type === "file" && <span className="cm-icon">{fileIcon(node.ext)}</span>}
                  <span className="cm-name">{node.name}</span>
                  <span className="cm-size">{humanSize(node.size)}</span>
                </div>
                {showCode && isImg && (
                  <img className="cm-img" loading="lazy" src={api.rawUrl(dir, node.path)} alt={node.name} />
                )}
                {showCode && !isImg && data?.type === "text" && (
                  <pre className="cm-code">{data.content?.slice(0, 1500)}</pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
