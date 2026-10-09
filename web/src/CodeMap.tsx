import { useEffect, useMemo, useRef, useState } from "react";
import { api, type TreeNode } from "./api";

type Rect = { x: number; y: number; w: number; h: number };
type Placed = { node: TreeNode; rect: Rect; depth: number; header: number };

/** Squarified treemap layout, filling a w×h box starting at (0,0). */
function squarify(children: TreeNode[], w: number, h: number): { node: TreeNode; rect: Rect }[] {
  const total = children.reduce((n, c) => n + c.size, 0) || 1;
  const area = w * h;
  const items = children
    .map((node) => ({ node, value: (node.size / total) * area }))
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

/** Recursively lay out a node in a 0..100 × 0..100 unit space. */
function layoutNode(
  node: TreeNode,
  rect: Rect,
  depth: number,
  out: Placed[],
  budget: { left: number },
): void {
  if (budget.left <= 0 || rect.w <= 0 || rect.h <= 0) return;
  if (node.type === "file") {
    budget.left--;
    out.push({ node, rect, depth, header: 0 });
    return;
  }
  const header = depth === 0 ? 0 : Math.min(rect.h * 0.12, 2.1);
  if (depth > 0) out.push({ node, rect, depth, header });
  const pad = depth === 0 ? 0 : 0.14;
  const inner: Rect = {
    x: rect.x + pad,
    y: rect.y + header + pad,
    w: Math.max(0, rect.w - pad * 2),
    h: Math.max(0, rect.h - header - pad * 2),
  };
  if (inner.w < 0.7 || inner.h < 0.7) return;
  const cells = squarify(node.children ?? [], inner.w, inner.h);
  for (const c of cells) {
    layoutNode(
      c.node,
      { x: inner.x + c.rect.x, y: inner.y + c.rect.y, w: c.rect.w, h: c.rect.h },
      depth + 1,
      out,
      budget,
    );
  }
}

const IMG_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg", ".ico", ".bmp"]);

function fileIcon(ext?: string): string {
  if (!ext) return "📄";
  if (IMG_EXT.has(ext)) return "🖼️";
  if ([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"].includes(ext)) return "🟨";
  if (ext === ".py") return "🐍";
  if (ext === ".go") return "🐹";
  if (ext === ".rs") return "🦀";
  if (ext === ".json") return "🔧";
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
const MIN_PREVIEW_AREA = 2600; // on-screen px² before a file renders its content

export default function CodeMap({ directories }: { directories: string[] }) {
  const [dir, setDir] = useState(directories[0] ?? "");
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view3d, setView3d] = useState(false);
  const [files, setFiles] = useState<Record<string, FileData>>({});
  const [editor, setEditor] = useState<{ path: string; content: string; dirty: boolean } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const [size, setSize] = useState({ w: 0, h: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const inflight = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (directories.length && !directories.includes(dir)) setDir(directories[0]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directories.join("|")]);

  async function load() {
    if (!dir) return;
    setLoading(true);
    setError(null);
    try {
      const t = await api.tree(dir, { depth: 10, max: 12000 });
      setTree(t);
      setView({ scale: 1, tx: 0, ty: 0 });
      setEditor(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (dir) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir]);

  // Track the visible size of the map for preview thresholds.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [editor]);

  const placed = useMemo(() => {
    if (!tree) return [];
    const out: Placed[] = [];
    layoutNode(tree, { x: 0, y: 0, w: 100, h: 100 }, 0, out, { left: 12000 });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree]);

  // Fetch previews for files that are big enough on screen at the current zoom.
  useEffect(() => {
    if (!size.w || !size.h) return;
    const big = placed
      .filter((p) => p.node.type === "file")
      .map((p) => {
        const pw = (p.rect.w / 100) * size.w * view.scale;
        const ph = (p.rect.h / 100) * size.h * view.scale;
        return { p, area: pw * ph };
      })
      .filter((x) => x.area > MIN_PREVIEW_AREA)
      .sort((a, b) => b.area - a.area)
      .slice(0, 50);
    for (const { p } of big) {
      const path = p.node.path;
      if (files[path] || inflight.current.has(path)) continue;
      inflight.current.add(path);
      api
        .fileGet(dir, path)
        .then((d) => setFiles((prev) => ({ ...prev, [path]: d })))
        .catch(() => {})
        .finally(() => inflight.current.delete(path));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed, view.scale, size.w, size.h, dir]);

  function fitToRect(rect: Rect) {
    const W = size.w || 1;
    const H = size.h || 1;
    const pw = (rect.w / 100) * W;
    const ph = (rect.h / 100) * H;
    const s = Math.min(W / pw, H / ph) * 0.95;
    const tx = (W - pw * s) / 2 - (rect.x / 100) * W * s;
    const ty = (H - ph * s) / 2 - (rect.y / 100) * H * s;
    setView({ scale: Math.max(0.2, Math.min(80, s)), tx, ty });
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
    setView((v) => {
      const ns = Math.max(0.2, Math.min(80, v.scale * factor));
      const k = ns / v.scale;
      return { scale: ns, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k };
    });
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 1) return; // middle button only
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    setView((v) => ({ ...v, tx: d.tx + dx, ty: d.ty + dy }));
  }
  function endDrag() {
    drag.current = null;
  }

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

  const rootRect = placed[0]?.rect ?? { x: 0, y: 0, w: 100, h: 100 };

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
        <span className="cm-path" title={dir}>
          {dir}
        </span>
        <div className="spacer" />
        <button className="btn ghost sm" onClick={() => fitToRect(rootRect)} title="Fit to view">
          fit
        </button>
        <button className="btn ghost sm" onClick={() => setView3d((v) => !v)} title="Toggle 2D/3D">
          {view3d ? "2D" : "3D"}
        </button>
        <button className="btn ghost sm" onClick={load} title="Reload">
          ⟳
        </button>
      </div>

      {loading && <div className="empty">building treemap…</div>}
      {error && <div className="empty">{error}</div>}
      {!loading && !error && !tree && <div className="empty">No directory to visualise.</div>}

      {tree && (
        <div
          ref={containerRef}
          className="cm-map"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onAuxClick={(e) => e.preventDefault()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            className={"cm-canvas" + (view3d ? " cm-3d" : "")}
            style={{
              transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})${
                view3d ? " rotateX(16deg)" : ""
              }`,
            }}
          >
            {placed.map(({ node, rect, depth, header }) => {
              const pixelW = (rect.w / 100) * size.w * view.scale;
              const pixelH = (rect.h / 100) * size.h * view.scale;
              const area = pixelW * pixelH;
              const isDir = node.type === "dir";
              const data = files[node.path];
              const isImg = !isDir && IMG_EXT.has(node.ext ?? "");
              const bigEnough = area > MIN_PREVIEW_AREA;
              const showLabel = pixelW > 34 && pixelH > 12;
              return (
                <div
                  key={(isDir ? "d:" : "f:") + node.path}
                  className={"cm-cell " + node.type}
                  style={{
                    left: rect.x + "%",
                    top: rect.y + "%",
                    width: `calc(${rect.w}% - 1px)`,
                    height: `calc(${rect.h}% - 1px)`,
                    zIndex: depth * 10 + (isDir ? 0 : 5),
                  }}
                  title={`${node.path} · ${humanSize(node.size)}`}
                  onClick={() => isDir && fitToRect(rect)}
                  onDoubleClick={() => !isDir && openEditor(node)}
                >
                  {showLabel && (
                    <div className="cm-label" style={{ fontSize: depth === 0 ? 11 : 10 }}>
                      {!isDir && <span className="cm-icon">{fileIcon(node.ext)}</span>}
                      <span className="cm-name">{node.name}</span>
                      <span className="cm-size">{humanSize(node.size)}</span>
                    </div>
                  )}
                  {!isDir && bigEnough && isImg && (
                    <img
                      className="cm-img"
                      loading="lazy"
                      src={api.rawUrl(dir, node.path)}
                      alt={node.name}
                    />
                  )}
                  {!isDir && bigEnough && !isImg && data?.type === "text" && (
                    <pre className="cm-code">{data.content?.slice(0, 4000)}</pre>
                  )}
                </div>
              );
            })}
          </div>
          <div className="cm-hint">
            wheel = zoom · middle-drag = pan · click folder = zoom in · double-click file = edit
          </div>
        </div>
      )}
    </div>
  );
}
